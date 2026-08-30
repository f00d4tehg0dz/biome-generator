// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The generation dials.
 *
 * Two things matter and neither is obvious from reading the code. At 1 the board has to be
 * exactly the board that was there before the dials existed, or every seed anyone has shared
 * quietly changes meaning. At 0 the feature has to be genuinely gone rather than rare, which
 * is the difference between "a set of plain interlocking hexes" and "keep re-rolling until
 * you get one".
 */

import { describe, expect, it } from 'vitest';
import { generateBoard, singleTile, type BoardPlan } from './board';
import { generateTile } from './tile';
import { resolveEdges } from './edges';
import { FULL_DETAIL, clampDetail, isFullDetail, type Detail } from './detail';
import { hexKey, hexSpiral } from '../core/hex';
import { BIOME_IDS, type BiomeId } from '../gen/biomes';
import { hashInt } from '../core/rng';

const R = 50;

function flower(seed: string): BoardPlan {
  const plan: BoardPlan = {};
  hexSpiral(1).forEach((coord, i) => {
    plan[hexKey(coord)] = BIOME_IDS[hashInt(0, BIOME_IDS.length - 1, seed, 'b', i)]! as BiomeId;
  });
  return plan;
}

const board = (seed: string, detail?: Detail, plan = flower(seed)) =>
  generateBoard({ seed, R, connectors: 'dovetail', plan, detail });

const vertices = (b: ReturnType<typeof board>) =>
  b.tiles.flatMap(({ tile }) =>
    tile.solids.flatMap((solid) => Array.from(solid.geometry.getAttribute('position').array)),
  );

const edgesOf = (b: ReturnType<typeof board>) => b.tiles.flatMap(({ tile }) => tile.edges);

describe('detail', () => {
  it('changes nothing at all when everything is left alone', () => {
    for (const seed of ['a', 'b', 'peak7']) {
      expect(vertices(board(seed, FULL_DETAIL)), seed).toEqual(vertices(board(seed)));
    }
  });

  it('lays down no props at zero, and keeps the ground it stands on', () => {
    const bare = board('bare', { ...FULL_DETAIL, props: 0 });

    expect(bare.tiles.every((t) => t.tile.placements.length === 0)).toBe(true);
    expect(bare.tiles.every((t) => t.tile.solids.every((s) => !s.name.startsWith('prop.')))).toBe(
      true,
    );
    // Still a printable tile: strata, terraces, connectors.
    expect(bare.triangles).toBeGreaterThan(0);
    expect(bare.tiles.every((t) => t.tile.solids.length > 2)).toBe(true);
  });

  it('places fewer props as the dial comes down', () => {
    const counts = [1, 0.5, 0.2].map((props) =>
      board('density', { ...FULL_DETAIL, props }).tiles.reduce(
        (sum, t) => sum + t.tile.placements.length,
        0,
      ),
    );
    expect(counts[0]!).toBeGreaterThan(counts[1]!);
    expect(counts[1]!).toBeGreaterThanOrEqual(counts[2]!);
  });

  it('leaves no road on any seam at zero, over many boards', () => {
    for (let i = 0; i < 40; i++) {
      const dry = board(`road${i}`, { ...FULL_DETAIL, paths: 0 });
      expect(edgesOf(dry), `road${i}`).not.toContain('path');
      expect(dry.tiles.every((t) => t.tile.path === null), `road${i}`).toBe(true);
    }
  });

  it('leaves no water on any seam at zero, and none inside the tile', () => {
    for (let i = 0; i < 40; i++) {
      const dry = board(`dry${i}`, { ...FULL_DETAIL, water: 0 });
      expect(edgesOf(dry), `dry${i}`).not.toContain('water');
      expect(edgesOf(dry), `dry${i}`).not.toContain('shore');
      expect(dry.tiles.every((t) => t.tile.water === null), `dry${i}`).toBe(true);
    }
  });

  it('still gives a lake tile dry land rather than nothing', () => {
    const lake = board('lake', { ...FULL_DETAIL, water: 0 }, singleTile('lake'));
    expect(lake.tiles[0]!.tile.solids.length).toBeGreaterThan(2);
    expect(lake.tiles[0]!.tile.water).toBeNull();
  });

  it('keeps both sides of a seam agreeing, which is the whole contract', () => {
    // The dials scale weights rather than rolls, and they are a property of the board, so
    // two neighbours must still derive the same type for the edge between them.
    const detail: Detail = { props: 1, paths: 0.3, water: 0.4 };
    const plan = flower('seam');
    const at = (coord: { q: number; r: number }) =>
      resolveEdges('seam', coord, plan[hexKey(coord)]!, (d) => {
        const n = [
          { q: 1, r: 0 },
          { q: 1, r: -1 },
          { q: 0, r: -1 },
          { q: -1, r: 0 },
          { q: -1, r: 1 },
          { q: 0, r: 1 },
        ][d]!;
        return plan[hexKey({ q: coord.q + n.q, r: coord.r + n.r })] ?? null;
      }, detail);

    const centre = at({ q: 0, r: 0 });
    const east = at({ q: 1, r: 0 });
    // Direction 0 from the centre is direction 3 from its eastern neighbour.
    expect(centre[0]).toBe(east[3]);
  });

  it('turns a tile up as well as down, until the ground runs out', () => {
    const count = (biome: BiomeId, props: number) =>
      generateTile({ seed: 'more', biome, R, detail: { ...FULL_DETAIL, props } }).placements.length;

    expect(count('meadow', 1.8)).toBeGreaterThan(count('meadow', 1));

    // A forest is close to packed at its own figure, and scatter refuses to overlap props
    // whatever it is asked for, so asking for more buys very little. Worth pinning: the
    // dial is honest about running out of room rather than stacking trees.
    expect(count('forest', 2)).toBeGreaterThanOrEqual(count('forest', 1));
    expect(count('forest', 2)).toBeLessThan(count('forest', 1) * 1.3);
  });

  it('refuses nonsense from a hand-edited link', () => {
    expect(clampDetail({ props: -3, paths: 99, water: Number.NaN })).toEqual({
      props: 0,
      paths: 2,
      water: 1,
    });
    expect(clampDetail(undefined)).toEqual(FULL_DETAIL);
    expect(isFullDetail(FULL_DETAIL)).toBe(true);
    expect(isFullDetail({ props: 0, paths: 1, water: 1 })).toBe(false);
  });
});
