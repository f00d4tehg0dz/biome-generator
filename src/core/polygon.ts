// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Polygon helpers for terrace, water and path regions.
 *
 * Regions are generated as *star-shaped* radial polygons: a centre plus a radius per
 * angular step. That keeps them cheap to triangulate (a fan from the centre is always
 * valid) and gives the organic terrace outlines the references show, without a general
 * triangulator. Clipping is Sutherland–Hodgman against the hex, which is convex, so the
 * result stays well-defined.
 */

import type { Rng } from './rng';
import type { Vec2 } from './hex';

export type Polygon = Vec2[];

export interface RadialOptions {
  /** Centre in tile-local XY. */
  centre?: Vec2;
  /** Mean radius. */
  radius: number;
  /** Radius variation as a fraction of `radius`, 0..1. */
  wobble?: number;
  /** Number of vertices. Low counts keep the poly budget down and read as faceted. */
  sides?: number;
  /** Extra rotation in radians. */
  phase?: number;
}

/**
 * A closed, counter-clockwise, star-shaped polygon with smoothly varying radius.
 * The radius uses two low-frequency sine terms rather than per-vertex noise so the
 * outline stays smooth at low vertex counts instead of looking jagged.
 */
export function radialPolygon(rng: Rng, opts: RadialOptions): Polygon {
  const [cx, cy] = opts.centre ?? [0, 0];
  const sides = Math.max(5, Math.round(opts.sides ?? 11));
  const wobble = clamp(opts.wobble ?? 0.18, 0, 0.9);
  const phase = opts.phase ?? 0;

  const f1 = rng.int(2, 3);
  const f2 = rng.int(4, 6);
  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);
  const mix = rng.range(0.35, 0.65);

  const points: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = phase + (i / sides) * Math.PI * 2;
    const shape = mix * Math.sin(a * f1 + p1) + (1 - mix) * Math.sin(a * f2 + p2);
    const rad = opts.radius * (1 + wobble * shape);
    points.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return points;
}

/** Minimum distance from `centre` to the polygon's vertices. */
export function minRadius(poly: Polygon, centre: Vec2 = [0, 0]): number {
  let min = Infinity;
  for (const [x, y] of poly) min = Math.min(min, Math.hypot(x - centre[0], y - centre[1]));
  return min;
}

/** Maximum distance from `centre` to the polygon's vertices. */
export function maxRadius(poly: Polygon, centre: Vec2 = [0, 0]): number {
  let max = 0;
  for (const [x, y] of poly) max = Math.max(max, Math.hypot(x - centre[0], y - centre[1]));
  return max;
}

/** Signed area; positive when counter-clockwise. */
export function signedArea(poly: Polygon): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function ensureCCW(poly: Polygon): Polygon {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

export function centroid(poly: Polygon): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

/**
 * A half-plane `nx·x + ny·y <= d`, with (nx, ny) a unit outward normal.
 * A convex region is an intersection of these.
 */
export interface HalfPlane {
  nx: number;
  ny: number;
  d: number;
}

/** The six half-planes of a pointy-top hex, optionally inset by `margin` millimetres. */
export function hexHalfPlanes(R: number, margin = 0): HalfPlane[] {
  return hexHalfPlanesPerEdge(R, () => margin);
}

/**
 * The same six half-planes, with a margin chosen per neighbour direction, so a region can
 * be allowed to reach one seam while being held back from the others.
 *
 * The plane at angle 60·i faces neighbour direction `(6 - i) % 6`: the direction list and
 * the corner angles run opposite ways round, which is easy to get subtly wrong by eye.
 */
export function hexHalfPlanesPerEdge(
  R: number,
  marginFor: (direction: number) => number,
): HalfPlane[] {
  const planes: HalfPlane[] = [];
  const inradius = (R * Math.sqrt(3)) / 2;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    planes.push({ nx: Math.cos(a), ny: Math.sin(a), d: inradius - marginFor((6 - i) % 6) });
  }
  return planes;
}

