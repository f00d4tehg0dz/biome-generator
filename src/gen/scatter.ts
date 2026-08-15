// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Prop placement.
 *
 * Two rules do most of the work of making a tile look composed rather than sprinkled:
 * one hero element placed off centre, and clustering: trees arrive in groups with smaller
 * satellites, never evenly spread. The rest is rejection sampling against zone masks.
 *
 * Emptiness is a target, not a leftover. The references keep well over half the surface
 * clear, so placement stops on an occupancy budget rather than a prop count.
 */

import type { Rng } from '../core/rng';
import { hexContains, hexInset, type Vec2 } from '../core/hex';
import { propMinFeature, propRadius, type PropId } from '../kit';
import { MIN_FEATURE } from '../kit/solid';
import type { Zone } from './surface';
import { nearestBoundaryPoint, Surface } from './surface';
import type { PathRoute } from './paths';

export interface Placement {
  id: PropId;
  at: Vec2;
  surfaceZ: number;
  rotation: number;
  scale: number;
}

export interface PropWeight {
  id: PropId;
  weight: number;
  /** Scale range. Defaults to a gentle spread around nominal. */
  scale?: [number, number];
}

export interface ScatterSpec {
  /** Target fraction of the surface covered by prop footprints, 0..1. */
  density: number;
  weights: readonly PropWeight[];
  hero: readonly PropId[];
}

/** Where each prop is allowed to stand. Anything unlisted is dry land only. */
const PROP_ZONES: Partial<Record<PropId, Zone[]>> = {
  lilyPad: ['water'],
  icePatch: ['water'],
  foamRing: ['shore'],
  reed: ['shore'],
  duneGrass: ['shore', 'land'],
  rowboat: ['shore'],
  dock: ['shore'],
  boulder: ['land', 'shore', 'cliff'],
  rockCluster: ['land', 'shore', 'cliff'],
  cairn: ['land', 'cliff'],
  mushroom: ['land'],
  log: ['land'],
};

const DEFAULT_ZONES: Zone[] = ['land'];

/** Props that belong beside a path rather than scattered across the field. */
const ROADSIDE: PropId[] = ['bench', 'lamp', 'signpost'];

/** Trees spawn satellites; these are the ids that count as one. */
const CLUSTERING: PropId[] = ['conifer', 'blossom', 'roundCrown', 'palm', 'bare', 'boulder'];

/**
 * At most one per tile. A stand of conifers reads as a forest; three barns reads as a bug,
 * and a second jetty steals the first one's job.
 */
const SINGLETON: PropId[] = [
  'barn',
  'cabin',
  'hut',
  'well',
  'dock',
  'tent',
  'rowboat',
  'mesa',
  'peak',
  'bench',
  'lamp',
  'signpost',
];

/** Props whose long axis should point at the water they sit beside. */
const FACES_WATER: PropId[] = ['dock', 'rowboat'];

const MAX_ATTEMPTS = 700;

/** Clear air left between any two props, in millimetres. */
export const PROP_GAP = 0.6;

export function scatter(rng: Rng, spec: ScatterSpec, surface: Surface, path: PathRoute | null): Placement[] {
  const placements: Placement[] = [];
  const usableArea = Math.PI * Math.pow(surface.R * 0.78, 2);
  const budget = usableArea * spec.density;
  let occupied = 0;

  const used = new Set<PropId>();

  const add = (id: PropId, at: Vec2, scale: number): boolean => {
    const reach = propRadius(id) * scale;
    const zone = surface.zoneAt(at);
    if (!zonesFor(id).includes(zone)) return false;
    if (SINGLETON.includes(id) && used.has(id)) return false;
    // The whole reach has to clear the tile edge, not just the centre. A canopy overhanging
    // the boundary collides with whatever is printed on the next tile.
    if (hexInset(at, surface.R) < reach) return false;
    // ...and has to stand on one level, so nothing straddles a terrace step or hangs over
    // the water or the path corridor.
    if (!surface.levelAcross(at, reach)) return false;
    if (!fits(placements, at, reach)) return false;
    // Below the printable minimum a prop is culled, never shrunk to fit. This is what stops
    // a stand of half-scale bare trees from becoming 0.5 mm branches that snap off the plate.
    if (propMinFeature(id) * scale < MIN_FEATURE) return false;

    placements.push({
      id,
      at,
      surfaceZ: surface.heightAt(at),
      rotation: orientation(rng, id, at, surface),
      scale,
    });
    used.add(id);
    occupied += Math.PI * Math.pow(propRadius(id) * scale, 2);
    return true;
  };

  // The hero goes first so it gets the good spot: off centre, never dead centre.
  if (spec.hero.length > 0) {
    const id = rng.pick(spec.hero);
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      const distance = surface.R * rng.range(0.4, 0.6);
      const at: Vec2 = [Math.cos(angle) * distance, Math.sin(angle) * distance];
      if (add(id, at, rng.range(1.15, 1.35))) break;
    }
  }

  // One roadside prop per path, snapped to the corridor's edge and turned to face it.
  if (path) {
    const roadside = spec.weights.filter((w) => ROADSIDE.includes(w.id) && !used.has(w.id));
    if (roadside.length > 0) placeRoadside(rng, roadside, surface, path, placements, used);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS && occupied < budget; attempt++) {
    const at = sampleHex(rng, surface.R);
    const zone = surface.zoneAt(at);
    const candidates = spec.weights.filter((w) => zonesFor(w.id).includes(zone));
    if (candidates.length === 0) continue;

    const choice = rng.weighted(candidates, (w) => w.weight);
    const [low, high] = choice.scale ?? [0.85, 1.15];
    if (!add(choice.id, at, rng.range(low, high))) continue;

    // Satellites: smaller siblings just clear of the parent. This is what makes trees read
    // as a stand rather than a grid.
    if (CLUSTERING.includes(choice.id)) {
      const parentReach = propRadius(choice.id) * ((low + high) / 2);
      const satellites = rng.int(1, 3);
      for (let i = 0; i < satellites; i++) {
        const satelliteScale = rng.range(0.5, 0.72);
        // Measured from the two reaches rather than a fixed multiple of the parent's; a
        // fixed 1.5× put satellites inside their parent whenever the parent was large.
        const clearance = parentReach + propRadius(choice.id) * satelliteScale + PROP_GAP;
        const angle = rng.range(0, Math.PI * 2);
        const distance = clearance * rng.range(1.02, 1.35);
        add(
          choice.id,
          [at[0] + Math.cos(angle) * distance, at[1] + Math.sin(angle) * distance],
          satelliteScale,
        );
      }
    }
  }

  return placements;
}

