// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Terrace generation.
 *
 * Terraces are nested star-shaped polygons around a shared peak centre. Each one is a
 * closed prism stepping *inward* as it rises, so a terrace can never overhang the step
 * below it, so the 45° rule is satisfied by construction rather than by checking after the
 * fact. See docs/geometry-spec.md §2.2.
 */

import type { Rng } from '../core/rng';
import { inradius, type Vec2 } from '../core/hex';
import {
  centroid,
  clipToConvex,
  hexHalfPlanes,
  maxRadius,
  minRadius,
  polygonContains,
  radialPolygon,
  simplifyCollinear,
  type Polygon,
} from '../core/polygon';
import { EDGE_MARGIN, MAX_TERRACES } from '../kit/solid';
import type { BiomeTerrain } from './biomes';

export interface Terrace {
  /** 1-based: terrace 1 sits one step above grade. */
  level: number;
  polygon: Polygon;
}

/** Vertical clearance kept between a terrace ring and the one containing it. */
const NEST_CLEARANCE = 2.5;

/**
 * Terrace steps for a tile. `relief` is the *mean* number of steps as a fraction of the
 * maximum, so a biome quoting 0.1 gets a step on roughly four tiles in ten and is otherwise
 * flat, which is what the reference park actually is.
 */
export function terraceCount(rng: Rng, terrain: BiomeTerrain): number {
  const expected = terrain.relief * MAX_TERRACES;
  const whole = Math.floor(expected);
  return clamp(whole + (rng.chance(expected - whole) ? 1 : 0), 0, MAX_TERRACES);
}

/**
 * Terraces come last, after water and the path, and give way to both.
 *
 * A path has to reach two tile edges; a landform only has to be somewhere. Generating the
 * terraces first and asking the path to dodge them meant almost every route was blocked, so
 * the constraint runs the other way: the terrace tries several peaks and takes the first
 * that leaves the existing features alone.
 */
export function generateTerraces(
  rng: Rng,
  terrain: BiomeTerrain,
  R: number,
  obstacles: readonly Polygon[] = [],
): Terrace[] {
  const count = terraceCount(rng, terrain);
  if (count === 0) return [];

  const usable = inradius(R) - EDGE_MARGIN;
  const planes = hexHalfPlanes(R, EDGE_MARGIN);
  const wobble = 0.1 + terrain.roughness * 0.18;

  // All terraces share one off-centre peak, which is what makes a tile read as a single
  // landform instead of a pile of unrelated steps. With features already on the ground the
  // peak is pushed away from them, so the landform rises clear of the shore or the road.
  const away = obstacles.length > 0 ? centroid(obstacles.flat()) : null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const peakAngle = away
      ? Math.atan2(-away[1], -away[0]) + rng.range(-1.1, 1.1)
      : rng.range(0, Math.PI * 2);
    const peakDistance = rng.range(away ? usable * 0.3 : 0, usable * (away ? 0.62 : 0.3));
    const peak: Vec2 = [Math.cos(peakAngle) * peakDistance, Math.sin(peakAngle) * peakDistance];

    const terraces: Terrace[] = [];
    let ceiling = usable - peakDistance;

    for (let level = 1; level <= count; level++) {
      const shrink = level === 1 ? rng.range(0.62, 0.78) : rng.range(0.55, 0.72);
      const radius = Math.min(ceiling * shrink, ceiling / (1 + wobble) - NEST_CLEARANCE);
      if (radius < 6) break;

      const raw = radialPolygon(rng, {
        centre: peak,
        radius,
        wobble,
        sides: rng.pick([11, 13]),
        phase: rng.range(0, Math.PI * 2),
      });
      const clipped = simplifyCollinear(clipToConvex(raw, planes));
      if (clipped.length < 3) break;
      // A terrace reaching the water would put a cliff wall in the pool, and one crossing
      // the path would put a step in the road. Stop the landform rather than clip it; a
      // truncated terrace reads as a mistake.
      if (obstacles.some((obstacle) => overlaps(clipped, obstacle))) break;

      terraces.push({ level, polygon: clipped });

      // The next terrace must fit inside this one with clearance to spare.
      ceiling = minRadius(clipped, peak) - NEST_CLEARANCE;
      if (ceiling < 8) break;
    }

    if (terraces.length > 0) return terraces;
  }

  return [];
}

/** Largest radius any terrace reaches, used for framing and sanity checks. */
export function terraceFootprint(terraces: readonly Terrace[]): number {
  return terraces.reduce((max, t) => Math.max(max, maxRadius(t.polygon)), 0);
}

/**
 * Cheap overlap test for two simple polygons: either contains a vertex of the other, or
 * their boundaries cross. Enough for "does this terrace reach the pool".
 */
function overlaps(a: Polygon, b: Polygon): boolean {
  if (a.some((p) => polygonContains(b, p))) return true;
  if (b.some((p) => polygonContains(a, p))) return true;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a1, a2, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  return false;
}

function segmentsCross(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d = (a: Vec2, b: Vec2, c: Vec2) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
