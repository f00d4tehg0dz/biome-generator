// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Prisms over regions that have holes.
 *
 * The tile's ground slab is a hexagon with a lake punched out of it, or a path corridor, or
 * both. `extrudePolygon` can only handle a star-shaped outline with a fan, so anything with
 * a hole needs a real triangulator, and three ships one (`ShapeUtils.triangulateShape`, the
 * ear-clipper behind `ShapeGeometry`), which saves adding a dependency for it.
 *
 * Winding is normalised here rather than trusted: the triangulator's output orientation is
 * not part of its contract, and a flipped cap is an inside-out solid.
 */

import { ShapeUtils, Vector2 } from 'three';
import type { MaterialId } from '../palette/materials';
import { ensureCCW, insetPolygon, signedArea, type Polygon } from '../core/polygon';
import type { Vec2 } from '../core/hex';
import { MeshBuilder, type Solid } from './solid';

export interface RegionOptions {
  name: string;
  material: MaterialId;
  z0: number;
  z1: number;
  /**
   * 45° chamfer at the bottom, as an inward offset of every ring, outward for holes, so a
   * hole widens downward rather than narrowing. Used both for elephant-foot compensation and
   * to keep a band's overlap with the one below it off the side walls.
   */
  chamfer?: number;
}

/**
 * A closed prism over `contour` with `holes` removed. Holes must lie inside the contour and
 * must not touch it or each other; the boolean layer guarantees that.
 */
export function extrudeRegion(
  contour: Polygon,
  holes: readonly Polygon[],
  options: RegionOptions,
): Solid {
  const outer = ensureCCW(contour);
  // Holes wound clockwise: then the same wall routine that gives the outer ring outward
  // normals gives each hole normals pointing into the void, which is outward for the solid.
  const inner = holes.map((hole) => (signedArea(hole) > 0 ? [...hole].reverse() : hole));

  const triangles = ShapeUtils.triangulateShape(
    outer.map(toVector2),
    inner.map((hole) => hole.map(toVector2)),
  );

  const rings = [outer, ...inner];
  const points: Vec2[] = rings.flat();
  const b = new MeshBuilder();
  const { z0, z1 } = options;
  const chamfer = usableChamfer(rings, options.chamfer ?? 0);

  const knee = chamfer > 0 ? z0 + chamfer : z0;
  const skirt = chamfer > 0 ? insetRings(rings, chamfer).flat() : points;

  const bottom = skirt.map((p) => b.vertex(p[0], p[1], z0));
  const middle = points.map((p) => b.vertex(p[0], p[1], knee));
  const top = points.map((p) => b.vertex(p[0], p[1], z1));

  for (const [a, c, d] of triangles) {
    const ccw = isCounterClockwise(points[a!]!, points[c!]!, points[d!]!);
    if (ccw) {
      b.tri(top[a!]!, top[c!]!, top[d!]!);
      b.tri(bottom[a!]!, bottom[d!]!, bottom[c!]!);
    } else {
      b.tri(top[a!]!, top[d!]!, top[c!]!);
      b.tri(bottom[a!]!, bottom[c!]!, bottom[d!]!);
    }
  }

  let offset = 0;
  for (const ring of rings) {
    const indices = ring.map((_, i) => offset + i);
    if (chamfer > 0) {
      b.wall(
        indices.map((i) => bottom[i]!),
        indices.map((i) => middle[i]!),
      );
    }
    b.wall(
      indices.map((i) => (chamfer > 0 ? middle[i]! : bottom[i]!)),
      indices.map((i) => top[i]!),
    );
    offset += ring.length;
  }

  return b.build(options.name, options.material);
}

/** Contour inward, holes outward, both by the same perpendicular distance. */
function insetRings(rings: readonly Polygon[], distance: number): Polygon[] {
  return rings.map((ring, index) => insetPolygon(ring, index === 0 ? distance : -distance));
}

/**
 * A chamfer that would fold a ring back on itself is dropped rather than emitted. Connector
 * slots put reflex corners in the outline, and a small enough feature there cannot carry an
 * offset.
 */
function usableChamfer(rings: readonly Polygon[], chamfer: number): number {
  if (chamfer <= 0) return 0;
  const inset = insetRings(rings, chamfer);
  for (let i = 0; i < rings.length; i++) {
    const before = Math.abs(signedArea(rings[i]!));
    const after = Math.abs(signedArea(inset[i]!));
    if (inset[i]!.length !== rings[i]!.length) return 0;
    if (i === 0 ? after < before * 0.5 : after > before * 2) return 0;
  }
  return chamfer;
}

function toVector2(p: Vec2): Vector2 {
  return new Vector2(p[0], p[1]);
}

function isCounterClockwise(a: Vec2, b: Vec2, c: Vec2): boolean {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
}
