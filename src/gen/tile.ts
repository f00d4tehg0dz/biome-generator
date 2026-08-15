// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Tile generation.
 *
 * Deterministic and order-independent: a tile's content derives from
 * `hash(seed, biome, q, r)` plus the six edge types it was handed, and edge types derive
 * from the *sorted* coordinate pair. So a tile is a pure function of the board's occupancy,
 * never of the order the board was built in (CLAUDE.md invariant 5).
 *
 * The pipeline order is a constraint hierarchy. Water is carved first because everything
 * else has to avoid it; the path next, because it has to reach two seams and a landform only
 * has to be somewhere; terraces after that; props last, once the surface they stand on is
 * known.
 */

import { DEFAULT_R, type Axial } from '../core/hex';
import { makeRng } from '../core/rng';
import { insetPolygon, type Polygon } from '../core/polygon';
import { subtract, intersect, type Region } from '../core/boolean';
import { extrudePolygon } from '../kit/prism';
import { extrudeRegion } from '../kit/region';
import { planConnectors, CONNECTOR_TOP, type ConnectorKind } from '../kit/connectors';
import { PROPS } from '../kit';
import {
  BANDS,
  BOTTOM_CHAMFER,
  EMBED,
  GRADE,
  TERRACE_RIM,
  TERRACE_STEP,
  type Solid,
} from '../kit/solid';
import { BASIN_DEPTH, WATER_DROP } from '../kit/water';
import { BIOMES, type BiomeId } from './biomes';
import { generateTerraces, type Terrace } from './terrain';
import { generateWater, hexPolygon } from './water';
import { directionsWith, type EdgeType } from './edges';
import { generatePath, type PathRoute } from './paths';
import { scatter, type Placement } from './scatter';
import { PATH_DROP, Surface } from './surface';

export interface TileParams {
  seed: string;
  biome: BiomeId;
  coord?: Axial;
  /** Circumradius in millimetres. */
  R?: number;
  /** Resolved by the board. Defaults to all `land` for a tile generated on its own. */
  edges?: readonly EdgeType[];
  connectors?: ConnectorKind;
}

export interface Tile {
  coord: Axial;
  biome: BiomeId;
  seed: string;
  R: number;
  edges: readonly EdgeType[];
  solids: Solid[];
  terraces: Terrace[];
  water: Polygon | null;
  path: PathRoute | null;
  placements: Placement[];
  surface: Surface;
  /** Highest point of the tile in millimetres, for framing and plate checks. */
  height: number;
}

const ALL_LAND: EdgeType[] = ['land', 'land', 'land', 'land', 'land', 'land'];

