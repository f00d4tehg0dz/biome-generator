// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Seeded, explicit randomness.
 *
 * Generation must be deterministic and order-independent (CLAUDE.md invariant 5), so
 * `Math.random()` never appears anywhere in `src/gen` or `src/kit`; an Rng is always
 * passed in.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Uniform choice. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
  /** Weighted choice. Items with weight <= 0 are never chosen. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
}

/** xmur3 string hash, expanding a string into a stream of well-mixed 32-bit seeds. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** sfc32: small, fast, statistically solid counter-based PRNG. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Joins seed parts into one stable key. `['a', 1]` and `['a1']` must not collide. */
function seedKey(parts: readonly (string | number)[]): string {
  return parts.map(String).join('␟');
}

/**
 * Build a stateful Rng from any number of seed parts.
 * `makeRng(seed, biome, q, r)`; the same parts always give the same sequence.
 */
export function makeRng(...parts: (string | number)[]): Rng {
  const seed = xmur3(seedKey(parts));
  const next = sfc32(seed(), seed(), seed(), seed());

  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick: empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    weighted: (items, weight) => {
      if (items.length === 0) throw new Error('rng.weighted: empty list');
      let total = 0;
      for (const item of items) total += Math.max(0, weight(item));
      if (total <= 0) throw new Error('rng.weighted: all weights are zero');
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll <= 0) return item;
      }
      return items[items.length - 1]!;
    },
  };
  return rng;
}

/**
 * Stateless hash to [0, 1). Use this, not an Rng, wherever two independent callers
 * must agree without communicating, such as the shared-edge contract between neighbouring
 * tiles.
 */
export function hashUnit(...parts: (string | number)[]): number {
  const seed = xmur3(seedKey(parts));
  seed();
  return seed() / 4294967296;
}

/** Stateless hash to an integer in [min, max] inclusive. */
export function hashInt(min: number, max: number, ...parts: (string | number)[]): number {
  return min + Math.floor(hashUnit(...parts) * (max - min + 1));
}