/** Sutherland–Hodgman clip of a polygon against a convex region. */
export function clipToConvex(poly: Polygon, planes: readonly HalfPlane[]): Polygon {
  let out: Polygon = poly;
  for (const plane of planes) {
    if (out.length === 0) return out;
    out = clipToHalfPlane(out, plane);
  }
  return out;
}

function clipToHalfPlane(poly: Polygon, plane: HalfPlane): Polygon {
  const dist = (p: Vec2) => plane.nx * p[0] + plane.ny * p[1] - plane.d;
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = dist(a);
    const db = dist(b);
    const aIn = da <= 0;
    const bIn = db <= 0;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Distance from `p` to the segment `a`–`b` (to its ends, not the infinite line). */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/**
 * Drops vertices that leave the outline within `tolerance` of where it was.
 *
 * The guarantee is against the *replacement* chord, not against each vertex's immediate
 * neighbours. Judging a vertex against its neighbours and dropping every vertex that passes
 * in one sweep is not the same thing: on a gently sampled curve every single vertex is within
 * a hair of the chord between the two beside it, so the whole run goes and the outline
 * collapses to one long chord bowed by however much the curve bowed. That is unbounded, and
 * it showed up 0.35 mm out on a 0.05 mm tolerance, enough to widen a road where it crosses
 * a seam, which is precisely where two tiles have to agree.
 */
export function simplifyCollinear(poly: Polygon, tolerance = 0.15): Polygon {
  if (poly.length <= 3) return poly;

  const out: Polygon = [poly[0]!];
  let anchor = poly[0]!;
  let dropped: Vec2[] = [];

  for (let i = 1; i < poly.length; i++) {
    const cur = poly[i]!;
    if (dropped.every((p) => distanceToSegment(p, anchor, cur) <= tolerance)) {
      dropped.push(cur);
      continue;
    }
    // `cur` is one vertex too far. Keep the last one that still fitted and start again there.
    anchor = dropped[dropped.length - 1]!;
    out.push(anchor);
    dropped = [cur];
  }

  // The closing edge runs back to the first vertex, so the tail is judged against that chord.
  if (dropped.length > 0 && !dropped.every((p) => distanceToSegment(p, anchor, out[0]!) <= tolerance)) {
    out.push(dropped[dropped.length - 1]!);
  }

  return out.length >= 3 ? out : poly;
}

/**
 * Offsets every edge inward by exactly `distance`, by moving each vertex along its angle
 * bisector. Unlike scaling toward the centroid this is exact for irregular polygons, which
 * matters because the chamfer angle it produces has to be 45° on every face, not on average.
 *
 * Expects a counter-clockwise polygon. Vertices whose bisector is degenerate (a near-180°
 * spike) are left where they are rather than shot off to infinity.
 */
export function insetPolygon(poly: Polygon, distance: number): Polygon {
  if (distance === 0 || poly.length < 3) return poly;
  const n = poly.length;
  const out: Polygon = [];

  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!;
    const cur = poly[i]!;
    const next = poly[(i + 1) % n]!;

    const n1 = leftNormal(cur, prev, true);
    const n2 = leftNormal(cur, next, false);
    if (!n1 || !n2) {
      out.push(cur);
      continue;
    }

    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const len = Math.hypot(mx, my);
    if (len < 1e-9) {
      out.push(cur);
      continue;
    }
    mx /= len;
    my /= len;

    const project = mx * n1[0] + my * n1[1];
    if (Math.abs(project) < 1e-6) {
      out.push(cur);
      continue;
    }
    const step = distance / project;
    out.push([cur[0] + mx * step, cur[1] + my * step]);
  }
  return out;
}

/** Inward (left-hand) unit normal of the edge at `cur`, for a counter-clockwise polygon. */
function leftNormal(cur: Vec2, other: Vec2, incoming: boolean): Vec2 | null {
  const dx = incoming ? cur[0] - other[0] : other[0] - cur[0];
  const dy = incoming ? cur[1] - other[1] : other[1] - cur[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  return [-dy / len, dx / len];
}

/** Winding-number point-in-polygon test. Works for any simple polygon. */
export function polygonContains(poly: Polygon, [x, y]: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
