// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Cross-section strength: will a member carry what stands on it, or snap off?
 *
 * The bounding-box check in `features.ts` cannot answer this. A tree's box is its canopy, so
 * a 1.8 mm trunk under a 15 mm crown measures 15 mm and passes clean — and then breaks off
 * in your fingers taking the canopy with it. What matters is not how big a prop is, but how
 * thin it gets where it is still carrying something.
 *
 * So: slice the prop horizontally, measure each separate island in the slice, and compare
 * the *smallest island* against the volume standing above that height. The volume comes free
 * — section area integrated over height is volume — and it is what makes the rule fair to a
 * taper. A sapling's tip has almost no section but carries almost nothing, so it is not a
 * weakness. A trunk at mid-height carries a whole canopy, so it is.
 *
 * Two things this has to get right or it lies:
 *
 *  - **Measure the union, not each solid.** A prop's parts interpenetrate by design — the
 *    crown's foot is buried inside the trunk, the mushroom's cap inside its stem. Measured
 *    alone, a crown looks like it stands on its own 1.5 mm neck. Printed, that neck is
 *    inside the trunk and the trunk is what carries it.
 *  - **Only horizontal slices**, which means this speaks to uprights: trunks, stems, posts,
 *    legs, and branches steep enough to matter. A horizontal member either rests on the
 *    ground along its length or is a bridge, and `MAX_BRIDGE` governs those.
 */

import { unite, regionArea } from '../core/boolean';
import { polygonContains, type Polygon } from '../core/polygon';
import type { Solid } from '../kit/solid';

/** Slice spacing. Fine enough to land inside a 1 mm feature, coarse enough to stay cheap. */
const STEP = 0.25;

/** Endpoint matching when chaining segments into loops: the mesh is welded to 1e-4 mm. */
const QUANTUM = 1e3;

/**
 * Material above a slice, below which the slice is not carrying anything worth carrying.
 *
 * This is what exempts a taper. Roughly a 2 mm cube of plastic: less than that standing on a
 * thin section is a tip, not a load.
 */
export const CARRIED_VOLUME = 8;

/**
 * How much height a section has to stay thin over before it counts as a neck.
 *
 * Slicing horizontally, the bottom edge of a near-horizontal member — a signpost's plate, a
 * bench's seat — cuts as a hairline sliver for one or two slices before widening into the
 * full plank. That sliver is an artefact of the slicing direction, not a weakness: nothing
 * is hanging from it. A real neck is thin for its whole length.
 */
const NECK_RUN = 1.0;

export interface Weakness {
  /** Narrowest island in the slice, as the side of the equivalent square, in mm. */
  thickness: number;
  /** Height it occurs at, in mm. */
  z: number;
  /** Volume standing above that height, in mm³. */
  carrying: number;
}

/**
 * The weakest loaded section in a prop, or null if nothing in it carries a load — a rock, a
 * plank, a lily pad.
 *
 * Takes the whole prop, not one solid, because the print is their union.
 */
export function weakestSection(
  solids: readonly Solid[],
  { carriedVolume = CARRIED_VOLUME, groundZ = 0 } = {},
): Weakness | null {
  const triangles = solids.flatMap(trianglesOf);
  if (triangles.length === 0) return null;

  let low = Infinity;
  let high = -Infinity;
  for (const t of triangles) {
    for (const p of t) {
      low = Math.min(low, p[2]);
      high = Math.max(high, p[2]);
    }
  }
  if (!(high > low)) return null;

  // Sample between the extremes rather than at them: a slice exactly at a flat cap crosses
  // no triangle edge and reads as empty.
  const slices: { z: number; smallest: number; total: number }[] = [];
  for (let z = low + STEP / 2; z < high; z += STEP) {
    const islands = islandsAt(triangles, z);
    if (islands.length === 0) continue;
    slices.push({
      z,
      smallest: Math.min(...islands),
      total: islands.reduce((sum, area) => sum + area, 0),
    });
  }
  if (slices.length === 0) return null;

  // Volume above each slice, by integrating the section area upward.
  const above: number[] = new Array(slices.length).fill(0);
  for (let i = slices.length - 2; i >= 0; i--) {
    above[i] = above[i + 1]! + slices[i + 1]!.total * STEP;
  }

  // Widen every slice to the thickest of its neighbours within NECK_RUN before judging it.
  // A one-slice sliver is replaced by the plank it belongs to; a trunk, thin for its whole
  // length, is unchanged. (A grayscale opening, in the morphology sense.)
  const reach = Math.max(1, Math.round(NECK_RUN / 2 / STEP));

  let worst: Weakness | null = null;
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i]!;
    // Share the load out between the islands holding it, by area. Charging the thinnest
    // island for all of it is wrong wherever a prop stands on more than one thing: a clump of
    // five reeds had each reed carrying all five, and a pair of posts each carrying the whole
    // roof. Proportional is not exact — a post nearer the load takes more — but it is the
    // difference between a rule that means something and one that flags every clump.
    const carrying = (above[i]! * slice.smallest) / slice.total;
    // Below the ground the prop is fused into the tile it stands on, so its section there is
    // not carrying anything on its own account.
    if (slice.z < groundZ) continue;
    if (carrying < carriedVolume) continue;

    let neck = slice.smallest;
    for (let j = Math.max(0, i - reach); j <= Math.min(slices.length - 1, i + reach); j++) {
      neck = Math.max(neck, slices[j]!.smallest);
    }

    // Reported as the side of the equivalent square, which is a number you can hold against
    // a wall thickness without converting anything in your head.
    const thickness = Math.sqrt(neck);
    if (!worst || thickness < worst.thickness) worst = { thickness, z: slice.z, carrying };
  }
  return worst;
}

