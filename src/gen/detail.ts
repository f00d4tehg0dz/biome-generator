// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * How much of a biome you actually want.
 *
 * A biome says what a place is like; this says how strongly. It exists because the two
 * things people asked for after printing a set turned out to be the same knob at different
 * settings. Strip the props and a tile becomes a plain interlocking hex, which is a
 * perfectly good thing to want and was previously impossible. Turn the edge features down
 * and more tiles become interchangeable, because what limits how many ways a set can be
 * rearranged is not the middle of a tile, it is whether its neighbours agree at the seam:
 * a board of all-land edges rearranges freely, one where every other seam carries a road
 * has only a handful of valid layouts.
 *
 * These are multipliers rather than absolute counts. The biome keeps authorship of what
 * belongs where and in what proportion; the user says how much of it to lay down. At 1 the
 * numbers are exactly the biome's own, which is why the default board is unchanged.
 */

export interface Detail {
  /** Multiplier on the biome's scatter density. 0 lays down no props at all. */
  props: number;
  /** Multiplier on how willingly an edge becomes a path. 0 means no roads anywhere. */
  paths: number;
  /** Multiplier on water, both at the seams and inside the tile. 0 means dry land. */
  water: number;
}

export const FULL_DETAIL: Detail = { props: 1, paths: 1, water: 1 };

/** Sliders are in tenths; anything outside this is a typo or a hand-edited URL. */
export const MAX_DETAIL = 2;

export function clampDetail(detail: Partial<Detail> | undefined): Detail {
  return {
    props: clamp(detail?.props),
    paths: clamp(detail?.paths),
    water: clamp(detail?.water),
  };
}

function clamp(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(MAX_DETAIL, Math.max(0, Math.round(value * 100) / 100));
}

/** True when nothing has been turned down, so the biome speaks for itself. */
export function isFullDetail(detail: Detail): boolean {
  return detail.props === 1 && detail.paths === 1 && detail.water === 1;
}
