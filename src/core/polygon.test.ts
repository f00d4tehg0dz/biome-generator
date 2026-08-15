// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { describe, expect, it } from 'vitest';
import {
  centroid,
  clipToConvex,
  ensureCCW,
  hexHalfPlanes,
  insetPolygon,
  maxRadius,
  minRadius,
  polygonContains,
  radialPolygon,
  signedArea,
  simplifyCollinear,
  type Polygon,
} from './polygon';
import { hexContains, hexCorners, inradius } from './hex';
import { makeRng } from './rng';

const R = 50;
const square: Polygon = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('winding', () => {
  it('reports positive area for counter-clockwise polygons', () => {
    expect(signedArea(square)).toBeCloseTo(100, 9);
    expect(signedArea([...square].reverse())).toBeCloseTo(-100, 9);
  });

  it('normalises to counter-clockwise', () => {
    expect(signedArea(ensureCCW([...square].reverse()))).toBeGreaterThan(0);
  });
});

describe('insetPolygon', () => {
  it('offsets every edge by exactly the requested distance', () => {
    const inset = insetPolygon(square, 1);
    expect(inset).toEqual([
      [1, 1],
      [9, 1],
      [9, 9],
      [1, 9],
    ]);
  });

  it('reduces a regular hexagon inradius by exactly the distance', () => {
    const hex = hexCorners(R) as Polygon;
    const inset = insetPolygon(hex, 2);
    // Distance from centre to an edge midpoint is the inradius.
    for (let i = 0; i < inset.length; i++) {
      const a = inset[i]!;
      const b = inset[(i + 1) % inset.length]!;
      const mid = Math.hypot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      expect(mid).toBeCloseTo(inradius(R) - 2, 6);
    }
  });

  it('produces a true 45° chamfer on irregular star-shaped polygons', () => {
    // This is the property the tile's band chamfers rely on: for a chamfer of height h,
    // every offset edge must sit exactly h from its original, whatever the vertex angles.
    const rng = makeRng('inset');
    for (let trial = 0; trial < 40; trial++) {
      const poly = ensureCCW(radialPolygon(rng, { radius: 20, wobble: 0.35, sides: 13 }));
      const inset = insetPolygon(poly, 0.4);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const distance = pointLineDistance(inset[i]!, a, b);
        expect(distance).toBeCloseTo(0.4, 6);
      }
    }
  });

  it('is a no-op at zero distance', () => {
    expect(insetPolygon(square, 0)).toEqual(square);
  });
});

describe('clipToConvex', () => {
  it('leaves a polygon already inside the hex untouched in extent', () => {
    const rng = makeRng('clip-inside');
    const poly = radialPolygon(rng, { radius: 12, wobble: 0.2, sides: 11 });
    const clipped = clipToConvex(poly, hexHalfPlanes(R));
    expect(clipped).toHaveLength(poly.length);
  });

  it('pulls an oversized polygon inside the hex', () => {
    const rng = makeRng('clip-outside');
    const poly = radialPolygon(rng, { radius: 200, wobble: 0.2, sides: 11 });
    const clipped = clipToConvex(poly, hexHalfPlanes(R));
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    for (const point of clipped) expect(hexContains(point, R + 1e-6)).toBe(true);
  });

  it('respects an edge margin', () => {
    const rng = makeRng('clip-margin');
    const poly = radialPolygon(rng, { radius: 200, wobble: 0.2, sides: 11 });
    const clipped = clipToConvex(poly, hexHalfPlanes(R, 6));
    for (const point of clipped) expect(hexContains(point, R - 6 + 1e-6)).toBe(true);
  });
});

describe('radialPolygon', () => {
  it('is deterministic for the same rng seed', () => {
    const a = radialPolygon(makeRng('same'), { radius: 20, wobble: 0.3 });
    const b = radialPolygon(makeRng('same'), { radius: 20, wobble: 0.3 });
    expect(a).toEqual(b);
  });

  it('keeps radii inside the wobble band', () => {
    const rng = makeRng('wobble');
    for (let trial = 0; trial < 40; trial++) {
      const poly = radialPolygon(rng, { radius: 20, wobble: 0.25, sides: 11 });
      expect(maxRadius(poly)).toBeLessThanOrEqual(20 * 1.25 + 1e-9);
      expect(minRadius(poly)).toBeGreaterThanOrEqual(20 * 0.75 - 1e-9);
    }
  });

  it('is star-shaped, so a fan from the centre is a valid triangulation', () => {
    const rng = makeRng('star');
    for (let trial = 0; trial < 20; trial++) {
      const poly = radialPolygon(rng, { radius: 20, wobble: 0.4, sides: 13 });
      expect(polygonContains(poly, centroid(poly))).toBe(true);
      expect(polygonContains(poly, [0, 0])).toBe(true);
    }
  });
});

describe('simplifyCollinear', () => {
  it('drops a redundant midpoint', () => {
    const withMidpoint: Polygon = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(simplifyCollinear(withMidpoint)).toHaveLength(4);
  });

  it('never returns a degenerate polygon', () => {
    expect(simplifyCollinear(square).length).toBeGreaterThanOrEqual(3);
  });
});

function pointLineDistance(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / len;
}
