// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { describe, expect, it } from 'vitest';
import {
  boardSolids,
  decodeBoard,
  encodeBoard,
  findOpenings,
  generateBoard,
  singleTile,
  type BoardPlan,
} from './board';
import { BIOME_IDS, type BiomeId } from './biomes';
import {
  axialToWorld,
  DIRECTIONS,
  edgeCorners,
  hexKey,
  hexSpiral,
  inradius,
  neighbour,
  parseHexKey,
} from '../core/hex';
import { polygonContains } from '../core/polygon';
import { generateTile } from './tile';
import { PATH_WIDTH } from './paths';
import type { EdgeType } from './edges';
import { checkSolid } from '../check/manifold';
import { MIN_SEAM_BAND, seamBand } from './water';
import { hashInt } from '../core/rng';
import { triangleCount } from '../kit/solid';

const R = 50;

/**
 * Where a polygon covers an edge, as distances along it from its first corner.
 *
 * `offset` shifts the polygon into the frame the edge is measured in, so a neighbour's
 * corridor can be compared against this tile's on the same seam.
 */
function seamFootprint(
  polygon: readonly (readonly [number, number])[],
  direction: number,
  radius: number,
  offset: readonly [number, number],
): { start: number; end: number } | null {
  const [a, b] = edgeCorners(direction, radius);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const inside = (t: number) =>
    polygonContains(polygon as [number, number][], [
      a[0] + (b[0] - a[0]) * t - offset[0],
      a[1] + (b[1] - a[1]) * t - offset[1],
    ]);

  const STEPS = 400;
  let first: number | null = null;
  let last = 0;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    if (!inside(t)) continue;
    if (first === null) first = i;
    last = i;
  }
  if (first === null) return null;

  // Bisect each end rather than reporting the scan step. A stride is 0.125 mm here, and the
  // thing under test is a sub-millimetre mismatch, and quantising the answer to the sampling
  // grid would swamp the measurement.
  const edge = (outside: number, within: number) => {
    for (let i = 0; i < 24; i++) {
      const mid = (outside + within) / 2;
      if (inside(mid)) within = mid;
      else outside = mid;
    }
    return ((outside + within) / 2) * length;
  };

  return {
    start: first === 0 ? 0 : edge((first - 1) / STEPS, first / STEPS),
    end: last === STEPS ? length : edge((last + 1) / STEPS, last / STEPS),
  };
}

/** The seven-tile flower: a centre and its full ring. */
function flower(seed: string, pick: (i: number) => BiomeId): BoardPlan {
  const plan: BoardPlan = {};
  hexSpiral(1).forEach((coord, i) => {
    plan[hexKey(coord)] = pick(i);
  });
  void seed;
  return plan;
}

const mixedFlower = (seed: string) =>
  flower(seed, (i) => BIOME_IDS[hashInt(0, BIOME_IDS.length - 1, seed, 'biome', i)]!);

describe('board assembly', () => {
  it('generates every placed tile', () => {
    const plan = mixedFlower('flower');
    const board = generateBoard({ seed: 'flower', R, connectors: 'dovetail', plan });
    expect(board.tiles).toHaveLength(7);
    expect(new Set(board.tiles.map((t) => hexKey(t.tile.coord))).size).toBe(7);
  });

  it('keeps every solid on the board watertight', () => {
    const plan = mixedFlower('manifold');
    const board = generateBoard({ seed: 'manifold', R, connectors: 'dovetail', plan });
    for (const placed of board.tiles) {
      for (const solid of placed.tile.solids) {
        const report = checkSolid(solid);
        expect(
          report.ok,
          `${placed.tile.biome} ${solid.name}: ${report.issues.map((i) => i.detail).join('; ')}`,
        ).toBe(true);
      }
    }
  });

  it('offers every empty cell touching the board, and no occupied one', () => {
    const plan = singleTile('meadow');
    const openings = findOpenings(plan);
    expect(openings).toHaveLength(6);
    for (const coord of openings) expect(plan[hexKey(coord)]).toBeUndefined();
  });

  it('stays within the triangle budget for a seven-tile board', () => {
    for (const seed of ['b1', 'b2', 'b3']) {
      const board = generateBoard({ seed, R, connectors: 'dovetail', plan: mixedFlower(seed) });
      expect(board.triangles, seed).toBeLessThanOrEqual(56_000);
    }
  });

  it('places tiles one full hex apart', () => {
    const board = generateBoard({
      seed: 'spacing',
      R,
      connectors: 'dovetail',
      plan: mixedFlower('spacing'),
    });
    const centre = board.tiles.find((t) => t.tile.coord.q === 0 && t.tile.coord.r === 0)!;
    for (const placed of board.tiles) {
      if (placed === centre) continue;
      const distance = Math.hypot(
        placed.origin[0] - centre.origin[0],
        placed.origin[1] - centre.origin[1],
      );
      expect(distance).toBeCloseTo(inradius(R) * 2, 6);
    }
  });
});

