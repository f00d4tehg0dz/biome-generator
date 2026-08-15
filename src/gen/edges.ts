// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The edge contract.
 *
 * Each of a hex's six edges gets a type derived from `hash(seed, edgeKey)`, where `edgeKey`
 * is the *sorted* pair of tile coordinates. Both neighbours compute the same key and so
 * derive the same type without communicating, which is what lets tiles be generated in any
 * order, lazily, and still meet at the seam (CLAUDE.md invariant 5).
 *
 * An *open* edge, one with no neighbour yet, is sampled from the tile's own biome instead,
 * so a lone meadow tile still gets a path across it. Placing a neighbour there re-resolves
 * the edge from the pair and regenerates both tiles. A tile is therefore a pure function of
 * the board's occupancy, not of the order the board was built in.
 */

import { hashUnit } from '../core/rng';
import { edgeKey, DIRECTIONS, type Axial } from '../core/hex';
import { BIOMES, type BiomeId } from './biomes';

export const EDGE_TYPES = ['land', 'water', 'shore', 'path'] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

/**
 * `cliff` is in the design but not here yet: it needs a terrace wall standing at the tile
 * boundary, which the 6 mm composition margin currently forbids. It falls back to `land`.
 */

export type EdgeWeights = Partial<Record<EdgeType, number>>;

/** What each biome is willing to present at an edge, and how often. */
const BIOME_EDGES: Record<BiomeId, EdgeWeights> = {
  meadow: { land: 6, path: 5 },
  forest: { land: 8, path: 3 },
  coast: { land: 2, water: 6, shore: 4, path: 1 },
  alpine: { land: 9, path: 1 },
  lake: { land: 5, water: 3, shore: 3, path: 2 },
  desert: { land: 7, path: 3 },
  tundra: { land: 7, water: 2, shore: 2, path: 1 },
  village: { land: 4, path: 7 },
};

/**
 * Which types a pair of biomes may share. Water only crosses a seam when both sides can
 * hold water; where one can and the other cannot, the seam is a shore.
 */
function allowedBetween(a: BiomeId, b: BiomeId): EdgeType[] {
  const left = BIOME_EDGES[a];
  const right = BIOME_EDGES[b];
  const shared = EDGE_TYPES.filter((type) => (left[type] ?? 0) > 0 && (right[type] ?? 0) > 0);

  // A generator that cannot fail is a generator that ships: land is always available.
  return shared.length > 0 ? shared : ['land'];
}

/** Deterministic weighted choice from a stateless hash: no Rng, so no ordering effects. */
function pickWeighted(types: readonly EdgeType[], weight: (type: EdgeType) => number, roll: number): EdgeType {
  const total = types.reduce((sum, type) => sum + Math.max(0, weight(type)), 0);
  if (total <= 0) return 'land';
  let remaining = roll * total;
  for (const type of types) {
    remaining -= Math.max(0, weight(type));
    if (remaining <= 0) return type;
  }
  return types[types.length - 1]!;
}

/**
 * The type of the edge between `coord` and its neighbour in `direction`.
 * `neighbourBiome` is null when nothing has been placed there yet.
 */
export function edgeTypeAt(
  seed: string,
  coord: Axial,
  biome: BiomeId,
  direction: number,
  neighbourBiome: BiomeId | null,
): EdgeType {
  const d = DIRECTIONS[((direction % 6) + 6) % 6]!;
  const other: Axial = { q: coord.q + d.q, r: coord.r + d.r };
  const roll = hashUnit(seed, 'edge', edgeKey(coord, other));

  if (neighbourBiome === null) {
    const weights = BIOME_EDGES[biome];
    const available = EDGE_TYPES.filter((type) => (weights[type] ?? 0) > 0);
    return pickWeighted(available, (type) => weights[type] ?? 0, roll);
  }

  const available = allowedBetween(biome, neighbourBiome);
  const left = BIOME_EDGES[biome];
  const right = BIOME_EDGES[neighbourBiome];
  // Both sides weigh in, so a coast beside a meadow leans the way both can live with.
  return pickWeighted(available, (type) => (left[type] ?? 0) + (right[type] ?? 0), roll);
}

/** All six edge types for a tile, given whatever neighbours currently exist. */
export function resolveEdges(
  seed: string,
  coord: Axial,
  biome: BiomeId,
  neighbourAt: (direction: number) => BiomeId | null,
): EdgeType[] {
  return [0, 1, 2, 3, 4, 5].map((direction) =>
    edgeTypeAt(seed, coord, biome, direction, neighbourAt(direction)),
  );
}

/** Directions presenting a given type. */
export function directionsWith(edges: readonly EdgeType[], type: EdgeType): number[] {
  return edges.flatMap((edge, direction) => (edge === type ? [direction] : []));
}

/** A biome that cannot hold water never presents one, whatever the edge says. */
export function canHoldWater(biome: BiomeId): boolean {
  return BIOMES[biome].water !== null;
}
