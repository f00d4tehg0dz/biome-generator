// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Point-in-solid testing, by ray casting straight up and counting crossings.
 *
 * This is what makes the overhang check honest. A prop is several solids that interpenetrate
 * (a canopy sunk into its trunk, a snow cap sunk into a peak) and the downward faces where
 * they meet are buried inside the union. They need no support, because they are not part of
 * the printed surface at all. Exempting them by rule ("ignore bottom caps") would also
 * exempt real overhangs; testing whether they are actually enclosed does not.
 */

import type { BufferAttribute, InterleavedBufferAttribute } from 'three';
import type { Solid } from '../kit/solid';

type Point = readonly [number, number, number];
type Point3 = [number, number, number];
type PositionAttribute = BufferAttribute | InterleavedBufferAttribute;

/** Barycentric coordinates of (x, y) in a triangle's XY projection, or null if outside. */
export function barycentric(
  a: Point,
  b: Point,
  c: Point,
  x: number,
  y: number,
): Point3 | null {
  const area = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(area) < 1e-9) return null;
  const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / area;
  const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / area;
  const w = 1 - u - v;
  if (u < -1e-9 || v < -1e-9 || w < -1e-9) return null;
  return [u, v, w];
}

/**
 * True when `point` lies strictly inside `solid`. Assumes a closed manifold mesh, which
 * every kit builder guarantees and `checkGeometry` verifies.
 */
export function pointInSolid(solid: Solid, point: Point): boolean {
  const geometry = solid.geometry;
  const position = geometry.getAttribute('position') as PositionAttribute;
  const index = geometry.getIndex();
  if (!index) return false;

  const box = geometry.boundingBox;
  if (box) {
    if (point[0] < box.min.x || point[0] > box.max.x) return false;
    if (point[1] < box.min.y || point[1] > box.max.y) return false;
    if (point[2] < box.min.z || point[2] > box.max.z) return false;
  }

  // Nudge the ray off any axis of symmetry. A ray fired straight up from a lathe's own
  // axis passes exactly through the apex vertex shared by every cap triangle, and the
  // barycentric test on that boundary is a coin flip: it miscounts crossings and reports
  // a solid centre as outside. The offset is four orders of magnitude below MIN_FEATURE.
  const rx = point[0] + 1.7e-4;
  const ry = point[1] + 0.9e-4;

  let crossings = 0;
  for (let t = 0; t < index.count / 3; t++) {
    const a = index.getX(t * 3);
    const b = index.getX(t * 3 + 1);
    const c = index.getX(t * 3 + 2);

    const ax = position.getX(a);
    const ay = position.getY(a);
    const bx = position.getX(b);
    const by = position.getY(b);
    const cx = position.getX(c);
    const cy = position.getY(c);

    // Barycentric coordinates of the ray's (x, y) within the triangle's XY projection.
    const area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(area) < 1e-9) continue; // vertical face, projects to a line

    const u = ((by - cy) * (rx - cx) + (cx - bx) * (ry - cy)) / area;
    const v = ((cy - ay) * (rx - cx) + (ax - cx) * (ry - cy)) / area;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;

    const z = u * position.getZ(a) + v * position.getZ(b) + w * position.getZ(c);
    if (z > point[2]) crossings++;
  }

  return crossings % 2 === 1;
}

/** True when `point` lies inside any solid other than the one at `exclude`. */
export function insideAnyOther(solids: readonly Solid[], exclude: number, point: Point): boolean {
  for (let i = 0; i < solids.length; i++) {
    if (i === exclude) continue;
    if (pointInSolid(solids[i]!, point)) return true;
  }
  return false;
}

/** True when `point` lies inside any solid at all. */
export function insideAny(solids: readonly Solid[], point: Point): boolean {
  return solids.some((solid) => pointInSolid(solid, point));
}

export interface FloatingReport {
  ok: boolean;
  /** Names of solids that neither touch the ground nor embed in another solid. */
  floating: string[];
}

/**
 * Every solid must rest at z = 0 or embed into another solid. A solid that does neither
 * prints as a loose object rattling around the plate.
 */
export function checkFloating(solids: readonly Solid[], groundZ = 0, tolerance = 0.05): FloatingReport {
  const floating: string[] = [];

  for (let i = 0; i < solids.length; i++) {
    const solid = solids[i]!;
    solid.geometry.computeBoundingBox();
    const box = solid.geometry.boundingBox!;
    if (box.min.z <= groundZ + tolerance) continue;
    if (isSupported(solids, i, box.min.z)) continue;
    floating.push(solid.name);
  }

  return { ok: floating.length === 0, floating };
}