export function generateTile(params: TileParams): Tile {
  const coord = params.coord ?? { q: 0, r: 0 };
  const R = params.R ?? DEFAULT_R;
  const edges = params.edges ?? ALL_LAND;
  const biome = BIOMES[params.biome];
  const rng = makeRng(params.seed, params.biome, coord.q, coord.r);
  const hex = hexPolygon(R);

  const water = generateWater(rng, biome.water, R, edges);
  const path = generatePath(rng, R, water ? [water] : [], directionsWith(edges, 'path'));
  const terraces = generateTerraces(
    rng,
    biome.terrain,
    R,
    [water, path?.polygon].filter((p): p is Polygon => Boolean(p)),
  );

  const surface = new Surface({ R, terraces, water, path: path?.polygon ?? null });
  const placements = scatter(rng, biome.scatter, surface, path);

  const solids: Solid[] = [];
  const connectors = planConnectors(params.connectors ?? 'dovetail', R);

  // Strata. Each band starts EMBED below the one under it so the two fuse at slice time,
  // and that overlapping section is chamfered rather than straight-walled: a flush overlap
  // would put two coplanar side walls in the same 0.4 mm strip, which z-fights on screen and
  // is ambiguous to a slicer. The taper reaches full profile exactly where the band below
  // ends, so the tile's silhouette is unchanged.
  //
  // The stone band also carries the connectors: slots cut out of it, tabs added alongside.
  for (const [index, region] of subtract(hex, connectors.slots).entries()) {
    solids.push(
      extrudeRegion(region.contour, region.holes, {
        name: `tile.stone.${index}`,
        material: 'stone',
        z0: 0,
        z1: BANDS.stoneTop,
        chamfer: BOTTOM_CHAMFER,
      }),
    );
  }
  for (const [index, tab] of connectors.tabs.entries()) {
    solids.push(
      extrudePolygon(tab, {
        name: `tile.connector.${index}`,
        material: 'stone',
        z0: 0,
        z1: CONNECTOR_TOP,
        chamfer: BOTTOM_CHAMFER,
      }),
    );
  }

  solids.push(
    extrudeRegion(hex, [], {
      name: 'tile.soil',
      material: 'soil',
      z0: BANDS.stoneTop - EMBED,
      z1: BANDS.soilTop,
      chamfer: EMBED,
    }),
  );

  // The ground slab is the hexagon with the water body and the path corridor removed. Either
  // may run off the tile edge, in which case the result is a bite out of the outline rather
  // than a hole, and either may split the slab in two, which is why this is a region *set*.
  // Their floors are the soil band's top surface, so no separate basin geometry is needed.
  const cutters = [water, path?.polygon].filter((p): p is Polygon => Boolean(p));
  for (const [index, region] of subtract(hex, cutters).entries()) {
    solids.push(
      extrudeRegion(region.contour, region.holes, {
        name: `tile.ground.${index}`,
        material: biome.ground,
        z0: BANDS.soilTop - EMBED,
        z1: GRADE,
      }),
    );
  }

  // Fills, grown by EMBED so each buries its edge inside the slab it sits in rather than
  // meeting it flush, then clipped back to the tile so nothing overhangs the seam.
  if (water) {
    pushFill(solids, water, hex, 'tile.water', 'water', GRADE - BASIN_DEPTH, GRADE - WATER_DROP);
  }
  if (path) {
    pushFill(
      solids,
      path.polygon,
      hex,
      'tile.path',
      'path',
      BANDS.soilTop - EMBED,
      GRADE - PATH_DROP,
    );
  }

  for (const terrace of terraces) {
    const foot = GRADE + (terrace.level - 1) * TERRACE_STEP;
    const top = GRADE + terrace.level * TERRACE_STEP;
    // A soil lip at the foot of the wall, then the surface above it. Without the lip a
    // terrace step is invisible under this lighting.
    solids.push(
      extrudePolygon(terrace.polygon, {
        name: `tile.terrace.${terrace.level}.rim`,
        material: 'soil',
        z0: foot - EMBED,
        z1: foot + TERRACE_RIM,
        chamfer: EMBED,
      }),
    );
    solids.push(
      extrudePolygon(terrace.polygon, {
        name: `tile.terrace.${terrace.level}`,
        material: biome.ground,
        z0: foot + TERRACE_RIM - EMBED,
        z1: top,
        chamfer: EMBED,
      }),
    );
  }

  for (const [index, placement] of placements.entries()) {
    solids.push(
      ...PROPS[placement.id].build({
        rng: makeRng(params.seed, params.biome, coord.q, coord.r, 'prop', index),
        at: placement.at,
        surfaceZ: placement.surfaceZ,
        rotation: placement.rotation,
        scale: placement.scale,
      }),
    );
  }

  return {
    coord,
    biome: params.biome,
    seed: params.seed,
    R,
    edges,
    solids,
    terraces,
    water,
    path,
    placements,
    surface,
    height: heightOf(solids),
  };
}

function pushFill(
  solids: Solid[],
  polygon: Polygon,
  hex: Polygon,
  name: string,
  material: 'water' | 'path',
  z0: number,
  z1: number,
): void {
  for (const [index, region] of clipFill(polygon, hex).entries()) {
    solids.push(
      extrudeRegion(region.contour, region.holes, {
        name: `${name}.${index}`,
        material,
        z0,
        z1,
      }),
    );
  }
}

function clipFill(polygon: Polygon, hex: Polygon): Region[] {
  return intersect(insetPolygon(polygon, -EMBED), hex);
}

function heightOf(solids: readonly Solid[]): number {
  let top = 0;
  for (const solid of solids) {
    solid.geometry.computeBoundingBox();
    top = Math.max(top, solid.geometry.boundingBox?.max.z ?? 0);
  }
  return top;
}
