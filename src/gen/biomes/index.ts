// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Biome definitions. Data only. See docs/biomes.md.
 *
 * A biome says what it looks like (palette, binding), what shape its ground takes (terrain,
 * water, path) and what grows on it (scatter). If a biome needs a *rule* rather than a
 * number, that rule belongs in `src/gen/` behind a flag, not as a special case here.
 */

import { KEEP_FEATURE_OVERRIDE, type ReductionOverride } from '../../palette/reduce';
import { bindingWith, type SlotBinding, type SlotPalette } from '../../palette/slots';
import type { MaterialId } from '../../palette/materials';
import type { ScatterSpec } from '../scatter';
import type { WaterSpec } from '../water';

export const BIOME_IDS = [
  'meadow',
  'forest',
  'coast',
  'alpine',
  'lake',
  'desert',
  'tundra',
  'village',
] as const;

export type BiomeId = (typeof BIOME_IDS)[number];

export interface BiomeTerrain {
  /** 0 = flat, 1 = four terraces. Drives how many terrace steps a tile gets. */
  relief: number;
  /** 0 = smooth outlines, 1 = strongly lobed. */
  roughness: number;
}

export interface Biome {
  id: BiomeId;
  name: string;
  blurb: string;
  palette: SlotPalette;
  binding: SlotBinding;
  reduction?: ReductionOverride;
  /** What the walkable surface is made of. */
  ground: MaterialId;
  terrain: BiomeTerrain;
  water: WaterSpec | null;
  /** Chance of a path corridor crossing the tile, 0..1. */
  path: number;
  scatter: ScatterSpec;
}

