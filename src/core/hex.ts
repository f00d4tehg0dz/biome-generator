// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Pointy-top hexagons in axial coordinates. See docs/geometry-spec.md §1.
 *
 * World space is XY (Z is up, millimetres). A tile's local origin is its centre.
 */

export interface Axial {
  q: number;
  r: number;
}

export type Vec2 = readonly [number, number];

/** Default circumradius in millimetres, centre to corner. Confirmed 2026-08-11. */
export const DEFAULT_R = 50;

/**
 * Neighbour directions, indexed 0..5. Direction `i` faces direction `(i + 3) % 6` on the
 * neighbour, which is what makes the male/female connector rule work without bookkeeping.
 */
export const DIRECTIONS: readonly Axial[] = [
  { q: +1, r: 0 }, // 0  E
  { q: +1, r: -1 }, // 1  NE
  { q: 0, r: -1 }, // 2  NW
  { q: -1, r: 0 }, // 3  W
  { q: -1, r: +1 }, // 4  SW
  { q: 0, r: +1 }, // 5  SE
] as const;

/** Inradius: centre to edge midpoint. */
export function inradius(R: number): number {
  return (R * Math.sqrt(3)) / 2;
}

/** Footprint of a single tile: [width across flats (X), height across corners (Y)]. */
export function hexExtent(R: number): Vec2 {
  return [Math.sqrt(3) * R, 2 * R];
}

/** Corner `i` of a pointy-top hex, at angle 60°·i − 30°. */
export function corner(i: number, R: number): Vec2 {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [R * Math.cos(a), R * Math.sin(a)];
}

/** All six corners, counter-clockwise, starting at −30°. */
export function hexCorners(R: number): Vec2[] {
  return [0, 1, 2, 3, 4, 5].map((i) => corner(i, R));
}

/** Centre of the tile at `a`, in world XY. */
export function axialToWorld(a: Axial, R: number): Vec2 {
  const x = R * (Math.sqrt(3) * a.q + (Math.sqrt(3) / 2) * a.r);
  const y = R * (1.5 * a.r);
  return [x, y];
}

export function neighbour(a: Axial, direction: number): Axial {
  const d = DIRECTIONS[((direction % 6) + 6) % 6]!;
  return { q: a.q + d.q, r: a.r + d.r };
}

/** Midpoint of edge `direction`, in tile-local XY. */
export function edgeMidpoint(direction: number, R: number): Vec2 {
  const d = DIRECTIONS[((direction % 6) + 6) % 6]!;
  const [nx, ny] = axialToWorld(d, R);
  return [nx / 2, ny / 2];
}

/** Outward unit normal of edge `direction`. */
export function edgeNormal(direction: number): Vec2 {
  const [mx, my] = edgeMidpoint(direction, 1);
  const len = Math.hypot(mx, my);
  return [mx / len, my / len];
}

/**
 * The two corners bounding edge `direction`. Edge d runs between corners `(6 - d) % 6` and
 * the next one round: the orderings of DIRECTIONS and of the corner angles run opposite
 * ways, which is easy to get subtly wrong by eye.
 */
export function edgeCorners(direction: number, R: number): [Vec2, Vec2] {
  const d = ((direction % 6) + 6) % 6;
  const first = (6 - d) % 6;
  return [corner(first, R), corner((first + 1) % 6, R)];
}

/** Unit vector along edge `direction`, from its first corner to its second. */
export function edgeTangent(direction: number): Vec2 {
  const [a, b] = edgeCorners(direction, 1);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  return [dx / length, dy / length];
}

/** Directions 0, 1 and 2 carry the male half of a connector. */
export function isMaleDirection(direction: number): boolean {
  return ((direction % 6) + 6) % 6 < 3;
}

export function hexKey(a: Axial): string {
  return `${a.q},${a.r}`;
}

export function parseHexKey(key: string): Axial {
  const [q, r] = key.split(',').map(Number);
  return { q: q!, r: r! };
}

/**
 * Stable identifier for the boundary between two tiles, independent of which side asks.
 * Both neighbours derive the same key, so both derive the same edge type.
 */
export function edgeKey(a: Axial, b: Axial): string {
  const first = a.q !== b.q ? a.q < b.q : a.r < b.r;
  return first ? `${hexKey(a)}|${hexKey(b)}` : `${hexKey(b)}|${hexKey(a)}`;
}

/** Point-in-hex test for a pointy-top hex centred on the origin. */
export function hexContains([x, y]: Vec2, R: number): boolean {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > inradius(R)) return false;
  return ay <= R - ax / Math.sqrt(3);
}

/** Distance from the hex boundary, positive inside. Used for edge margins. */
export function hexInset([x, y]: Vec2, R: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  // Distance to the two flat sides, and to the four slanted sides.
  const toFlat = inradius(R) - ax;
  const toSlant = (R - ay - ax / Math.sqrt(3)) * (Math.sqrt(3) / 2);
  return Math.min(toFlat, toSlant);
}

/** The ring of `radius` tiles around the origin, plus the origin itself at radius 0. */
export function hexSpiral(radius: number): Axial[] {
  const out: Axial[] = [{ q: 0, r: 0 }];
  for (let k = 1; k <= radius; k++) {
    let a: Axial = { q: -k, r: k };
    for (let d = 0; d < 6; d++) {
      for (let step = 0; step < k; step++) {
        out.push(a);
        a = neighbour(a, d);
      }
    }
  }
  return out;
}
