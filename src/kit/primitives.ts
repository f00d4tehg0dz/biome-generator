// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The two shapes every prop is made of.
 *
 * `lathe` builds a solid of revolution from a radius/height profile: trunks, cones,
 * stepped domes, rocks, mushroom caps, lamps, wells. `beam` builds a tapered box between
 * two points: branches, fronds, rails, legs, planks, cactus arms.
 *
 * Both produce closed, watertight solids with outward winding. Neither can produce an
 * overhang on its own: that is a property of the profile you hand it, which is why
 * `maxFlare` exists.
 */

import type { Frame } from './frame';
import { MeshBuilder } from './solid';

/** One ring of a lathe profile. `r === 0` makes an apex instead of a ring. */
export interface ProfileRing {
  r: number;
  z: number;
}

export interface LatheOptions {
  /** Bottom to top. A zero radius at either end becomes a point. */
  profile: readonly ProfileRing[];
  sides: number;
  /** Rotates the ring vertices, for varying the facet orientation between instances. */
  phase?: number;
  /** Per-vertex radius multiplier, for irregular forms like rocks. */
  wobble?: (ring: number, side: number) => number;
}

/**
 * The steepest a profile may widen going up before it overhangs: rise must exceed the run.
 * Held well under 1 so that a wobbled profile, where a ring's radius is perturbed per
 * vertex, still cannot push any individual face past 45°.
 */
export const MAX_FLARE = 0.85;

export function lathe(b: MeshBuilder, f: Frame, options: LatheOptions): void {
  const { profile, sides } = options;
  const phase = options.phase ?? 0;
  if (profile.length < 2 || sides < 3) return;

  const rings: (number[] | number)[] = profile.map((ring, index) => {
    if (ring.r <= 0) return b.vertex(...f.p(0, 0, ring.z));
    const indices: number[] = [];
    for (let side = 0; side < sides; side++) {
      const angle = phase + (side / sides) * Math.PI * 2;
      const radius = ring.r * (options.wobble?.(index, side) ?? 1);
      indices.push(b.vertex(...f.p(Math.cos(angle) * radius, Math.sin(angle) * radius, ring.z)));
    }
    return indices;
  });

  const first = rings[0]!;
  const last = rings[rings.length - 1]!;

  // Caps. An apex ring needs none; the adjacent wall fans to it.
  if (Array.isArray(first)) b.fan(b.vertex(...f.p(0, 0, profile[0]!.z)), first, true);
  if (Array.isArray(last)) {
    b.fan(b.vertex(...f.p(0, 0, profile[profile.length - 1]!.z)), last, false);
  }

  for (let i = 0; i < rings.length - 1; i++) {
    const lower = rings[i]!;
    const upper = rings[i + 1]!;
    if (Array.isArray(lower) && Array.isArray(upper)) b.wall(lower, upper);
    else if (Array.isArray(lower)) b.fan(upper as number, lower, false);
    else if (Array.isArray(upper)) b.fan(lower as number, upper, true);
  }
}

export interface BeamOptions {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  width: number;
  height: number;
  /** Cross-section scale at `to`. Zero tapers to a point: fronds, branch tips, reeds. */
  taper?: number;
  /** Rotation of the cross-section about the beam axis. */
  roll?: number;
}

export function beam(b: MeshBuilder, f: Frame, options: BeamOptions): void {
  const { from, to, width, height } = options;
  const taper = options.taper ?? 1;
  const roll = options.roll ?? 0;

  const axis = normalise([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
  if (!axis) return;

  // Right-handed (side, up, axis) so a ring wound counter-clockwise in the section plane
  // has outward normals, exactly like a lathe ring.
  const reference: Vec3 = Math.abs(axis[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1];
  const side = normalise(cross(reference, axis)) ?? [1, 0, 0];
  const up = normalise(cross(axis, side)) ?? [0, 1, 0];

  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  const corners: readonly [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];

  const ringAt = (origin: readonly [number, number, number], factor: number): number[] =>
    corners.map(([u, v]) => {
      const su = (u * width * cos - v * height * sin) * factor;
      const sv = (u * width * sin + v * height * cos) * factor;
      return b.vertex(
        ...f.p(
          origin[0] + side[0] * su + up[0] * sv,
          origin[1] + side[1] * su + up[1] * sv,
          origin[2] + side[2] * su + up[2] * sv,
        ),
      );
    });

  const base = ringAt(from, 1);
  b.fan(b.vertex(...f.p(from[0], from[1], from[2])), base, true);

  if (taper <= 0) {
    b.fan(b.vertex(...f.p(to[0], to[1], to[2])), base, false);
    return;
  }

  const tip = ringAt(to, taper);
  b.wall(base, tip);
  b.fan(b.vertex(...f.p(to[0], to[1], to[2])), tip, false);
}

type Vec3 = readonly [number, number, number];

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalise(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-9) return null;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * Builds a profile that steps outward without ever overhanging: each widening segment
 * rises at least `1 / MAX_FLARE` times as fast as it spreads. Used by the tiered conifer,
 * where the tier shelves would otherwise be 90° overhangs.
 */
export function flareTo(fromRing: ProfileRing, radius: number): ProfileRing {
  const spread = radius - fromRing.r;
  if (spread <= 0) return { r: radius, z: fromRing.z };
  return { r: radius, z: fromRing.z + spread / MAX_FLARE };
}
