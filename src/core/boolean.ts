// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Polygon booleans.
 *
 * Up to M3 every region was either star-shaped (fan-triangulable) or a clean hole, so
 * clipping against the convex hex was enough. Open shorelines break that: a bay that runs
 * off the tile edge is the hexagon *minus* a shape that crosses its boundary, and so is a
 * connector slot. That is a genuine boolean, degeneracies included: two corridors meeting
 * at a junction, a slot sitting exactly on the outline. So it uses a proven Martinez-Rueda
 * implementation rather than a hand-rolled one.
 *
 * This module is the only place that knows about the library's shape conventions.
 */

import * as clippingModule from 'polygon-clipping';
import type { Polygon } from './polygon';
import { ensureCCW, signedArea } from './polygon';

/** A region that may have holes, and may be one of several disjoint pieces. */
export interface Region {
  contour: Polygon;
  holes: Polygon[];
}

type Ring = [number, number][];
type Poly = Ring[];
type MultiPoly = Poly[];
type Geom = Poly | MultiPoly;

interface ClippingApi {
  union(geom: Geom, ...geoms: Geom[]): MultiPoly;
  intersection(geom: Geom, ...geoms: Geom[]): MultiPoly;
  difference(geom: Geom, ...geoms: Geom[]): MultiPoly;
}

/**
 * polygon-clipping 0.15's ESM build exports a single default object while its type
 * declarations promise named exports; the two disagree, so which one a given bundler hands
 * back depends on its interop. Resolve it once, here, rather than discovering it per call
 * site when one runner works and another throws.
 */
const clipping: ClippingApi = ((clippingModule as unknown as { default?: ClippingApi }).default ??
  clippingModule) as unknown as ClippingApi;

function toRing(polygon: Polygon): Ring {
  const ring: Ring = polygon.map((p) => [p[0], p[1]]);
  // polygon-clipping wants closed rings.
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

function fromRing(ring: readonly (readonly number[])[]): Polygon {
  const out: Polygon = ring.map((p) => [p[0]!, p[1]!] as const);
  // Drop the repeated closing vertex the library emits.
  const first = out[0]!;
  const last = out[out.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) out.pop();
  return out;
}

function toRegions(result: readonly (readonly (readonly (readonly number[])[])[])[]): Region[] {
  const regions: Region[] = [];
  for (const polygon of result) {
    const rings = polygon.map(fromRing).filter((ring) => ring.length >= 3);
    const [contour, ...holes] = rings;
    if (!contour) continue;
    // Slivers below a nozzle width would print as nothing; they only add triangles.
    if (Math.abs(signedArea(contour)) < 0.25) continue;
    regions.push({
      contour: ensureCCW(contour),
      holes: holes.filter((hole) => Math.abs(signedArea(hole)) >= 0.25).map(ensureCCW),
    });
  }
  return regions;
}

/** `subject` with every cutter removed. May return several pieces, each possibly holed. */
export function subtract(subject: Polygon, cutters: readonly Polygon[]): Region[] {
  const live = cutters.filter((cutter) => cutter.length >= 3);
  if (live.length === 0) return [{ contour: ensureCCW(subject), holes: [] }];
  return toRegions(clipping.difference([toRing(subject)], live.map((c) => [toRing(c)])));
}

/** The parts of `subject` that lie inside `clip`. */
export function intersect(subject: Polygon, clip: Polygon): Region[] {
  return toRegions(clipping.intersection([toRing(subject)], [[toRing(clip)]]));
}

/**
 * All the polygons merged into as few pieces as possible.
 *
 * A single polygon still goes through the clipper rather than being passed straight back:
 * a swept corridor whose centre line curves tighter than its own half-width folds over
 * itself, and only the boolean pass resolves that into a simple outline. Short-circuiting
 * the one-polygon case left those folds in the mesh unnoticed.
 */
export function unite(polygons: readonly Polygon[]): Region[] {
  const live = polygons.filter((p) => p.length >= 3);
  if (live.length === 0) return [];
  const [first, ...rest] = live;
  return toRegions(clipping.union([toRing(first!)], rest.map((p) => [toRing(p)])));
}

/** Total area of a region set, holes discounted. */
export function regionArea(regions: readonly Region[]): number {
  return regions.reduce(
    (sum, region) =>
      sum +
      Math.abs(signedArea(region.contour)) -
      region.holes.reduce((holeSum, hole) => holeSum + Math.abs(signedArea(hole)), 0),
    0,
  );
}
