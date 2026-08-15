// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { describe, expect, it } from 'vitest';
import { hashInt, hashUnit, makeRng } from './rng';

describe('makeRng', () => {
  it('is deterministic for the same parts', () => {
    const a = makeRng('seed', 'meadow', 0, 0);
    const b = makeRng('seed', 'meadow', 0, 0);
    const drawA = Array.from({ length: 32 }, () => a.next());
    const drawB = Array.from({ length: 32 }, () => b.next());
    expect(drawA).toEqual(drawB);
  });

  it('diverges for different parts', () => {
    const a = makeRng('seed', 'meadow', 0, 0).next();
    const b = makeRng('seed', 'meadow', 0, 1).next();
    const c = makeRng('seed', 'forest', 0, 0).next();
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('does not collide when parts are joined ambiguously', () => {
    expect(makeRng('a', 1).next()).not.toBe(makeRng('a1').next());
    expect(makeRng(1, 23).next()).not.toBe(makeRng(12, 3).next());
  });

  it('stays inside [0, 1)', () => {
    const rng = makeRng('range');
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('keeps int() inclusive at both ends', () => {
    const rng = makeRng('ints');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('respects weights', () => {
    const rng = makeRng('weights');
    const items = [
      { id: 'never', w: 0 },
      { id: 'rare', w: 1 },
      { id: 'common', w: 9 },
    ];
    const counts: Record<string, number> = { never: 0, rare: 0, common: 0 };
    for (let i = 0; i < 4000; i++) counts[rng.weighted(items, (x) => x.w).id]!++;
    expect(counts.never).toBe(0);
    expect(counts.common).toBeGreaterThan(counts.rare! * 4);
  });

  it('throws rather than returning undefined on an empty list', () => {
    const rng = makeRng('empty');
    expect(() => rng.pick([])).toThrow();
    expect(() => rng.weighted([], () => 1)).toThrow();
  });
});

describe('hashUnit', () => {
  it('is stateless and stable', () => {
    expect(hashUnit('a', 1)).toBe(hashUnit('a', 1));
    expect(hashUnit('a', 1)).not.toBe(hashUnit('a', 2));
  });

  it('stays inside [0, 1)', () => {
    for (let i = 0; i < 2000; i++) {
      const v = hashUnit('edge', i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('spreads hashInt across the whole range', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(hashInt(0, 4, 'edge', i));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
