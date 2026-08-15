// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Water.
 *
 * Water is carved, not stacked: the ground gets a basin and the water slab sits inside it,
 * meeting the shore at a surface rather than interpenetrating it. That keeps the colour
 * split unambiguous, the single most important thing for a multi-material print, since
 * where two differently-coloured solids overlap the winning colour is slicer-defined.
 */

import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/hex';
import { radialPolygon, type Polygon } from '../core/polygon';
import { extrudePolygon } from './prism';
import { MeshBuilder, type Solid } from './solid';
import { lathe } from './primitives';
import { baseFrame, type PropDef } from './prop';

/** How far the water surface sits below the surrounding shore. */
export const WATER_DROP = 0.6;
/** How deep the basin is cut into the ground. */
export const BASIN_DEPTH = 3.0;

/** The basin floor, in the ground's own material, which is what the water sits in. */
export function basin(polygon: Polygon, grade: number, name = 'water.basin'): Solid {
  return extrudePolygon(polygon, {
    name,
    material: 'stone',
    z0: grade - BASIN_DEPTH - 1.5,
    z1: grade - BASIN_DEPTH,
  });
}

/** The water surface itself: flat top, flat bottom, filling the basin. */
export function waterSlab(polygon: Polygon, grade: number, name = 'water.slab'): Solid {
  return extrudePolygon(polygon, {
    name,
    material: 'water',
    z0: grade - BASIN_DEPTH,
    z1: grade - WATER_DROP,
  });
}

/**
 * The pale angular shapes floating on the bay in the second reference. Raised a hair above
 * the surface so they read as facets catching the light.
 */
export function waterFacet(rng: Rng, centre: Vec2, radius: number, grade: number, index: number): Solid {
  const polygon = radialPolygon(rng, {
    centre,
    radius,
    wobble: rng.range(0.2, 0.4),
    sides: rng.pick([5, 6]),
    phase: rng.range(0, Math.PI * 2),
  });
  return extrudePolygon(polygon, {
    name: `water.facet.${index}`,
    material: 'water',
    z0: grade - WATER_DROP - 0.3,
    z1: grade - WATER_DROP + 0.4,
  });
}

export const icePatch: PropDef = {
  id: 'icePatch',
  footprint: 5.2,
  height: 1,
  budget: 40,
  build(ctx) {
    const rng = ctx.rng;
    const b = new MeshBuilder();
    lathe(b, baseFrame(ctx), {
      profile: [
        { r: rng.range(3, 5), z: 0 },
        { r: rng.range(3, 5), z: 1.0 },
      ],
      sides: 5,
      phase: rng.range(0, Math.PI * 2),
    });
    return [b.build('prop.icePatch', 'water')];
  },
};

/**
 * A raised band at the shoreline. Built with the same trick as the well: up the outside,
 * across the top, down the inside, and closed on the axis.
 */
export const foamRing: PropDef = {
  id: 'foamRing',
  footprint: 5.7,
  height: 1,
  budget: 90,
  build(ctx) {
    const rng = ctx.rng;
    const outer = rng.range(4, 5.5);
    const b = new MeshBuilder();
    lathe(b, baseFrame(ctx), {
      profile: [
        { r: outer, z: 0 },
        { r: outer, z: 1.0 },
        { r: outer - 1.2, z: 1.0 },
        { r: outer - 1.2, z: 0.4 },
        { r: 0, z: 0.4 },
      ],
      sides: 6,
      phase: rng.range(0, Math.PI / 3),
    });
    return [b.build('prop.foamRing', 'stone')];
  },
};

export const WATER = { icePatch, foamRing };

