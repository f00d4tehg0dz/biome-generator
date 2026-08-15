// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The semantic vocabulary every kit builder emits. Builders say what a thing *is*;
 * the biome decides what slot it lands in, and export decides what colour that becomes.
 * No hex value ever appears in kit or generation code.
 */

export const MATERIALS = [
  'grass',
  'soil',
  'stone',
  'sand',
  'snow',
  'foliage',
  'blossom',
  'wood',
  'water',
  'rock',
  'path',
  'roof',
  'fabric',
] as const;

export type MaterialId = (typeof MATERIALS)[number];
