// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * What is where on a tile's top surface.
 *
 * Everything downstream (terraces, path routing, prop scatter) asks the same two
 * questions: how high is it here, and what kind of ground is this. Answering both from one
 * place keeps the geometry and the placement rules from drifting apart.
 */

import { hexInset, type Vec2 } from '../core/hex';
import { distanceToSegment, polygonContains, type Polygon } from '../core/polygon';
import { EDGE_MARGIN, GRADE, TERRACE_STEP } from '../kit/solid';
import { WATER_DROP } from '../kit/water';
import type { Terrace } from './terrain';

export type Zone = 'land' | 'water' | 'shore' | 'path' | 'cliff' | 'margin';

/** How deep a path sits below the surrounding ground. */
export const PATH_DROP = 0.4;
/** Band of land around a water body that counts as shore. */
export const SHORE_BAND = 8;
/** Band either side of a terrace wall that counts as cliff. */
export const CLIFF_BAND = 2;

export interface SurfaceInput {
  R: number;
  terraces: readonly Terrace[];
  water: Polygon | null;
  path: Polygon | null;
}

export class Surface {
  readonly R: number;
  readonly terraces: readonly Terrace[];
  readonly water: Polygon | null;
  readonly path: Polygon | null;

  constructor(input: SurfaceInput) {
    this.R = input.R;
    this.terraces = input.terraces;
    this.water = input.water;
    this.path = input.path;
  }

  /** Number of terrace steps under a point. */
  private terraceLevel(p: Vec2): number {
    let level = 0;
    for (const terrace of this.terraces) {
      if (polygonContains(terrace.polygon, p)) level = terrace.level;
    }
    return level;
  }

  /** Height of the walkable surface at a point, in millimetres. */
  heightAt(p: Vec2): number {
    if (this.water && polygonContains(this.water, p)) return GRADE - WATER_DROP;
    if (this.path && polygonContains(this.path, p)) return GRADE - PATH_DROP;
    return GRADE + this.terraceLevel(p) * TERRACE_STEP;
  }

  /**
   * True when the whole footprint of radius `radius` sits at one height.
   *
   * A prop's base is a flat disc. Centre it near a terrace step, a shoreline or the lip of a
   * path corridor and the disc straddles two levels: half of it floats. Testing the centre
   * alone cannot see that, because the centre is on perfectly good ground.
   */
  levelAcross(at: Vec2, radius: number): boolean {
    const height = this.heightAt(at);
    const SAMPLES = 10;
    for (let i = 0; i < SAMPLES; i++) {
      const angle = (i / SAMPLES) * Math.PI * 2;
      const edge: Vec2 = [at[0] + Math.cos(angle) * radius, at[1] + Math.sin(angle) * radius];
      if (Math.abs(this.heightAt(edge) - height) > 1e-6) return false;
    }
    return true;
  }

  zoneAt(p: Vec2): Zone {
    if (hexInset(p, this.R) < EDGE_MARGIN) return 'margin';
    if (this.water && polygonContains(this.water, p)) return 'water';
    if (this.path && polygonContains(this.path, p)) return 'path';
    if (this.nearBoundary(this.path, p, 2)) return 'path';
    if (this.water && this.nearBoundary(this.water, p, SHORE_BAND)) return 'shore';
    if (this.terraces.some((t) => this.nearBoundary(t.polygon, p, CLIFF_BAND))) return 'cliff';
    return 'land';
  }

  /** Distance from a polygon's edge, used for the shore and cliff bands. */
  private nearBoundary(polygon: Polygon | null, p: Vec2, band: number): boolean {
    if (!polygon) return false;
    return distanceToBoundary(polygon, p) < band;
  }
}

/** Shortest distance from a point to a polygon's boundary, unsigned. */
export function distanceToBoundary(polygon: Polygon, p: Vec2): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    best = Math.min(best, distanceToSegment(p, a, b));
  }
  return best;
}

/** Nearest point on a polygon's boundary, used to turn shore props to face the water. */
export function nearestBoundaryPoint(polygon: Polygon, p: Vec2): Vec2 {
  let best: Vec2 = polygon[0]!;
  let bestDistance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const candidate = closestOnSegment(p, a, b);
    const distance = Math.hypot(p[0] - candidate[0], p[1] - candidate[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return a;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + dx * t, a[1] + dy * t];
}

