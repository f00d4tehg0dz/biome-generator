// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Minimum feature size. A prop whose smallest dimension falls below the nozzle's practical
 * limit either fails to print or snaps off during support removal, so it is culled rather
 * than shrunk.
 *
 * `checkFeatures` measures each solid's bounding box, which catches a whole prop being too
 * small and nothing else. It was the only feature check there was, and it is why a kit full of
 * 1.1 mm branches passed everything and then came apart in the hand: a box cannot see a thin
 * part inside a big prop, and cannot see a thin part *at all* once it is tilted, because a
 * tilted 1.1 mm branch has a 3.8 mm box.
 *
 * Two measures answer what it cannot. `memberSection` here asks how thick a part is across
 * itself, in any direction. `weakestSection` in `section.ts` asks whether a section is thick
 * enough for what stands on it. Between them they cover the two ways a member gets too thin
 * to survive being handled — see MIN_DURABLE.
 */

import { boundsOf, MIN_FEATURE, type Solid } from '../kit/solid';

export interface FeatureViolation {
  name: string;
  /** Smallest bounding-box dimension, in millimetres. */
  smallest: number;
}

export interface FeatureReport {
  ok: boolean;
  violations: FeatureViolation[];
}

export function checkFeatures(solids: readonly Solid[], minFeature = MIN_FEATURE): FeatureReport {
  const violations: FeatureViolation[] = [];
  for (const solid of solids) {
    const { min, max } = boundsOf([solid]);
    const smallest = Math.min(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
    if (smallest < minFeature) violations.push({ name: solid.name, smallest });
  }
  return { ok: violations.length === 0, violations };
}

/** Smallest bounding-box dimension across a solid set: the number scatter culls on. */
export function smallestFeature(solids: readonly Solid[]): number {
  let smallest = Infinity;
  for (const solid of solids) {
    const { min, max } = boundsOf([solid]);
    smallest = Math.min(smallest, max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
  }
  return smallest;
}

export interface MemberSection {
  /** The narrowest the part measures across, in any direction. */
  thinnest: number;
  /**
   * The narrowest it measures across *again*, at right angles to the first.
   *
   * This is the number that decides whether a part snaps. Thin in one direction is a plate —
   * a lily pad, a crop row, a cairn stone — and a plate lying on the surface it belongs to is
   * held along its whole face, so 1 mm of it is fine. Thin in *two* is a rod, and a rod is a
   * lever: a branch, a rail, a stem, a post. Those are what came off.
   */
  rod: number;
}

/**
 * How thick a part actually is, measured across itself rather than along the axes.
 *
 * The axis-aligned bounding box cannot answer this, and it is not a small error. A branch
 * 1.1 mm square leaving a trunk at 60° has a *box* 3.8 mm on its smallest side, so by the box
 * it is a chunky part — and then it snaps off in your fingers, because it was never 3.8 mm of
 * anything. This reads 1.1 mm, which is the number that was going to break.
 */
export function memberSection(solid: Solid): MemberSection {
  const widths = widthsByFace(solid);
  if (widths.length === 0) return { thinnest: 0, rod: 0 };
  const narrowest = widths[0]!;

  // Sweep the whole plane at right angles to the thinnest direction rather than looking for
  // another face normal in it. A face normal may simply not point that way: a disc with a
  // steeply sloped rim has every one of its normals within 45° of vertical, so "the thinnest
  // direction again, but sideways" came back as the disc's own 1 mm thickness and called a
  // flat patch of ice a rod.
  const [u, v] = basisAcross(narrowest.normal);
  const position = solid.geometry.getAttribute('position');
  const STEPS = 180;
  let rod = Infinity;

  for (let s = 0; s < STEPS; s++) {
    const angle = (s / STEPS) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = u[0] * cos + v[0] * sin;
    const dy = u[1] * cos + v[1] * sin;
    const dz = u[2] * cos + v[2] * sin;

    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const along = position.getX(i) * dx + position.getY(i) * dy + position.getZ(i) * dz;
      if (along < low) low = along;
      if (along > high) high = along;
    }
    rod = Math.min(rod, high - low);
  }

  return { thinnest: narrowest.width, rod: Math.max(narrowest.width, rod) };
}

/** Two unit vectors spanning the plane at right angles to `normal`. */
function basisAcross(normal: Normal): [Normal, Normal] {
  const seed: Normal = Math.abs(normal[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const ux = seed[1] * normal[2] - seed[2] * normal[1];
  const uy = seed[2] * normal[0] - seed[0] * normal[2];
  const uz = seed[0] * normal[1] - seed[1] * normal[0];
  const length = Math.hypot(ux, uy, uz) || 1;
  const u: Normal = [ux / length, uy / length, uz / length];
  return [
    u,
    [
      normal[1] * u[2] - normal[2] * u[1],
      normal[2] * u[0] - normal[0] * u[2],
      normal[0] * u[1] - normal[1] * u[0],
    ],
  ];
}

/** Just the narrowest measurement, for reports and for the scatter cull. */
export function memberThickness(solid: Solid): number {
  return memberSection(solid).thinnest;
}

type Normal = readonly [number, number, number];

/**
 * Every distinct face normal of the part, with how wide the part is measured along it,
 * narrowest first.
 *
 * Face normals rather than a spray of sampled directions: a solid is thinnest square-on to
 * one of its own faces, so the normals are the answers rather than an approximation of them.
 * Sampling is also worse than it looks — 256 directions still read a hexagonal trunk 10%
 * thicker than it is, because the direction it is thinnest in is horizontal and that is where
 * a sphere's samples are sparsest.
 */
function widthsByFace(solid: Solid): { normal: Normal; width: number }[] {
  const position = solid.geometry.getAttribute('position');
  const index = solid.geometry.getIndex();
  if (position.count === 0 || !index) return [];

  const seen = new Set<string>();
  const out: { normal: Normal; width: number }[] = [];

  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    const normal = faceNormal(position, a!, b!, c!);
    if (!normal) continue;

    // Opposite normals measure the same width, so canonicalise the sign before deduping.
    const flip = normal[0] < -1e-9 || (Math.abs(normal[0]) <= 1e-9 && normal[1] < 0) ? -1 : 1;
    const facing: Normal = [normal[0] * flip, normal[1] * flip, normal[2] * flip];
    const key = facing.map((v) => Math.round(v * 1e3)).join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const along =
        position.getX(i) * facing[0] + position.getY(i) * facing[1] + position.getZ(i) * facing[2];
      if (along < low) low = along;
      if (along > high) high = along;
    }
    out.push({ normal: facing, width: high - low });
  }

  out.sort((p, q) => p.width - q.width);
  return out;
}

function faceNormal(
  position: { getX(i: number): number; getY(i: number): number; getZ(i: number): number },
  a: number,
  b: number,
  c: number,
): [number, number, number] | null {
  const ux = position.getX(b) - position.getX(a);
  const uy = position.getY(b) - position.getY(a);
  const uz = position.getZ(b) - position.getZ(a);
  const vx = position.getX(c) - position.getX(a);
  const vy = position.getY(c) - position.getY(a);
  const vz = position.getZ(c) - position.getZ(a);
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-9) return null;
  return [nx / length, ny / length, nz / length];
}