describe('seams', () => {
  const seed = 'seams';
  const plan = mixedFlower(seed);
  const board = generateBoard({ seed, R, connectors: 'dovetail', plan });
  const byKey = new Map(board.tiles.map((t) => [hexKey(t.tile.coord), t]));

  it('has both sides of every shared edge agree on its type', () => {
    for (const placed of board.tiles) {
      for (let direction = 0; direction < 6; direction++) {
        const other = byKey.get(hexKey(neighbour(placed.tile.coord, direction)));
        if (!other) continue;
        expect(
          other.tile.edges[(direction + 3) % 6],
          `${hexKey(placed.tile.coord)} dir ${direction}`,
        ).toBe(placed.tile.edges[direction]);
      }
    }
  });

  it('brings water to both sides of a water seam', () => {
    for (const placed of board.tiles) {
      for (let direction = 0; direction < 6; direction++) {
        if (placed.tile.edges[direction] !== 'water') continue;
        const other = byKey.get(hexKey(neighbour(placed.tile.coord, direction)));
        if (!other) continue;
        expect(placed.tile.water, `${hexKey(placed.tile.coord)} has no body`).not.toBeNull();
        expect(other.tile.water, `${hexKey(other.tile.coord)} has no body`).not.toBeNull();
        expect(seamBand(placed.tile.water!, direction, R)).toBeGreaterThanOrEqual(MIN_SEAM_BAND);
        expect(seamBand(other.tile.water!, (direction + 3) % 6, R)).toBeGreaterThanOrEqual(
          MIN_SEAM_BAND,
        );
      }
    }
  });

  it('always delivers water when the contract promised it, over many boards', () => {
    // The neighbour across a water seam has already been told water arrives. A tile that
    // quietly produced none would leave their bay running into a sand wall, so this is the
    // one place the generator is not allowed to give up.
    let seams = 0;
    for (let i = 0; i < 30; i++) {
      const boardSeed = `promise${i}`;
      const built = generateBoard({
        seed: boardSeed,
        R,
        connectors: 'dovetail',
        plan: mixedFlower(boardSeed),
      });
      for (const placed of built.tiles) {
        for (let direction = 0; direction < 6; direction++) {
          if (placed.tile.edges[direction] !== 'water') continue;
          seams++;
          expect(
            placed.tile.water,
            `${boardSeed} ${placed.tile.biome} at ${hexKey(placed.tile.coord)} dir ${direction}`,
          ).not.toBeNull();
          expect(seamBand(placed.tile.water!, direction, R)).toBeGreaterThanOrEqual(MIN_SEAM_BAND);
        }
      }
    }
    expect(seams, 'water seams exercised').toBeGreaterThan(40);
  });

  it('never leaves water running into a neighbour that has none there', () => {
    for (const placed of board.tiles) {
      if (!placed.tile.water) continue;
      for (let direction = 0; direction < 6; direction++) {
        if (placed.tile.edges[direction] === 'water') continue;
        expect(
          seamBand(placed.tile.water, direction, R),
          `${placed.tile.biome} at ${hexKey(placed.tile.coord)} dir ${direction}`,
        ).toBeLessThan(4);
      }
    }
  });

  it('gives both corridors the same footprint on a shared seam', () => {
    // Not just "both arrive": the two halves have to meet edge to edge. Sample along the
    // shared edge in world space and compare where each tile's corridor starts and stops.
    let compared = 0;
    for (let i = 0; i < 24; i++) {
      const boardSeed = `seamfit${i}`;
      const built = generateBoard({
        seed: boardSeed,
        R,
        connectors: 'dovetail',
        plan: mixedFlower(boardSeed),
      });
      const tiles = new Map(built.tiles.map((t) => [hexKey(t.tile.coord), t]));

      for (const placed of built.tiles) {
        for (let direction = 0; direction < 6; direction++) {
          if (placed.tile.edges[direction] !== 'path') continue;
          const other = tiles.get(hexKey(neighbour(placed.tile.coord, direction)));
          if (!other?.tile.path || !placed.tile.path) continue;

          const mine = seamFootprint(placed.tile.path.polygon, direction, R, [0, 0]);
          const shift = axialToWorld(DIRECTIONS[direction]!, R);
          const theirs = seamFootprint(other.tile.path.polygon, direction, R, shift);
          if (!mine || !theirs) continue;

          compared++;
          const where = `${boardSeed} ${hexKey(placed.tile.coord)} dir ${direction}`;
          expect(Math.abs(mine.start - theirs.start), `${where} start`).toBeLessThan(0.4);
          expect(Math.abs(mine.end - theirs.end), `${where} end`).toBeLessThan(0.4);
        }
      }
    }
    expect(compared, 'shared path seams compared').toBeGreaterThan(10);
  });

  it('crosses a seam square-on, at the corridor width and centred on the edge', () => {
    // A corridor that meets the edge at an angle is wider than the road and offset along the
    // seam; both tiles picking their own angle is what made the joins step.
    for (let i = 0; i < 24; i++) {
      const edges: EdgeType[] = ['path', 'land', 'land', 'path', 'land', 'land'];
      const tile = generateTile({ seed: `square${i}`, biome: 'meadow', R, edges });
      if (!tile.path) continue;
      for (const direction of [0, 3]) {
        const span = seamFootprint(tile.path.polygon, direction, R, [0, 0]);
        expect(span, `square${i} dir ${direction}`).not.toBeNull();
        // Centred on the edge midpoint, which is half way along the edge.
        const centre = (span!.start + span!.end) / 2;
        expect(Math.abs(centre - R / 2), `square${i} dir ${direction} centre`).toBeLessThan(0.5);
        // And exactly the corridor's own width, not width / cos(angle).
        expect(span!.end - span!.start, `square${i} dir ${direction} width`).toBeCloseTo(
          PATH_WIDTH,
          1,
        );
      }
    }
  });

  it('lines the corridors up across a path seam', () => {
    for (const placed of board.tiles) {
      for (let direction = 0; direction < 6; direction++) {
        if (placed.tile.edges[direction] !== 'path') continue;
        const other = byKey.get(hexKey(neighbour(placed.tile.coord, direction)));
        if (!other || !placed.tile.path || !other.tile.path) continue;
        // Both corridors must arrive at the shared edge with a comparable width.
        const mine = seamBand(placed.tile.path.polygon, direction, R);
        const theirs = seamBand(other.tile.path.polygon, (direction + 3) % 6, R);
        expect(mine).toBeGreaterThan(6);
        expect(theirs).toBeGreaterThan(6);
      }
    }
  });
});