export const BIOMES: Record<BiomeId, Biome> = {
  meadow: {
    id: 'meadow',
    name: 'Meadow / Park',
    blurb: 'Calm and mostly empty. A path, a bench, blossom trees in loose clusters.',
    palette: { S0: '#CCD8B4', S1: '#D8B484', S2: '#B4CCA8', S3: '#E8DCC8' },
    // The blossom canopy is this biome's signature colour, not the accent.
    binding: bindingWith({ blossom: 'S2' }),
    ground: 'grass',
    terrain: { relief: 0.1, roughness: 0.25 },
    water: null,
    path: 0.85,
    scatter: {
      density: 0.26,
      hero: ['blossom'],
      weights: [
        { id: 'blossom', weight: 5 },
        { id: 'roundCrown', weight: 3 },
        { id: 'sapling', weight: 2 },
        { id: 'bush', weight: 3 },
        { id: 'flowerPatch', weight: 4 },
        { id: 'bench', weight: 3 },
        { id: 'picnicTable', weight: 2 },
        { id: 'lamp', weight: 2 },
        { id: 'signpost', weight: 1 },
        { id: 'boulder', weight: 1 },
      ],
    },
  },

  forest: {
    id: 'forest',
    name: 'Forest',
    blurb: 'Dense conifers, boulders, fallen logs, a narrow track.',
    palette: { S0: '#BFCFA6', S1: '#C79C70', S2: '#8FAE84', S3: '#D6C8AE' },
    binding: bindingWith({}),
    ground: 'grass',
    terrain: { relief: 0.36, roughness: 0.45 },
    water: null,
    path: 0.5,
    scatter: {
      density: 0.42,
      hero: ['conifer'],
      weights: [
        { id: 'conifer', weight: 8 },
        { id: 'roundCrown', weight: 2 },
        { id: 'sapling', weight: 3 },
        { id: 'stump', weight: 2 },
        { id: 'log', weight: 2 },
        { id: 'mushroom', weight: 3 },
        { id: 'bush', weight: 3 },
        { id: 'boulder', weight: 3 },
        { id: 'rockCluster', weight: 2 },
      ],
    },
  },

  coast: {
    id: 'coast',
    name: 'Coast',
    blurb: 'A sand shelf around a bay. Dock, dune grass, scattered rocks.',
    palette: { S0: '#CCCCA8', S1: '#D8B484', S2: '#54A8C0', S3: '#E4D8CC' },
    // Water takes the feature slot, so canopies fall back to the ground green,
    // which is exactly what the reference coast image shows.
    binding: bindingWith({ foliage: 'S0' }),
    reduction: KEEP_FEATURE_OVERRIDE,
    ground: 'sand',
    terrain: { relief: 0.14, roughness: 0.35 },
    water: { coverage: 0.82, drift: 0.5 },
    path: 0.4,
    scatter: {
      density: 0.24,
      hero: ['hut'],
      weights: [
        { id: 'palm', weight: 4 },
        { id: 'duneGrass', weight: 5 },
        { id: 'boulder', weight: 3 },
        { id: 'rockCluster', weight: 2 },
        { id: 'hut', weight: 2 },
        { id: 'tent', weight: 2 },
        { id: 'dock', weight: 3 },
        { id: 'rowboat', weight: 2 },
        { id: 'foamRing', weight: 2 },
      ],
    },
  },

  alpine: {
    id: 'alpine',
    name: 'Alpine',
    blurb: 'Stacked terraces into a snow-capped peak. Sparse pines, a cairn.',
    palette: { S0: '#C4CFC0', S1: '#B8AC9C', S2: '#EDEFE8', S3: '#8FA090' },
    binding: bindingWith({ snow: 'S2', foliage: 'S3' }),
    ground: 'grass',
    terrain: { relief: 0.85, roughness: 0.55 },
    water: null,
    path: 0.3,
    scatter: {
      density: 0.2,
      hero: ['peak'],
      weights: [
        { id: 'peak', weight: 2 },
        { id: 'conifer', weight: 5, scale: [0.75, 1.0] },
        { id: 'sapling', weight: 2 },
        { id: 'boulder', weight: 4 },
        { id: 'rockCluster', weight: 3 },
        { id: 'cairn', weight: 2 },
        { id: 'bare', weight: 1 },
      ],
    },
  },

  lake: {
    id: 'lake',
    name: 'Lake / Wetland',
    blurb: 'A pool in the middle, reeds and lily pads at the margin, a jetty.',
    palette: { S0: '#C2D2AC', S1: '#C0A078', S2: '#6FB4C2', S3: '#DCD2B4' },
    binding: bindingWith({ foliage: 'S0' }),
    reduction: KEEP_FEATURE_OVERRIDE,
    ground: 'grass',
    terrain: { relief: 0.12, roughness: 0.3 },
    water: { coverage: 0.66, drift: 0.28 },
    path: 0.45,
    scatter: {
      density: 0.24,
      hero: ['dock'],
      weights: [
        { id: 'reed', weight: 6 },
        { id: 'lilyPad', weight: 5 },
        { id: 'roundCrown', weight: 3 },
        { id: 'bush', weight: 3 },
        { id: 'dock', weight: 3 },
        { id: 'rowboat', weight: 2 },
        { id: 'boulder', weight: 2 },
        { id: 'flowerPatch', weight: 2 },
      ],
    },
  },

  desert: {
    id: 'desert',
    name: 'Desert',
    blurb: 'Dunes, mesas, cacti, a dry cracked path. Very sparse.',
    palette: { S0: '#E0CFA4', S1: '#CC9C78', S2: '#D8A878', S3: '#9FAF87' },
    // Mesa rock is the signature; the accent slot carries cactus green.
    binding: bindingWith({ rock: 'S2', foliage: 'S3' }),
    ground: 'sand',
    terrain: { relief: 0.3, roughness: 0.4 },
    water: null,
    path: 0.55,
    scatter: {
      density: 0.16,
      hero: ['mesa'],
      weights: [
        { id: 'mesa', weight: 2 },
        { id: 'cactus', weight: 5 },
        { id: 'boulder', weight: 4 },
        { id: 'rockCluster', weight: 3 },
        { id: 'duneGrass', weight: 2 },
        { id: 'cairn', weight: 1 },
        { id: 'signpost', weight: 1 },
      ],
    },
  },

  tundra: {
    id: 'tundra',
    name: 'Tundra',
    blurb: 'Snow ground, bare trees, ice patches, a cabin.',
    palette: { S0: '#DCE2DC', S1: '#B4B0A4', S2: '#C8D8DC', S3: '#9CA49C' },
    binding: bindingWith({ foliage: 'S3' }),
    ground: 'snow',
    terrain: { relief: 0.22, roughness: 0.35 },
    water: { coverage: 0.5, drift: 0.45 },
    path: 0.35,
    scatter: {
      density: 0.2,
      hero: ['cabin'],
      weights: [
        { id: 'bare', weight: 5 },
        { id: 'conifer', weight: 3 },
        { id: 'cabin', weight: 2 },
        { id: 'icePatch', weight: 4 },
        { id: 'boulder', weight: 3 },
        { id: 'rockCluster', weight: 2 },
        { id: 'stump', weight: 2 },
        { id: 'signpost', weight: 1 },
      ],
    },
  },

  village: {
    id: 'village',
    name: 'Village / Farm',
    blurb: 'Striped crop fields, fences, a well, a crossroad path.',
    palette: { S0: '#C8D4A8', S1: '#C79C70', S2: '#D8C084', S3: '#C08C74' },
    // Crops and straw take the gold feature slot; tree canopies stay green with the ground.
    // Left on the default binding the orchard came out the same terracotta as the barn roof.
    binding: bindingWith({ blossom: 'S2', foliage: 'S0' }),
    ground: 'grass',
    terrain: { relief: 0.06, roughness: 0.2 },
    water: null,
    path: 0.9,
    scatter: {
      density: 0.3,
      hero: ['barn'],
      weights: [
        { id: 'barn', weight: 2 },
        { id: 'hut', weight: 3 },
        { id: 'cropRow', weight: 5 },
        { id: 'fence', weight: 4 },
        { id: 'haystack', weight: 3 },
        { id: 'well', weight: 2 },
        { id: 'roundCrown', weight: 3 },
        { id: 'signpost', weight: 1 },
        { id: 'bench', weight: 1 },
      ],
    },
  },
};

export const BIOME_LIST: Biome[] = BIOME_IDS.map((id) => BIOMES[id]);

