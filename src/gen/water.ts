// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Water bodies.
 *
 * A body either sits inside the tile with land all the way round, or runs off one or more
 * edges to meet a neighbour. Which it does is not the tile's choice. It is whatever the
 * edge contract handed it, and both sides of a `water` seam were told the same thing.
 *
 * An open body is built by centring the shape *outside* the tile, on the far side of the
 * edges it has to reach, and clipping it to the hexagon. The shoreline is then the part of
 * the shape's own outline that fell inside, which curves naturally, and the seam is a clean
 * straight cut exactly on the tile boundary.
 */

import type { Rng } from '../core/rng';
import { edgeCorners, edgeMidpoint, hexCorners, inradius, type Vec2 } from '../core/hex';
import {
  clipToConvex,
  hexHalfPlanes,
  hexHalfPlanesPerEdge,
  maxRadius,
  polygonContains,
  radialPolygon,
  simplifyCollinear,
  type Polygon,
} from '../core/polygon';
import { EDGE_MARGIN } from '../kit/solid';
import { directionsWith, type EdgeType } from './edges';

export interface WaterSpec {
  /** Fraction of the tile's usable radius an interior body spans, 0..1. */
  coverage: number;
  /** How far off centre an interior body may sit, as a fraction of the usable radius. */
  drift: number;
}

/** Land kept between an interior body and the tile edge, so a shore always exists. */
export const SHORE_MARGIN = 4;
/** How wide the water has to be where it crosses a seam, so two tiles read as one body. */
export const MIN_SEAM_BAND = 12;
/** How far a body overshoots the seams it opens onto, keeping the booleans non-degenerate. */
export const SEAM_OVERSHOOT = 3;

export function generateWater(
  rng: Rng,
  spec: WaterSpec | null,
  R: number,
  edges: readonly EdgeType[],
): Polygon | null {
  if (!spec) return null;

  const open = directionsWith(edges, 'water');
  if (open.length > 0) return openWater(rng, R, open);

  // A `shore` seam means the neighbour has no water of its own; the body leans that way so
  // the beach reads as continuous, but stops short of the boundary.
  return interiorWater(rng, spec, R, directionsWith(edges, 'shore'));
}

function interiorWater(rng: Rng, spec: WaterSpec, R: number, lean: readonly number[]): Polygon | null {
  const usable = inradius(R) - EDGE_MARGIN - SHORE_MARGIN;
  const bias = lean.length > 0 ? average(lean.map((d) => edgeMidpoint(d, 1))) : null;

  const drift = rng.range(bias ? usable * 0.2 : 0, usable * spec.drift);
  const angle = bias ? Math.atan2(bias[1], bias[0]) + rng.range(-0.5, 0.5) : rng.range(0, Math.PI * 2);
  const centre: Vec2 = [Math.cos(angle) * drift, Math.sin(angle) * drift];

  const radius = (usable - drift) * spec.coverage;
  if (radius < 8) return null;

  const raw = radialPolygon(rng, {
    centre,
    radius,
    wobble: rng.range(0.16, 0.3),
    sides: rng.pick([11, 13]),
    phase: rng.range(0, Math.PI * 2),
  });

  const clipped = simplifyCollinear(clipToConvex(raw, hexHalfPlanes(R, EDGE_MARGIN + SHORE_MARGIN)));
  if (clipped.length < 5) return null;
  // A body that had to be clipped hard is a crescent hugging the margin, not a pool.
  if (maxRadius(clipped, centre) < radius * 0.55) return null;
  return clipped;
}

