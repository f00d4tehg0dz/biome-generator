// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The prop registry. Biomes compose from this; they never author meshes themselves.
 */

import { TREES } from './trees';
import { ROCKS } from './rocks';
import { NATURE } from './nature';
import { BUILT } from './built';
import { WATER } from './water';
import { soloContext, type PropDef } from './prop';
import { makeRng } from '../core/rng';
import { smallestFeature } from '../check/features';

export const PROPS = { ...TREES, ...ROCKS, ...NATURE, ...BUILT, ...WATER } satisfies Record<
  string,
  PropDef
>;

export type PropId = keyof typeof PROPS;

export const PROP_IDS = Object.keys(PROPS) as PropId[];

/** Grouped for the gallery and for biome authoring. */
export const PROP_FAMILIES: { name: string; ids: PropId[] }[] = [
  { name: 'Trees', ids: Object.keys(TREES) as PropId[] },
  { name: 'Rock', ids: Object.keys(ROCKS) as PropId[] },
  { name: 'Ground cover', ids: Object.keys(NATURE) as PropId[] },
  { name: 'Built', ids: Object.keys(BUILT) as PropId[] },
  { name: 'Water', ids: Object.keys(WATER) as PropId[] },
];

export function prop(id: PropId): PropDef {
  return PROPS[id];
}

const minFeatures = new Map<PropId, number>();
const radii = new Map<PropId, number>();

/**
 * How far a prop actually reaches from its own origin, in millimetres at nominal scale.
 *
 * Measured over several seeds rather than taken from `PropDef.footprint`, because a declared
 * footprint is a hint and hints drift: a three-bay fence spans 13.6 mm while declaring 9, and
 * the difference is a prop hanging over the tile edge into its neighbour.
 */
export function propRadius(id: PropId): number {
  const cached = radii.get(id);
  if (cached !== undefined) return cached;

  let reach = 0;
  // Enough seeds that this is a dependable bound rather than a sample. Six was not: a bush
  // whose random radius landed at the top of its range reached further than any of the six
  // measured, and scatter spaced it as if it had not.
  for (let seed = 0; seed < 48; seed++) {
    for (const solid of PROPS[id].build(soloContext(makeRng('radius', id, seed)))) {
      const position = solid.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        reach = Math.max(reach, Math.hypot(position.getX(i), position.getY(i)));
      }
    }
  }
  radii.set(id, reach);
  return reach;
}

/**
 * The thinnest authored dimension of a prop, in millimetres at nominal scale: what scatter
 * culls on when a tile is small or a satellite is shrunk.
 *
 * Measured rather than declared, and the per-solid bounding box is a fair proxy now that
 * interpenetrating parts are separate solids: a fence rail, a bench leg and a palm frond are
 * each their own volume, so each contributes its own true thickness.
 */
export function propMinFeature(id: PropId): number {
  const cached = minFeatures.get(id);
  if (cached !== undefined) return cached;

  const solids = PROPS[id].build(soloContext(makeRng('minfeature', id)));
  const measured = smallestFeature(solids);
  minFeatures.set(id, measured);
  return measured;
}

export * from './prop';
export * from './solid';
export { basin, waterSlab, waterFacet, WATER_DROP, BASIN_DEPTH } from './water';