describe('regenerating', () => {
  it('gives a tile the same content however the board was assembled', () => {
    const coord = { q: 1, r: 0 };
    const full: BoardPlan = { '0,0': 'coast', '1,0': 'lake', '1,-1': 'meadow' };
    const built = generateBoard({ seed: 'order', R, connectors: 'dovetail', plan: full });

    // The same occupancy, described in a different order.
    const shuffled: BoardPlan = { '1,-1': 'meadow', '1,0': 'lake', '0,0': 'coast' };
    const again = generateBoard({ seed: 'order', R, connectors: 'dovetail', plan: shuffled });

    const pick = (board: typeof built) =>
      board.tiles.find((t) => hexKey(t.tile.coord) === hexKey(coord))!;
    expect(pick(again).tile.edges).toEqual(pick(built).tile.edges);
    expect(pick(again).tile.placements).toEqual(pick(built).tile.placements);
  });

  it('leaves the far side of the board untouched when a tile is added', () => {
    const before = generateBoard({
      seed: 'grow',
      R,
      connectors: 'dovetail',
      plan: { '0,0': 'forest', '1,0': 'forest' },
    });
    const after = generateBoard({
      seed: 'grow',
      R,
      connectors: 'dovetail',
      plan: { '0,0': 'forest', '1,0': 'forest', '3,0': 'forest' },
    });

    // (0,0) does not touch (3,0), so nothing about it may change.
    const pick = (board: typeof before, key: string) =>
      board.tiles.find((t) => hexKey(t.tile.coord) === key)!;
    expect(pick(after, '0,0').tile.edges).toEqual(pick(before, '0,0').tile.edges);
    expect(pick(after, '0,0').tile.placements).toEqual(pick(before, '0,0').tile.placements);
  });
});

describe('board solids', () => {
  it('bakes each tile origin into its geometry', () => {
    const plan: BoardPlan = { '0,0': 'meadow', '1,0': 'meadow' };
    const board = generateBoard({ seed: 'bake', R, connectors: 'dovetail', plan });
    const solids = boardSolids(board);
    expect(solids.length).toBe(board.tiles.reduce((n, t) => n + t.tile.solids.length, 0));

    const [x] = axialToWorld({ q: 1, r: 0 }, R);
    let maxX = -Infinity;
    for (const solid of solids) {
      const position = solid.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) maxX = Math.max(maxX, position.getX(i));
    }
    expect(maxX).toBeGreaterThan(x);
    expect(triangleCount(solids)).toBe(board.triangles);
  });
});

describe('board encoding', () => {
  it('round-trips a plan', () => {
    const plan = mixedFlower('encode');
    expect(decodeBoard(encodeBoard(plan))).toEqual(plan);
  });

  it('round-trips negative coordinates', () => {
    const plan: BoardPlan = { '-2,3': 'alpine', '0,-1': 'desert' };
    expect(decodeBoard(encodeBoard(plan))).toEqual(plan);
  });

  it('rejects rubbish rather than producing a broken board', () => {
    expect(decodeBoard('')).toBeNull();
    expect(decodeBoard('nonsense')).toBeNull();
    expect(decodeBoard('0.0.99')).toBeNull();
    expect(decodeBoard('x.y.0')).toBeNull();
  });

  it('keeps keys parseable', () => {
    for (const key of Object.keys(mixedFlower('keys'))) {
      const coord = parseHexKey(key);
      expect(hexKey(coord)).toBe(key);
    }
  });
});
