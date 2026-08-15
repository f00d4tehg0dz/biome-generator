// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Four colour slots, because four is the AMS/CFS ceiling this project targets.
 * Each biome binds the 13 materials onto these 4 slots. See docs/export-spec.md §1.2.
 */

import type { MaterialId } from './materials';

export const SLOT_ORDER = ['S0', 'S1', 'S2', 'S3'] as const;
export type SlotId = (typeof SLOT_ORDER)[number];

export const SLOT_NAMES: Record<SlotId, string> = {
  S0: 'Ground',
  S1: 'Base',
  S2: 'Feature',
  S3: 'Accent',
};

export type SlotBinding = Record<MaterialId, SlotId>;
export type SlotPalette = Record<SlotId, string>;

/**
 * The binding used unless a biome overrides it. Suits land biomes, where the signature
 * colour is the canopy. Water biomes flip `foliage` to S0 and give S2 to the water,
 * which is what the reference coast image actually shows.
 */
export const DEFAULT_BINDING: SlotBinding = {
  grass: 'S0',
  sand: 'S0',
  snow: 'S0',
  soil: 'S1',
  wood: 'S1',
  foliage: 'S2',
  water: 'S2',
  stone: 'S3',
  path: 'S3',
  rock: 'S3',
  blossom: 'S3',
  roof: 'S3',
  fabric: 'S3',
};

export function bindingWith(overrides: Partial<SlotBinding>): SlotBinding {
  return { ...DEFAULT_BINDING, ...overrides };
}
