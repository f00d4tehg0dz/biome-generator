// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The board: a set of tiles on a hex grid, each generated knowing what sits beside it.
 *
 * Every tile is regenerated whenever the board's occupancy changes, because a tile's edges
 * are resolved from its neighbours. That is not wasteful bookkeeping. It is the reason a
 * seam matches. Since the edge type comes from the *sorted* coordinate pair, regenerating
 * gives the identical result whatever order the board was assembled in.
 */

import { axialToWorld, hexKey, hexSpiral, neighbour, parseHexKey, type Axial } from '../core/hex';
import type { ConnectorKind } from '../kit/connectors';
import { triangleCount, type Solid } from '../kit/solid';
import { BIOME_IDS, type BiomeId } from './biomes';
import { resolveEdges, type EdgeType } from './edges';
import { generateTile, type Tile } from './tile';

/** What the user has placed: a biome per occupied cell. */
export type BoardPlan = Record<string, BiomeId>;

export interface BoardSpec {
  seed: string;
  R: number;
  connectors: ConnectorKind;
  plan: BoardPlan;
}

export interface PlacedTile {
  tile: Tile;
  /** Tile centre in board space, millimetres. */
  origin: readonly [number, number];
}

export interface Board {
  tiles: PlacedTile[];
  /** Every empty cell touching an occupied one, where a tile may be added. */
  openings: Axial[];
  triangles: number;
}

export function generateBoard(spec: BoardSpec): Board {
  const coords = Object.keys(spec.plan).map(parseHexKey);

  const tiles = coords.map((coord) => {
    const biome = spec.plan[hexKey(coord)]!;
    const edges: EdgeType[] = resolveEdges(
      spec.seed,
      coord,
      biome,
      (direction) => spec.plan[hexKey(neighbour(coord, direction))] ?? null,
    );

    return {
      tile: generateTile({
        seed: spec.seed,
        biome,
        coord,
        R: spec.R,
        edges,
        connectors: spec.connectors,
      }),
      origin: axialToWorld(coord, spec.R),
    };
  });

  return {
    tiles,
    openings: findOpenings(spec.plan),
    triangles: tiles.reduce((sum, placed) => sum + triangleCount(placed.tile.solids), 0),
  };
}

/** Empty cells adjacent to at least one placed tile, or the origin on an empty board. */
export function findOpenings(plan: BoardPlan): Axial[] {
  const occupied = Object.keys(plan);
  if (occupied.length === 0) return [{ q: 0, r: 0 }];

  const seen = new Set<string>();
  const openings: Axial[] = [];
  for (const key of occupied) {
    const coord = parseHexKey(key);
    for (let direction = 0; direction < 6; direction++) {
      const candidate = neighbour(coord, direction);
      const candidateKey = hexKey(candidate);
      if (plan[candidateKey] || seen.has(candidateKey)) continue;
      seen.add(candidateKey);
      openings.push(candidate);
    }
  }
  return openings;
}

/** Every solid on the board, with each tile's origin baked in. Used by the exporters. */
export function boardSolids(board: Board): Solid[] {
  return board.tiles.flatMap(({ tile, origin }) =>
    tile.solids.map((solid) => {
      if (origin[0] === 0 && origin[1] === 0) return solid;
      const geometry = solid.geometry.clone();
      geometry.translate(origin[0], origin[1], 0);
      return { ...solid, geometry };
    }),
  );
}

const BOARD_SEPARATOR = '_';

/** Compact board encoding for the URL: `q.r.biomeIndex`, joined. */
export function encodeBoard(plan: BoardPlan): string {
  return Object.entries(plan)
    .map(([key, biome]) => {
      const { q, r } = parseHexKey(key);
      return `${q}.${r}.${BIOME_IDS.indexOf(biome)}`;
    })
    .join(BOARD_SEPARATOR);
}

export function decodeBoard(encoded: string): BoardPlan | null {
  const plan: BoardPlan = {};
  for (const entry of encoded.split(BOARD_SEPARATOR)) {
    const [q, r, index] = entry.split('.').map(Number);
    if (!Number.isInteger(q) || !Number.isInteger(r)) return null;
    const biome = BIOME_IDS[index ?? -1];
    if (!biome) return null;
    plan[hexKey({ q: q!, r: r! })] = biome;
  }
  return Object.keys(plan).length > 0 ? plan : null;
}

/** A single tile at the origin, the board every session starts from. */
export function singleTile(biome: BiomeId): BoardPlan {
  return { [hexKey({ q: 0, r: 0 })]: biome };
}

export interface BoardPreset {
  id: string;
  name: string;
  /** How many tiles it lays down, which decides how many plates it costs. */
  tiles: number;
  layout(biome: BiomeId): BoardPlan;
}

const plan = (coords: readonly Axial[], biome: BiomeId): BoardPlan =>
  Object.fromEntries(coords.map((coord) => [hexKey(coord), biome]));

/**
 * Starting shapes, all of them things people actually print: one tile to try a biome, the
 * seven-tile flower the references show, a run of three for a shelf, and the ring, which is
 * the flower with its middle left out so the board reads as a place rather than a lump.
 */
export const BOARD_PRESETS: BoardPreset[] = [
  { id: 'single', name: 'Single tile', tiles: 1, layout: (biome) => singleTile(biome) },
  { id: 'flower', name: 'Flower', tiles: 7, layout: (biome) => plan(hexSpiral(1), biome) },
  {
    id: 'row',
    name: 'Row of three',
    tiles: 3,
    layout: (biome) => plan([{ q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }], biome),
  },
  {
    id: 'ring',
    name: 'Ring',
    tiles: 6,
    layout: (biome) => plan(hexSpiral(1).slice(1), biome),
  },
];

/**
 * Which biome supplies the board's four colours.
 *
 * A board prints with one set of filaments, so it gets one palette, not one per tile. Each
 * tile still contributes its own material→slot binding, so a lake keeps its water in the
 * feature slot; that slot is simply whatever colour the board loaded. Picking the most
 * common biome means a mostly-coast board looks like a coast, and adding one meadow tile to
 * it does not repaint the sea.
 */
export function paletteBiome(plan: BoardPlan): BiomeId {
  const counts = new Map<BiomeId, number>();
  for (const biome of Object.values(plan)) counts.set(biome, (counts.get(biome) ?? 0) + 1);

  let best: BiomeId = BIOME_IDS[0]!;
  let bestCount = -1;
  // Iterate in declaration order so ties resolve the same way every time.
  for (const biome of BIOME_IDS) {
    const count = counts.get(biome) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = biome;
    }
  }
  return best;
}
