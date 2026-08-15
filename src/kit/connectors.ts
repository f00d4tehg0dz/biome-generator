// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Tile connectors.
 *
 * Tiles print flat, top up, which makes any horizontally-protruding feature an unsupported
 * island. So a connector is extruded *vertically from z = 0* through the stone band only:
 * its underside is the print bed, it has no overhang at all, and the whole mechanism sits
 * below the soil band where nobody looks. See docs/geometry-spec.md §3.
 *
 * Gendering is positional. Directions 0, 1 and 2 carry the tab; 3, 4 and 5 carry the slot.
 * Direction `i` faces direction `(i + 3) % 6` on the neighbour, so every shared edge is
 * automatically one of each. No negotiation, no bookkeeping.
 */

import { edgeMidpoint, edgeNormal, edgeTangent, isMaleDirection, type Vec2 } from '../core/hex';
import { ensureCCW, insetPolygon, type Polygon } from '../core/polygon';

export type ConnectorKind = 'none' | 'dovetail';

/** Half-width of the dovetail at the seam. */
const NECK = 3.0;
/** Half-width at full depth, wider than the neck, so it resists being pulled apart. */
const HEAD = 4.5;
/** How far the tab protrudes, and how deep the slot is cut. */
export const DEPTH = 5.0;
/** How far the tab reaches back inside its own tile, so it fuses with the band. */
const ROOT = 1.0;
/** Sliding fit, per side, from the standard FDM tolerance figures. */
const CLEARANCE = 0.2;
/**
 * Extra slot depth, so the tab seats on its flanks rather than bottoming out. Cut to the
 * same depth as the tab protrudes and the two end planes coincide exactly: the joint reads
 * as closed on paper, and in practice the tiles stand a fraction apart at the seam.
 */
const BOTTOM_GAP = 0.5;
/** Height of the band the connector occupies. Matches BANDS.stoneTop. */
export const CONNECTOR_TOP = 5.0;

/** Maps a point in edge-local (along, outward) coordinates to tile space. */
function place(direction: number, R: number, along: number, outward: number): Vec2 {
  const [mx, my] = edgeMidpoint(direction, R);
  const [tx, ty] = edgeTangent(direction);
  const [nx, ny] = edgeNormal(direction);
  return [mx + tx * along + nx * outward, my + ty * along + ny * outward];
}

/**
 * The male half: a trapezoid widening as it leaves the tile. Emitted as its own solid that
 * overlaps the stone band by ROOT.
 */
export function connectorTab(direction: number, R: number): Polygon {
  return [
    place(direction, R, -NECK, -ROOT),
    place(direction, R, NECK, -ROOT),
    place(direction, R, HEAD, DEPTH),
    place(direction, R, -HEAD, DEPTH),
  ];
}

/**
 * The female half.
 *
 * Built as *the tab the facing neighbour will insert*, expressed in this tile's frame and
 * grown by one clearance with a perpendicular offset. Widening the half-widths by hand
 * instead would leave the clearance varying along the dovetail's taper (tight at the neck,
 * loose at the head) where an offset gives the same 0.2 mm everywhere.
 */
export function connectorSlot(direction: number, R: number): Polygon {
  // Extend along the tab's own taper rather than cutting deeper at the same head width:
  // otherwise the slot's flanks lean at a different angle from the tab's and the offset no
  // longer gives a uniform clearance.
  const deep = NECK + (HEAD - NECK) * ((DEPTH + BOTTOM_GAP + ROOT) / (DEPTH + ROOT));
  const incoming: Polygon = [
    place(direction, R, -NECK, ROOT),
    place(direction, R, NECK, ROOT),
    place(direction, R, deep, -(DEPTH + BOTTOM_GAP)),
    place(direction, R, -deep, -(DEPTH + BOTTOM_GAP)),
  ];
  return insetPolygon(ensureCCW(incoming), -CLEARANCE);
}

export interface ConnectorPlan {
  /** Tabs to add to the stone band, in tile space. */
  tabs: Polygon[];
  /** Slots to cut out of the stone band. */
  slots: Polygon[];
}

/**
 * Connectors go on every edge, not only the occupied ones: a printed set should let any tile
 * mate with any other. Note that a tab adds DEPTH to the tile's footprint, which the plate
 * layout has to allow for.
 */
export function planConnectors(kind: ConnectorKind, R: number): ConnectorPlan {
  if (kind === 'none') return { tabs: [], slots: [] };

  const tabs: Polygon[] = [];
  const slots: Polygon[] = [];
  for (let direction = 0; direction < 6; direction++) {
    if (isMaleDirection(direction)) tabs.push(connectorTab(direction, R));
    else slots.push(connectorSlot(direction, R));
  }
  return { tabs, slots };
}