/**
 * Water that runs off one or more seams: a radial function about the tile centre, not a
 * union of shapes.
 *
 * Within the 60° an open seam subtends, the radius is whatever reaches past that edge;
 * elsewhere it is a wobbling central pool. Taking the pointwise maximum makes the body one
 * connected piece by definition and covers every open seam corner to corner analytically,
 * rather than by retrying until it happens to hold.
 *
 * Two earlier attempts are worth remembering. The first placed one blob outside the tile and
 * hoped it reached far enough, giving up after a few tries, and giving up is not an option
 * here: the tile across a `water` seam has already been told water arrives and delivers its
 * half regardless, so a tile that quietly produced none left the neighbour's bay running
 * into a sand wall. The second unioned a wedge per seam, which was correct but put a polygon
 * boolean on the critical path; polygon-clipping answered with "unable to complete output
 * ring" on one board and a stack overflow on the next. A radial function needs no boolean.
 *
 * The body is left overshooting the seams it opens onto rather than trimmed flush to them:
 * a cutter whose boundary lies exactly on the hexagon's is the degenerate case for the
 * boolean that *does* still run, when the ground slab is punched. The fill is clipped to the
 * tile; the cutter is not.
 */
function openWater(rng: Rng, R: number, open: readonly number[]): Polygon | null {
  const SIDES = 66;
  const reach = inradius(R) + SEAM_OVERSHOOT;
  const poolRadius = R * rng.range(0.3, 0.42);
  const poolWobble = rng.range(0.12, 0.26);
  const poolPhase = rng.range(0, Math.PI * 2);
  const bulgePhase = rng.range(0, Math.PI * 2);

  // Outward bearing of each open seam.
  const headings = open.map((direction) => {
    const [mx, my] = edgeMidpoint(direction, 1);
    return Math.atan2(my, mx);
  });

  const points: Vec2[] = [];
  for (let i = 0; i < SIDES; i++) {
    const theta = (i / SIDES) * Math.PI * 2;
    let radius = poolRadius * (1 + poolWobble * Math.sin(theta * 3 + poolPhase));

    for (const heading of headings) {
      const offset = Math.abs(wrapAngle(theta - heading));
      if (offset >= Math.PI / 6) continue;
      // Distance from the centre to that seam's line along this bearing. The bulge only ever
      // adds, so the shore can wander without ever pulling back off the seam.
      const bulge = 1 + 0.05 * (1 + Math.sin(theta * 4 + bulgePhase));
      radius = Math.max(radius, (reach / Math.cos(offset)) * bulge);
    }

    points.push([Math.cos(theta) * radius, Math.sin(theta) * radius]);
  }

  // A body reaches the seams it was given and *only* those: the neighbour across a `land`
  // seam is presenting dry ground, and water arriving there would run into a wall. So the
  // clipping margin is per edge: negative where the contract said water, a shore's width
  // everywhere else.
  const openSet = new Set(open);
  const planes = hexHalfPlanesPerEdge(R, (direction) =>
    openSet.has(direction) ? -SEAM_OVERSHOOT : EDGE_MARGIN + SHORE_MARGIN,
  );

  const clipped = simplifyCollinear(clipToConvex(points, planes), 0.05);
  return clipped.length >= 4 ? clipped : null;
}

/** Wraps an angle to (−π, π]. */
function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * How much of an edge the polygon covers, in millimetres: the width of the band a
 * neighbouring tile will see arriving at the seam.
 */
export function seamBand(polygon: Polygon, direction: number, R: number): number {
  const [a, b] = edgeCorners(direction, R);
  const STEPS = 48;
  const edgeLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let longest = 0;
  let run = 0;

  // Sample the midpoint of each of STEPS equal sub-spans, so a fully covered edge reports
  // exactly its own length rather than one sample's worth more.
  for (let i = 0; i < STEPS; i++) {
    const t = (i + 0.5) / STEPS;
    const point: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    // Nudge inward so a point exactly on the boundary is not a coin flip.
    const inward: Vec2 = [point[0] * 0.999, point[1] * 0.999];
    if (polygonContains(polygon, inward)) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  return (longest / STEPS) * edgeLength;
}

/** The hexagon itself, for boolean work. */
export function hexPolygon(R: number): Polygon {
  return hexCorners(R) as Polygon;
}

function average(points: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}
