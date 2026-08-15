// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Path corridors.
 *
 * Endpoints are not chosen. They are the midpoints of whatever edges the contract typed
 * `path`. A tile therefore has to handle any number of them:
 *
 *   0  no corridor
 *   1  a spur running in from the seam and stopping: a lane, not a through road
 *   2  a route across the tile
 *   3+ a junction: a main route between the two furthest seams, and a branch joining each
 *      of the rest to it
 *
 * The corridor is swept from the routed centre line, unioned across branches, and clipped to
 * the hexagon so it meets the seam exactly on the boundary.
 */

import type { Rng } from '../core/rng';
import { edgeMidpoint, type Vec2 } from '../core/hex';
import { ensureCCW, polygonContains, simplifyCollinear, type Polygon } from '../core/polygon';
import { intersect, unite } from '../core/boolean';
import { distanceToBoundary } from './surface';
import { hexPolygon, seamBand } from './water';

const SAMPLES = 40;
const MAX_ATTEMPTS = 14;
/** How far past the boundary a branch is pushed before clipping, so the seam is a clean cut. */
const OVERSHOOT = 4;

/**
 * Corridor width, shared by every tile.
 *
 * This has to be one constant rather than a per-biome setting: two tiles either side of a
 * `path` seam each generate their own half, and a road that changes width at the join is a
 * step in the pavement.
 */
export const PATH_WIDTH = 9.5;

/**
 * How far in from the seam a corridor runs straight along the edge normal before it is free
 * to wander.
 */
const APPROACH = 10;

export interface PathRoute {
  /** The corridor, as a closed strip already clipped to the tile. */
  polygon: Polygon;
  /** The routed centre line of the main run, for placing benches and signposts along it. */
  centreLine: Vec2[];
  halfWidth: number;
}

export function generatePath(
  rng: Rng,
  R: number,
  obstacles: readonly Polygon[],
  seams: readonly number[],
  width = PATH_WIDTH,
): PathRoute | null {
  if (seams.length === 0) return null;
  const halfWidth = width / 2;
  const hex = hexPolygon(R);

  // Each seam contributes a straight run-in along its edge normal, so the corridor always
  // crosses square-on. See seamLead.
  const leads = seams.map((direction) => seamLead(direction, R));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const branches: Vec2[][] = [];

    if (leads.length === 1) {
      // A lane in from the seam, stopping at a plaza somewhere off centre.
      const anchor = leads[0]!.seam;
      const stop: Vec2 = [anchor[0] * rng.range(0.15, 0.4), anchor[1] * rng.range(0.15, 0.4)];
      branches.push(route(rng, leads[0]!.controls, [stop], R));
    } else {
      const [from, to] = furthestPair(leads.map((lead) => lead.seam));
      // The far seam's lead runs the other way: in from the boundary, then out through it.
      const main = route(rng, leads[from]!.controls, [...leads[to]!.controls].reverse(), R);
      branches.push(main);
      for (let i = 0; i < leads.length; i++) {
        if (i === from || i === to) continue;
        branches.push(route(rng, leads[i]!.controls, [nearestOn(main, inner(leads[i]!))], R));
      }
    }

    if (!branches.every((branch) => isClear(branch, obstacles, halfWidth + 2))) continue;
    if (branches.some((branch) => doublesBack(branch, halfWidth))) continue;

    const merged = unite(branches.map((branch) => ribbon(branch, halfWidth)));
    if (merged.length !== 1 || merged[0]!.holes.length > 0) continue;

    // Left overshooting the seams rather than trimmed flush to them, for the same reason the
    // water body is: a cutter whose boundary lies exactly on the tile outline is the
    // degenerate case for a polygon boolean. The corridor's *fill* gets clipped; this does
    // not. Sanity-check it against the tile so a wild route is still rejected.
    const inside = intersect(merged[0]!.contour, hex);
    if (inside.length !== 1 || inside[0]!.holes.length > 0) continue;

    const polygon = simplifyCollinear(merged[0]!.contour, 0.05);
    if (polygon.length < 4) continue;

    // Check the outcome, not the ingredients. Resolving a folded ribbon can quietly discard
    // the lobe that was covering a seam, and the seam is the whole point; the neighbour
    // across it has been told a corridor arrives there.
    if (seams.some((direction) => seamBand(polygon, direction, R) < width * 0.7)) continue;

    return { polygon: ensureCCW(polygon), centreLine: branches[0]!, halfWidth };
  }

  return null;
}

/** A corridor's straight run-in at one seam. */
interface SeamLead {
  /** Control points, outermost first, ending at the point the route is free to wander from. */
  controls: Vec2[];
  /** Where the centre line meets the boundary, the point the neighbour also routes through. */
  seam: Vec2;
}

/**
 * The straight run that makes a corridor cross a seam square-on, along the edge's normal
 * through its midpoint.
 *
 * Without it the curve's tangent at the boundary points at wherever its first waypoint
 * happens to be, so the corridor crosses at an angle, and an oblique crossing is both wider
 * than the corridor (`width / cos θ`) and shifted along the edge. Each tile picked its own
 * angle independently, so the two halves of a road met with mismatched, offset ends: the
 * roads lined up roughly but the seam did not. Approaching along the normal makes the
 * crossing identical on both sides (same midpoint, same width, square to the edge) which is
 * what lets the contract promise a corridor arrives and have it actually meet one.
 */