/**
 * Does anything hold this solid up?
 *
 * Sampling the solid's own underside on a fixed grid is unreliable: a bench seat contacts
 * its legs over a couple of millimetres and every grid point can straddle them. Instead,
 * for each sibling that could possibly touch, sample where the two actually overlap in
 * plan. That puts the samples exactly where contact must be if it exists.
 */
function isSupported(solids: readonly Solid[], index: number, baseZ: number): boolean {
  const solid = solids[index]!;
  const box = solid.geometry.boundingBox!;

  for (let j = 0; j < solids.length; j++) {
    if (j === index) continue;
    const other = solids[j]!;
    other.geometry.computeBoundingBox();
    const otherBox = other.geometry.boundingBox!;
    if (otherBox.max.z < baseZ || otherBox.min.z > baseZ + 0.5) continue;

    const minX = Math.max(box.min.x, otherBox.min.x);
    const maxX = Math.min(box.max.x, otherBox.max.x);
    const minY = Math.max(box.min.y, otherBox.min.y);
    const maxY = Math.min(box.max.y, otherBox.max.y);
    if (minX > maxX || minY > maxY) continue;

    const STEPS = 4;
    for (let a = 0; a <= STEPS; a++) {
      for (let b = 0; b <= STEPS; b++) {
        const point: Point = [
          minX + ((maxX - minX) * a) / STEPS,
          minY + ((maxY - minY) * b) / STEPS,
          baseZ + 0.05,
        ];
        if (pointInSolid(other, point) && pointInSolid(solid, point)) return true;
      }
    }
  }

  // Fall back to the solid's own lowest vertices, which catches attachments its bounding
  // box overlap does not describe well.
  if (lowestPoints(solid).some((point) => insideAnyOther(solids, index, point))) return true;

  // Last, and only for something about to be called floating: walk the underside itself.
  return undersidePoints(solid).some((point) => insideAnyOther(solids, index, point));
}

/**
 * The solid's lowest vertices, nudged up for the inside test.
 *
 * Cheap, and enough for most props, whose contact with their host is at a vertex. It is not
 * enough for a part carried in the middle of its underside. See `undersidePoints`.
 */
function lowestPoints(solid: Solid): Point[] {
  const position = solid.geometry.getAttribute('position') as PositionAttribute;
  let minZ = Infinity;
  for (let i = 0; i < position.count; i++) minZ = Math.min(minZ, position.getZ(i));

  const points: Point[] = [];
  for (let i = 0; i < position.count && points.length < 24; i++) {
    const z = position.getZ(i);
    if (z <= minZ + 0.5) points.push([position.getX(i), position.getY(i), z + 0.05]);
  }
  return points;
}

/** Spacing of the underside sweep, in millimetres. Below the narrowest leg in the kit. */
const UNDERSIDE_STEP = 0.5;

/**
 * Samples spread over the faces the solid actually rests on.
 *
 * A bench seat touches its legs in the middle of its underside and every one of its bottom
 * corners overhangs into thin air, so vertices miss the contact entirely. A grid over the
 * bounding box misses it too as soon as the bench is rotated, which is every bench on a
 * tile, and none in the kit tests, so this read a scattered bench as floating while the same
 * bench on its gallery pad passed. Walking the underside triangles keeps the samples on the
 * part however it is turned.
 */
function undersidePoints(solid: Solid): Point[] {
  const position = solid.geometry.getAttribute('position') as PositionAttribute;
  const index = solid.geometry.getIndex();
  if (!index) return [];

  let minZ = Infinity;
  for (let i = 0; i < position.count; i++) minZ = Math.min(minZ, position.getZ(i));

  const points: Point[] = [];
  for (let t = 0; t < index.count / 3; t++) {
    const a = corner(position, index.getX(t * 3));
    const b = corner(position, index.getX(t * 3 + 1));
    const c = corner(position, index.getX(t * 3 + 2));
    if (Math.min(a[2], b[2], c[2]) > minZ + 0.5) continue;

    for (let x = Math.min(a[0], b[0], c[0]); x <= Math.max(a[0], b[0], c[0]); x += UNDERSIDE_STEP) {
      for (let y = Math.min(a[1], b[1], c[1]); y <= Math.max(a[1], b[1], c[1]); y += UNDERSIDE_STEP) {
        const bary = barycentric(a, b, c, x, y);
        if (!bary) continue;
        points.push([x, y, bary[0] * a[2] + bary[1] * b[2] + bary[2] * c[2] + 0.05]);
      }
    }
  }
  return points;
}

function corner(position: PositionAttribute, i: number): Point3 {
  return [position.getX(i), position.getY(i), position.getZ(i)];
}
