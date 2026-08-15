// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  axialToWorld,
  corner,
  edgeKey,
  edgeMidpoint,
  hexContains,
  hexExtent,
  hexInset,
  hexSpiral,
  inradius,
  isMaleDirection,
  neighbour,
} from './hex';

const R = 50;

describe('hex metrics', () => {
  it('matches the documented footprint at R = 50', () => {
    const [w, h] = hexExtent(R);
    expect(w).toBeCloseTo(86.6025, 3);
    expect(h).toBeCloseTo(100, 6);
    expect(inradius(R)).toBeCloseTo(43.3013, 3);
  });

  it('places corners on the circumcircle', () => {
    for (let i = 0; i < 6; i++) {
      const [x, y] = corner(i, R);
      expect(Math.hypot(x, y)).toBeCloseTo(R, 9);
    }
  });

  it('puts the points at the top and bottom (pointy-top)', () => {
    const ys = [0, 1, 2, 3, 4, 5].map((i) => corner(i, R)[1]);
    expect(Math.max(...ys)).toBeCloseTo(R, 6);
    expect(Math.min(...ys)).toBeCloseTo(-R, 6);
  });
});

describe('neighbours', () => {
  it('places every neighbour exactly one tile away', () => {
    const spacing = Math.sqrt(3) * R;
    for (let d = 0; d < 6; d++) {
      const [x, y] = axialToWorld(neighbour({ q: 0, r: 0 }, d), R);
      expect(Math.hypot(x, y)).toBeCloseTo(spacing, 6);
    }
  });

  it('makes direction i and i+3 opposite', () => {
    for (let d = 0; d < 6; d++) {
      const there = neighbour({ q: 0, r: 0 }, d);
      const back = neighbour(there, (d + 3) % 6);
      expect(back).toEqual({ q: 0, r: 0 });
    }
  });

  it('gives every shared edge exactly one male and one female side', () => {
    for (let d = 0; d < 6; d++) {
      expect(isMaleDirection(d)).not.toBe(isMaleDirection((d + 3) % 6));
    }
  });

  it('puts edge midpoints on the inradius', () => {
    for (let d = 0; d < 6; d++) {
      const [x, y] = edgeMidpoint(d, R);
      expect(Math.hypot(x, y)).toBeCloseTo(inradius(R), 6);
    }
  });
});

describe('edgeKey', () => {
  it('is independent of which neighbour asks', () => {
    for (let d = 0; d < 6; d++) {
      const a = { q: 2, r: -1 };
      const b = neighbour(a, d);
      expect(edgeKey(a, b)).toBe(edgeKey(b, a));
    }
  });

  it('distinguishes different edges', () => {
    const a = { q: 0, r: 0 };
    const keys = new Set(DIRECTIONS.map((_, d) => edgeKey(a, neighbour(a, d))));
    expect(keys.size).toBe(6);
  });
});

describe('containment', () => {
  it('accepts the centre and rejects points beyond the circumradius', () => {
    expect(hexContains([0, 0], R)).toBe(true);
    expect(hexContains([R + 1, 0], R)).toBe(false);
    expect(hexContains([0, R + 1], R)).toBe(false);
  });

  it('accepts corners and edge midpoints, and rejects just outside them', () => {
    for (let i = 0; i < 6; i++) {
      const [cx, cy] = corner(i, R);
      expect(hexContains([cx * 0.999, cy * 0.999], R)).toBe(true);
      expect(hexContains([cx * 1.001, cy * 1.001], R)).toBe(false);
    }
    for (let d = 0; d < 6; d++) {
      const [mx, my] = edgeMidpoint(d, R);
      expect(hexContains([mx * 0.999, my * 0.999], R)).toBe(true);
      expect(hexContains([mx * 1.001, my * 1.001], R)).toBe(false);
    }
  });

  it('reports zero inset on the boundary and the inradius at the centre', () => {
    expect(hexInset([0, 0], R)).toBeCloseTo(inradius(R), 6);
    for (let d = 0; d < 6; d++) {
      expect(hexInset(edgeMidpoint(d, R), R)).toBeCloseTo(0, 6);
    }
    for (let i = 0; i < 6; i++) {
      expect(hexInset(corner(i, R), R)).toBeCloseTo(0, 6);
    }
  });
});

describe('hexSpiral', () => {
  it('returns the centred hexagonal numbers', () => {
    expect(hexSpiral(0)).toHaveLength(1);
    expect(hexSpiral(1)).toHaveLength(7);
    expect(hexSpiral(2)).toHaveLength(19);
    expect(hexSpiral(3)).toHaveLength(37);
  });

  it('returns no duplicates', () => {
    const tiles = hexSpiral(3);
    expect(new Set(tiles.map((t) => `${t.q},${t.r}`)).size).toBe(tiles.length);
  });
});