function seamLead(direction: number, R: number): SeamLead {
  const mid = edgeMidpoint(direction, R);
  const length = Math.hypot(mid[0], mid[1]) || 1;
  const along = (distance: number): Vec2 => [
    (mid[0] / length) * (length + distance),
    (mid[1] / length) * (length + distance),
  ];

  // Four points, all on the normal, with the seam the second. A Catmull-Rom span is straight
  // only when all four of its control points are collinear, so it takes this many to keep the
  // curve straight from outside the boundary through to the end of the run-in. Two points
  // (just the ends) left the curve already turning as it crossed, and three fixed the tangent
  // *at* the crossing but not the samples either side of it, and the corridor is swept from
  // the samples, so it still met the seam at an angle.
  return {
    controls: [along(OVERSHOOT), along(0), along(-APPROACH / 2), along(-APPROACH)],
    seam: along(0),
  };
}

/**
 * Routes from a lead-in to a tail, wandering in between. `lead` and `tail` are control points
 * that must be honoured exactly (the straight runs at each seam) while the waypoints
 * between them are free.
 */
function route(rng: Rng, lead: readonly Vec2[], tail: readonly Vec2[], R: number): Vec2[] {
  const from = lead[lead.length - 1]!;
  const to = tail[0]!;
  const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const waypoints: Vec2[] = [];
  const bends = rng.int(1, 2);

  for (let i = 1; i <= bends; i++) {
    const t = i / (bends + 1);
    const mid: Vec2 = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    // Sway in proportion to the run. A short branch swayed as far as a long one curves
    // tighter than the corridor is wide, and the swept strip folds over itself.
    const sway = R * rng.range(-0.28, 0.28) * Math.min(1, span / 60);
    const nx = -(to[1] - from[1]);
    const ny = to[0] - from[0];
    const length = Math.hypot(nx, ny) || 1;
    waypoints.push([mid[0] + (nx / length) * sway, mid[1] + (ny / length) * sway]);
  }
  return catmullRom([...lead, ...waypoints, ...tail], SAMPLES);
}

/** The inboard end of a run-in, where a branch is free to head off toward its junction. */
function inner(lead: SeamLead): Vec2 {
  return lead.controls[lead.controls.length - 1]!;
}

function furthestPair(points: readonly Vec2[]): [number, number] {
  let best: [number, number] = [0, 1];
  let bestDistance = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const distance = Math.hypot(points[i]![0] - points[j]![0], points[i]![1] - points[j]![1]);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [i, j];
      }
    }
  }
  return best;
}

function nearestOn(line: readonly Vec2[], p: Vec2): Vec2 {
  let best = line[0]!;
  let bestDistance = Infinity;
  for (const point of line) {
    const distance = Math.hypot(point[0] - p[0], point[1] - p[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}

/** Uniform Catmull–Rom through the control points, with duplicated ends. */
export function catmullRom(controls: readonly Vec2[], samples: number): Vec2[] {
  if (controls.length < 2) return [...controls];
  const pts = [controls[0]!, ...controls, controls[controls.length - 1]!];
  const out: Vec2[] = [];

  const segments = pts.length - 3;
  for (let s = 0; s < segments; s++) {
    const [p0, p1, p2, p3] = [pts[s]!, pts[s + 1]!, pts[s + 2]!, pts[s + 3]!];
    const steps = Math.max(2, Math.round(samples / segments));
    for (let i = 0; i < steps; i++) out.push(interpolate(p0, p1, p2, p3, i / steps));
  }
  out.push(controls[controls.length - 1]!);
  return out;
}

function interpolate(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const axis = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [axis(p0[0], p1[0], p2[0], p3[0]), axis(p0[1], p1[1], p2[1], p3[1])];
}

/** The closed strip swept by a centre line. */
function ribbon(centre: readonly Vec2[], halfWidth: number): Polygon {
  const left: Vec2[] = [];
  const right: Vec2[] = [];

  for (let i = 0; i < centre.length; i++) {
    const previous = centre[Math.max(0, i - 1)]!;
    const next = centre[Math.min(centre.length - 1, i + 1)]!;
    const dx = next[0] - previous[0];
    const dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const p = centre[i]!;
    left.push([p[0] + nx * halfWidth, p[1] + ny * halfWidth]);
    right.push([p[0] - nx * halfWidth, p[1] - ny * halfWidth]);
  }

  return [...left, ...right.reverse()];
}

function isClear(centre: readonly Vec2[], obstacles: readonly Polygon[], clearance: number): boolean {
  return centre.every((p) =>
    obstacles.every(
      (obstacle) => !polygonContains(obstacle, p) && distanceToBoundary(obstacle, p) > clearance,
    ),
  );
}

/**
 * True when the curve loops back near itself, which would make the swept strip
 * self-intersecting.
 *
 * Proximity has to be judged against distance *along* the curve, not against index
 * separation. Samples a few steps apart are inevitably within a corridor width of each
 * other (that is just the corridor) so an index-based guard rejects every route ever
 * proposed, which is exactly what it did.
 */
function doublesBack(centre: readonly Vec2[], halfWidth: number): boolean {
  const arc: number[] = [0];
  for (let i = 1; i < centre.length; i++) {
    const a = centre[i - 1]!;
    const b = centre[i]!;
    arc.push(arc[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }

  const minSeparation = halfWidth * 5;
  for (let i = 0; i < centre.length; i++) {
    for (let j = i + 1; j < centre.length; j++) {
      if (arc[j]! - arc[i]! < minSeparation) continue;
      const a = centre[i]!;
      const b = centre[j]!;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < halfWidth * 2.1) return true;
    }
  }
  return false;
}
