// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Extruded regions: the tile's strata, its terraces and (later) its water basins all come
 * from the same builder. See docs/geometry-spec.md §2.
 *
 * Every prism is a closed watertight solid: bottom cap, side walls, top cap. Walls are
 * vertical and caps are horizontal, so nothing here can overhang.
 */

import type { MaterialId } from '../palette/materials';
import type { Polygon } from '../core/polygon';
import { centroid, ensureCCW, insetPolygon, signedArea } from '../core/polygon';
import { hexCorners, type Vec2 } from '../core/hex';
import { MeshBuilder, type Solid } from './solid';

export interface PrismOptions {
  name: string;
  material: MaterialId;
  /** Bottom of the prism, in millimetres. */
  z0: number;
  /** Top of the prism, in millimetres. */
  z1: number;
  /**
   * 45° chamfer height at the bottom edge. Only meaningful for a polygon centred on the
   * origin, since it insets by scaling about the centroid. Used for elephant-foot compensation
   * on the band that touches the bed.
   */
  chamfer?: number;
}

/**
 * Closed prism from a counter-clockwise polygon.
 * Winding is counter-clockwise viewed from outside, so face normals point out.
 */
export function extrudePolygon(poly: Polygon, opts: PrismOptions): Solid {
  const ring = ensureCCW(poly);
  const [cx, cy] = centroid(ring);
  const b = new MeshBuilder();
  const { z0, z1 } = opts;
  const chamfer = usableChamfer(ring, opts.chamfer ?? 0);

  const at = (p: Vec2, z: number) => b.vertex(p[0], p[1], z);

  if (chamfer > 0) {
    // Inset ring at the bottom, then a true 45° rise out to the full profile. The inset
    // is a perpendicular edge offset, not a scale toward the centroid; on an irregular
    // terrace outline scaling would give a different chamfer angle on every face.
    const inset = insetPolygon(ring, chamfer);
    const bottom = inset.map((p) => at(p, z0));
    const knee = ring.map((p) => at(p, z0 + chamfer));
    const top = ring.map((p) => at(p, z1));

    b.fan(at([cx, cy], z0), bottom, true);
    b.wall(bottom, knee);
    b.wall(knee, top);
    b.fan(at([cx, cy], z1), top);
  } else {
    const bottom = ring.map((p) => at(p, z0));
    const top = ring.map((p) => at(p, z1));

    b.fan(at([cx, cy], z0), bottom, true);
    b.wall(bottom, top);
    b.fan(at([cx, cy], z1), top);
  }

  return b.build(opts.name, opts.material);
}

/**
 * Insetting a polygon that has a very short edge can fold it back on itself, which shows
 * up as a folded chamfer face. Drop the chamfer rather than emit bad geometry; on a
 * region small enough to trigger this, a 0.4 mm chamfer was never going to be visible.
 */
function usableChamfer(ring: Polygon, chamfer: number): number {
  if (chamfer <= 0) return 0;
  const area = signedArea(ring);
  const inset = insetPolygon(ring, chamfer);
  if (inset.length < 3) return 0;
  return signedArea(inset) > area * 0.5 ? chamfer : 0;
}

/** A full-tile hexagonal band, one of the tile's strata. */
export function hexBand(R: number, opts: PrismOptions): Solid {
  return extrudePolygon(hexCorners(R) as Polygon, opts);
}
