// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The print check reports what the underlying checks found, no more and no less.
 *
 * The analyses themselves are exercised where they gate something: kit.test.ts holds every
 * prop to them, tile.test.ts holds every tile. What is worth testing here is the reporting,
 * because a check panel that quietly passes a broken board is worse than no panel at all.
 */

import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import { checkBoard, checkSolids, type CheckId } from './board';
import { generateBoard, singleTile, type BoardPlan } from '../gen/board';
import { hexKey, hexSpiral } from '../core/hex';
import type { Solid } from '../kit/solid';

const flower: BoardPlan = {};
hexSpiral(1).forEach((coord, index) => {
  flower[hexKey(coord)] = (['coast', 'lake', 'meadow', 'forest', 'alpine', 'meadow', 'forest'] as const)[
    index
  ]!;
});

const board = (seed: string, plan: BoardPlan = flower) =>
  generateBoard({ seed, R: 50, connectors: 'dovetail', plan });

const section = (check: ReturnType<typeof checkBoard>, id: CheckId) =>
  check.sections.find((s) => s.id === id)!;

/** A single open triangle: not closed, not attached, and thinner than anything printable. */
function brokenSolid(name: string): Solid {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 40, 2, 0, 40, 0, 2, 40]), 3),
  );
  geometry.setIndex([0, 1, 2]);
  return { name, geometry, material: 'stone' };
}

describe('print check', () => {
  it('passes a generated board', () => {
    for (const seed of ['smoke', 'peak7', 'abc123']) {
      const check = checkBoard(board(seed));
      expect(check.ok, `${seed}: ${JSON.stringify(check.sections)}`).toBe(true);
      expect(section(check, 'manifold').severity).toBe('pass');
      expect(section(check, 'floating').severity).toBe('pass');
    }
  });

  it('counts every solid on the board, not just the first tile', () => {
    const one = checkBoard(board('counts', singleTile('meadow')));
    const seven = checkBoard(board('counts'));

    expect(seven.solids).toBeGreaterThan(one.solids);
    expect(seven.triangles).toBe(
      board('counts').tiles.reduce(
        (sum, placed) =>
          sum +
          placed.tile.solids.reduce((n, s) => n + (s.geometry.getIndex()?.count ?? 0) / 3, 0),
        0,
      ),
    );
  });

  it('fails on a solid that is neither closed nor attached, and names it', () => {
    const check = checkSolids([brokenSolid('tile.rogue')]);

    expect(check.ok).toBe(false);
    expect(section(check, 'manifold').severity).toBe('fail');
    expect(section(check, 'manifold').offenders).toContain('tile.rogue');
    expect(section(check, 'floating').severity).toBe('fail');
    expect(section(check, 'features').severity).toBe('warn');
  });

  it('does not let a warning alone fail the board', () => {
    // A prop reaching unaided within the kit's limits, or a sliver just under the feature
    // size, is worth showing and not worth blocking an export over.
    const check = checkBoard(board('peak7'));
    const warned = check.sections.filter((s) => s.severity === 'warn');

    expect(warned.length).toBeGreaterThan(0);
    expect(check.ok).toBe(true);
  });

  it('names at most five offenders however many there are', () => {
    const check = checkSolids(
      Array.from({ length: 12 }, (_, i) => brokenSolid(`tile.rogue.${i}`)),
    );

    expect(section(check, 'manifold').offenders).toHaveLength(5);
    expect(section(check, 'manifold').summary).toContain('12 of 12');
  });

  it('reports the same verdict for the same seed', () => {
    expect(checkBoard(board('twice'))).toEqual(checkBoard(board('twice')));
  });
});