/** Areas of the separate islands of material the plane `z` cuts through. */
function islandsAt(triangles: readonly Triangle[], z: number): number[] {
  const loops = loopsAt(triangles, z);
  if (loops.length === 0) return [];

  const solidLoops = loops.filter((loop) => loop.area > 0);
  const holes = loops.filter((loop) => loop.area < 0);
  if (solidLoops.length === 0) return [];

  // The overwhelmingly common case: one part, no bore. Not worth a boolean.
  if (solidLoops.length === 1 && holes.length === 0) return [solidLoops[0]!.area];

  const regions = unite(solidLoops.map((loop) => loop.ring));
  return regions.map((region) => {
    let area = regionArea([region]);
    // A bore cut by the mesh itself — a well's bucket — is a hole in whichever region
    // contains it, and hollowing a section is exactly the sort of thinning this looks for.
    for (const hole of holes) {
      if (polygonContains(region.contour, hole.ring[0]!)) area -= Math.abs(hole.area);
    }
    return Math.max(area, 0);
  });
}

type Point = readonly [number, number, number];
type Triangle = [Point, Point, Point];

function trianglesOf(solid: Solid): Triangle[] {
  const position = solid.geometry.getAttribute('position');
  const index = solid.geometry.getIndex();
  const out: Triangle[] = [];
  const at = (i: number): Point => [position.getX(i), position.getY(i), position.getZ(i)];

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      out.push([at(index.getX(i)), at(index.getX(i + 1)), at(index.getX(i + 2))]);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) out.push([at(i), at(i + 1), at(i + 2)]);
  }
  return out;
}

/**
 * The closed loops the plane `z` cuts, signed: positive is material, negative a bore.
 *
 * Each triangle crossing the plane contributes one directed segment. Chaining those end to
 * end recovers the loops with no geometric search at all — the mesh is welded, so a segment
 * endpoint matches its neighbour's start exactly.
 */
function loopsAt(triangles: readonly Triangle[], z: number): { ring: Polygon; area: number }[] {
  const from = new Map<string, { a: [number, number]; b: [number, number] }>();

  for (const triangle of triangles) {
    const segment = crossSegment(triangle, z);
    if (!segment) continue;
    // A degenerate triangle can produce a zero-length segment; it bounds nothing.
    if (key(segment.a) === key(segment.b)) continue;
    from.set(key(segment.a), segment);
  }

  const loops: { ring: Polygon; area: number }[] = [];
  const seen = new Set<string>();

  for (const start of from.keys()) {
    if (seen.has(start)) continue;
    const ring: Polygon = [];
    let area = 0;
    let at = start;
    // Bounded by the segment count: a chain broken by numerical noise must not spin forever.
    for (let steps = 0; steps <= from.size; steps++) {
      const segment = from.get(at);
      if (!segment || seen.has(at)) break;
      seen.add(at);
      ring.push(segment.a);
      area += segment.a[0] * segment.b[1] - segment.b[0] * segment.a[1];
      at = key(segment.b);
      if (at === start) {
        if (ring.length >= 3) loops.push({ ring, area: area / 2 });
        break;
      }
    }
  }
  return loops;
}

function key(p: readonly [number, number]): string {
  return `${Math.round(p[0] * QUANTUM)},${Math.round(p[1] * QUANTUM)}`;
}

/**
 * Where a triangle crosses the plane, as a directed segment.
 *
 * A triangle crosses when one vertex is on one side and two on the other. Direction matters
 * twice over: it is what makes material come out positive and a bore negative, and it is
 * what lets the segments chain. Worked out from one outward-wound wall quad — a lone vertex
 * above the plane walks tip→next then previous→tip; below, the reverse.
 */
function crossSegment(
  triangle: Triangle,
  z: number,
): { a: [number, number]; b: [number, number] } | null {
  const above = [triangle[0][2] > z, triangle[1][2] > z, triangle[2][2] > z];
  const count = above.filter(Boolean).length;
  if (count === 0 || count === 3) return null;

  // The odd one out, and the other two in winding order after it.
  const lone = above.findIndex((up) => (count === 1 ? up : !up));
  const tip = triangle[lone]!;
  const next = triangle[(lone + 1) % 3]!;
  const previous = triangle[(lone + 2) % 3]!;

  const onto = (a: Point, b: Point): [number, number] => {
    const t = (z - a[2]) / (b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };

  const first = onto(tip, next);
  const second = onto(previous, tip);
  return count === 1 ? { a: first, b: second } : { a: second, b: first };
}
