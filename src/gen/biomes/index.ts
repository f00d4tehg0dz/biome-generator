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
  'dungeon',
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
  /**
   * Walls at the seams, with a doorway wherever a corridor crosses.
   *
   * A flag rather than data because what it turns on is geometry, and geometry belongs in
   * `src/gen/`. Only an interior has this: a meadow with a wall round it is a garden.
   */
  walled?: boolean;
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
        // No bushes here, on the advice of someone who printed a set on one nozzle. A tree
        // carries its foliage well above the grass, so on a single-extruder printer the
        // colours arrive as bands and you swap filament a handful of times at known layers.
        // A bush is foliage sitting *in* the ground band, which forces the same two colours
        // to alternate for the whole lower third of the print. Every other biome keeps its
        // bushes; the park is the one people print plain.
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
        { id: 'caveMouth', weight: 2 },
        { id: 'caveCrack', weight: 2 },
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
      hero: ['peak', 'caveEntrance'],
      weights: [
        { id: 'peak', weight: 2 },
        { id: 'conifer', weight: 5, scale: [0.75, 1.0] },
        { id: 'sapling', weight: 2 },
        { id: 'boulder', weight: 4 },
        { id: 'rockCluster', weight: 3 },
        { id: 'cairn', weight: 2 },
        { id: 'bare', weight: 1 },
        { id: 'caveMouth', weight: 2 },
        { id: 'caveEntrance', weight: 2 },
        { id: 'caveCrack', weight: 2 },
        { id: 'crystal', weight: 1 },
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
        { id: 'caveMouth', weight: 2 },
        { id: 'caveCrack', weight: 2 },
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
      hero: ['cabin', 'caveEntrance'],
      weights: [
        { id: 'bare', weight: 5 },
        { id: 'conifer', weight: 3 },
        { id: 'cabin', weight: 2 },
        { id: 'icePatch', weight: 4 },
        { id: 'boulder', weight: 3 },
        { id: 'rockCluster', weight: 2 },
        { id: 'stump', weight: 2 },
        { id: 'signpost', weight: 1 },
        { id: 'caveMouth', weight: 2 },
        { id: 'caveEntrance', weight: 1 },
        { id: 'crystal', weight: 2 },
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

  dungeon: {
    id: 'dungeon',
    name: 'Dungeon',
    blurb: 'Flagstone floor, standing and fallen pillars, braziers, a corridor through.',
    // Two greys and a warm one. The whole biome hangs on the third: a room lit only by the
    // colour of its own floor is a paving slab, and the brazier is what makes it a place.
    palette: { S0: '#B4B0A6', S1: '#8A8078', S2: '#D89A54', S3: '#DCD6C8' },
    // Stone is the floor here rather than an accent, rubble takes the base, and the flame
    // material claims the feature slot the way a canopy does above ground.
    binding: bindingWith({ stone: 'S0', rock: 'S1', wood: 'S1', blossom: 'S2', path: 'S3' }),
    ground: 'stone',
    // Flat on purpose. A room with a rolling floor is a cave.
    terrain: { relief: 0.04, roughness: 0.12 },
    water: null,
    walled: true,
    // Corridors are the point: a dungeon tile with no way in is a room nobody can reach.
    path: 0.95,
    scatter: {
      // Lower than anything above ground. A room is mostly floor, and at the density a
      // meadow uses the pillars closed ranks until the tile read as a colonnade with no
      // room in it.
      density: 0.13,
      hero: ['pillar'],
      // Interior only. Nothing in this list grows, and nothing in it belongs on a hillside:
      // boulders and cairns and mushrooms read as a rockery that happens to be paved, which
      // is what the first version of this biome looked like. What is left is architecture
      // and what architecture leaves behind.
      weights: [
        // Pillars are pinned near full size. The default scatter range dips to 0.85, which
        // takes the shaft under MIN_DURABLE, and a column is exactly the part that snaps.
        { id: 'pillar', weight: 4, scale: [0.95, 1.15] },
        { id: 'brokenPillar', weight: 4, scale: [0.95, 1.2] },
        { id: 'dungeonWall', weight: 4, scale: [0.95, 1.1] },
        { id: 'masonry', weight: 4 },
        { id: 'brazier', weight: 3 },
        { id: 'crate', weight: 3 },
        { id: 'sarcophagus', weight: 2 },
        { id: 'archway', weight: 2, scale: [0.95, 1.1] },
        // Dripstone, where the roof has been leaking for a few centuries.
        { id: 'stalagmite', weight: 1, scale: [0.7, 1] },
      ],
    },
  },

};

export const BIOME_LIST: Biome[] = BIOME_IDS.map((id) => BIOMES[id]);