function zonesFor(id: PropId): Zone[] {
  return PROP_ZONES[id] ?? DEFAULT_ZONES;
}

/**
 * Rotation snaps to 60° increments with a little jitter, so it reads as hex-native but never mechanical.
 * A jetty or a beached boat is turned to point at the water instead: a dock lying parallel
 * to the shore is the one placement that reads as obviously wrong.
 */
function orientation(rng: Rng, id: PropId, at: Vec2, surface: Surface): number {
  if (FACES_WATER.includes(id) && surface.water) {
    const target = nearestBoundaryPoint(surface.water, at);
    // The kit builds these along local +Y, so subtract a quarter turn.
    return Math.atan2(target[1] - at[1], target[0] - at[0]) - Math.PI / 2 + rng.range(-0.1, 0.1);
  }
  return Math.round(rng.range(0, 6)) * (Math.PI / 3) + rng.range(-0.14, 0.14);
}

/** Uniform sample inside the hex, by rejection against its bounding box. */
function sampleHex(rng: Rng, R: number): Vec2 {
  for (let i = 0; i < 24; i++) {
    const p: Vec2 = [rng.range(-R, R), rng.range(-R, R)];
    if (hexContains(p, R)) return p;
  }
  return [0, 0];
}

/**
 * Props do not intersect each other, full stop.
 *
 * `propRadius` is the furthest a prop actually reaches, so requiring the centres to be
 * further apart than the sum of the two reaches leaves a clear gap between every pair. An
 * earlier version allowed 15% of that, which let canopies interpenetrate, harmless on
 * screen, but on the plate it fuses two props into one lump.
 *
 * The overlaps this project *does* want are a different thing entirely: a prop sinks EMBED
 * into the ground it stands on, and the tile's strata overlap each other, both so the slicer
 * unions them into one solid. Those are between a part and its host, never between peers.
 */
function fits(placements: readonly Placement[], at: Vec2, radius: number): boolean {
  return placements.every((other) => {
    const separation = radius + propRadius(other.id) * other.scale + PROP_GAP;
    return Math.hypot(at[0] - other.at[0], at[1] - other.at[1]) > separation;
  });
}

function placeRoadside(
  rng: Rng,
  candidates: readonly PropWeight[],
  surface: Surface,
  path: PathRoute,
  placements: Placement[],
  used: Set<PropId>,
): void {
  const choice = rng.weighted(candidates, (w) => w.weight);

  for (let attempt = 0; attempt < 24; attempt++) {
    const index = rng.int(3, path.centreLine.length - 4);
    const here = path.centreLine[index]!;
    const next = path.centreLine[index + 1]!;
    const dx = next[0] - here[0];
    const dy = next[1] - here[1];
    const length = Math.hypot(dx, dy) || 1;
    const side = rng.chance(0.5) ? 1 : -1;
    const offset = path.halfWidth + propRadius(choice.id) * 0.8;
    const at: Vec2 = [
      here[0] + (-dy / length) * offset * side,
      here[1] + (dx / length) * offset * side,
    ];

    if (surface.zoneAt(at) !== 'land') continue;
    if (hexInset(at, surface.R) < propRadius(choice.id)) continue;
    if (!surface.levelAcross(at, propRadius(choice.id))) continue;
    if (!fits(placements, at, propRadius(choice.id))) continue;

    placements.push({
      id: choice.id,
      at,
      surfaceZ: surface.heightAt(at),
      // Turned to face the path, so a bench looks placed rather than dropped.
      rotation: Math.atan2(dy, dx) + (side > 0 ? Math.PI : 0) + rng.range(-0.1, 0.1),
      scale: 1,
    });
    used.add(choice.id);
    return;
  }
}

