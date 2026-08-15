// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Board editing, and the history behind it.
 *
 * Undo is the one feature here that is worse than useless when it is subtly wrong: it hands
 * you a board you did not ask for and there is no way back. So the tests are about what it
 * restores, what it refuses to restore, and where the redo branch goes.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { boardUrl, useApp } from './store';
import { BOARD_PRESETS, decodeBoard } from '../gen/board';
import { hexKey } from '../core/hex';

const initial = useApp.getState();
const app = () => useApp.getState();
const tiles = () => Object.keys(app().plan).length;

const flower = BOARD_PRESETS.find((preset) => preset.id === 'flower')!;

beforeEach(() => useApp.setState(initial, true));

describe('board editing', () => {
  it('places and removes tiles', () => {
    app().place({ q: 1, r: 0 });
    expect(tiles()).toBe(2);
    expect(app().selected).toBe(hexKey({ q: 1, r: 0 }));

    app().remove({ q: 1, r: 0 });
    expect(tiles()).toBe(1);
    expect(app().selected).toBeNull();
  });

  it('retints the selected tile, or the whole board when nothing is selected', () => {
    app().applyPreset(flower);
    app().setBiome('alpine');
    expect(new Set(Object.values(app().plan))).toEqual(new Set(['alpine']));

    app().select({ q: 1, r: -1 });
    app().setBiome('desert');
    expect(app().plan[hexKey({ q: 1, r: -1 })]).toBe('desert');
    expect(Object.values(app().plan).filter((biome) => biome === 'alpine').length).toBe(6);
  });

  it('clamps tile size to what the kit still builds at', () => {
    app().setR(500);
    expect(app().R).toBeLessThanOrEqual(90);
    app().setR(1);
    expect(app().R).toBeGreaterThanOrEqual(30);
  });
});

describe('history', () => {
  it('undoes a placement and redoes it', () => {
    app().place({ q: 1, r: 0 });
    app().undo();
    expect(tiles()).toBe(1);

    app().redo();
    expect(tiles()).toBe(2);
  });

  it('undoes a re-roll, a retint and a preset', () => {
    const seed = app().seed;
    app().reroll();
    app().setBiome('coast');
    app().applyPreset(flower);

    expect(tiles()).toBe(7);
    app().undo();
    expect(tiles()).toBe(1);
    app().undo();
    expect(app().biome).not.toBe('coast');
    app().undo();
    expect(app().seed).toBe(seed);
  });

  it('leaves selection and filament count out of it', () => {
    app().select({ q: 0, r: 0 });
    app().setColourCount(2);
    app().setTab('export');

    expect(app().past).toHaveLength(0);
  });

  it('drops the redo branch once you edit past it', () => {
    app().place({ q: 1, r: 0 });
    app().undo();
    expect(app().future).toHaveLength(1);

    app().place({ q: 0, r: 1 });
    expect(app().future).toHaveLength(0);
    expect(app().plan[hexKey({ q: 1, r: 0 })]).toBeUndefined();
  });

  it('does nothing at either end of the history', () => {
    app().undo();
    app().redo();
    expect(tiles()).toBe(1);
  });

  it('forgets a selection that the board it went back to does not contain', () => {
    app().place({ q: 2, r: 0 });
    expect(app().selected).not.toBeNull();

    app().undo();
    expect(app().selected).toBeNull();
  });

  it('keeps history bounded', () => {
    for (let i = 0; i < 80; i++) app().place({ q: i, r: 0 });
    expect(app().past.length).toBeLessThanOrEqual(60);
  });
});

describe('the shared link', () => {
  it('round-trips the board', () => {
    app().applyPreset(flower);
    app().setBiome('lake');

    const url = new URLSearchParams(boardUrl(app()));
    expect(decodeBoard(url.get('board')!)).toEqual(app().plan);
    expect(url.get('seed')).toBe(app().seed);
  });

  it('carries the tile size only when it is not the default', () => {
    expect(boardUrl(app())).not.toContain('r=');

    app().setR(70);
    expect(boardUrl(app())).toContain('r=70');
  });
});
