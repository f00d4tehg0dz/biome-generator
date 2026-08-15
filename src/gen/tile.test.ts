// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { describe, expect, it } from 'vitest';
import { generateTile } from './tile';
import { BIOME_IDS, BIOMES } from './biomes';
import { checkSolid } from '../check/manifold';
import {
  boundsOf,
  EDGE_MARGIN,
  GRADE,
  MAX_TERRACES,
  MIN_FEATURE,
  triangleCount,
} from '../kit/solid';
import {
  axialToWorld,
  DIRECTIONS,
  hexContains,
  hexInset,
  hexSpiral,
  inradius,
  isMaleDirection,
  neighbour,
} from '../core/hex';
import { maxRadius, minRadius, polygonContains } from '../core/polygon';
import { PROPS, propMinFeature, propRadius, type PropId } from '../kit';
import type { Solid } from '../kit/solid';
import { makeRng } from '../core/rng';
import { pointInSolid } from '../check/enclosure';
import { PROP_GAP } from './scatter';
import { connectorSlot, connectorTab } from '../kit/connectors';
import { canHoldWater, edgeTypeAt, resolveEdges, type EdgeType } from './edges';
import { MIN_SEAM_BAND, seamBand } from './water';
import { distanceToBoundary } from './surface';

/** Props that are placed on the water surface rather than on land. */
const WATER_PROPS: PropId[] = ['lilyPad', 'icePatch'];
import { resolvePalette } from '../palette/reduce';
import type { ColourCount } from '../palette/reduce';

const SEEDS = Array.from({ length: 20 }, (_, i) => `s${i}`);
const R = 50;

function everyTile(fn: (tile: ReturnType<typeof generateTile>) => void) {
  for (const biome of BIOME_IDS) {
    for (const seed of SEEDS) fn(generateTile({ seed, biome, R }));
  }
}

describe('tile geometry', () => {
  it('produces watertight, consistently wound solids', () => {
    everyTile((tile) => {
      for (const solid of tile.solids) {
        const report = checkSolid(solid);
        expect(
          report.ok,
          `${tile.biome}/${tile.seed} ${solid.name}: ${report.issues.map((i) => i.detail).join('; ')}`,
        ).toBe(true);
      }
    });
  });

  it('sits on the bed and stays inside the hex footprint', () => {
    everyTile((tile) => {
      const { min, max } = boundsOf(tile.solids);
      expect(min[2]).toBeCloseTo(0, 5);
      expect(max[2]).toBeCloseTo(tile.height, 5);
      // Nothing may overhang the tile boundary: tiles butt together, and an overhanging
      // canopy would collide with whatever is printed on the neighbour. Connector tabs are
      // the deliberate exception: they protrude into the neighbour's slot.
      const body = tile.solids.filter((s) => !s.name.startsWith('tile.connector'));
      for (const p of cornersOf(body)) {
        expect(
          hexContains(p, R + 1e-6),
          `${tile.biome}/${tile.seed}: (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) is outside the hex`,
        ).toBe(true);
      }
    });
  });

  it('keeps every face of the landform vertical, horizontal or a 45° chamfer', () => {
    // The tile's own geometry is all prisms, so it is self-supporting structurally rather
    // than by inspection. Props have arbitrary slopes and are gated by kit.test.ts instead.
    const allowed = [0, 1, Math.SQRT1_2];
    everyTile((tile) => {
      for (const solid of tile.solids.filter((s) => s.name.startsWith('tile.'))) {
        for (const nz of faceNormalsZ(solid)) {
          const closest = Math.min(...allowed.map((a) => Math.abs(Math.abs(nz) - a)));
          expect(closest, `${solid.name} has a face with nz=${nz.toFixed(4)}`).toBeLessThan(1e-3);
        }
      }
    });
  });

  it('nests terraces strictly inside one another, clear of the edge margin', () => {
    const limit = inradius(R) - EDGE_MARGIN;
    everyTile((tile) => {
      expect(tile.terraces.length).toBeLessThanOrEqual(MAX_TERRACES);
      tile.terraces.forEach((terrace, i) => {
        expect(terrace.level).toBe(i + 1);
        expect(maxRadius(terrace.polygon)).toBeLessThanOrEqual(limit + 1e-6);
        const previous = tile.terraces[i - 1];
        if (!previous) return;
        // Every vertex of this terrace must lie inside the one below it.
        for (const point of terrace.polygon) {
          expect(
            polygonContains(previous.polygon, point),
            `${tile.biome}/${tile.seed}: terrace ${terrace.level} escapes terrace ${previous.level}`,
          ).toBe(true);
        }
        expect(minRadius(previous.polygon)).toBeGreaterThan(0);
      });
    });
  });

  it('stays inside the per-tile triangle budget', () => {
    everyTile((tile) => {
      expect(triangleCount(tile.solids)).toBeLessThanOrEqual(8000);
    });
  });

  it('gives flat biomes fewer terraces than mountainous ones', () => {
    const mean = (biome: 'meadow' | 'alpine') =>
      SEEDS.reduce((sum, seed) => sum + generateTile({ seed, biome, R }).terraces.length, 0) /
      SEEDS.length;
    // Alpine tiles are a landform; meadow tiles are mostly flat ground with things on it.
    expect(mean('alpine'), 'alpine').toBeGreaterThan(1.4);
    expect(mean('meadow'), 'meadow').toBeLessThan(1.0);
  });
});

describe('placement', () => {
  it('never puts a land prop on water or on the path', () => {
    everyTile((tile) => {
      for (const placement of tile.placements) {
        const zone = tile.surface.zoneAt(placement.at);
        expect(
          zone,
          `${tile.biome}/${tile.seed}: ${placement.id} on ${zone}`,
        ).not.toBe('margin');
        if (WATER_PROPS.includes(placement.id)) expect(zone).toBe('water');
        else expect(zone).not.toBe('water');
        expect(zone).not.toBe('path');
      }
    });
  });

  it('stands every prop on the surface height at its own position', () => {
    everyTile((tile) => {
      for (const placement of tile.placements) {
        expect(placement.surfaceZ).toBeCloseTo(tile.surface.heightAt(placement.at), 6);
      }
    });
  });

  it('never lets two props intersect', () => {
    // Measured reach to measured reach, with clear air between. The overlaps this project
    // wants are between a part and its host: a prop sinking EMBED into the ground, a
    // stratum into the one below, never between two peers.
    everyTile((tile) => {
      const placed = tile.placements;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i]!;
          const b = placed[j]!;
          const separation = propRadius(a.id) * a.scale + propRadius(b.id) * b.scale + PROP_GAP;
          expect(
            Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]),
            `${tile.biome}/${tile.seed}: ${a.id} and ${b.id}`,
          ).toBeGreaterThan(separation);
        }
      }
    });
  });

  it('never lets two props share any geometry', () => {
    // The separation rule above works on bounding radii; this checks the meshes. Bounding
    // *boxes* are not the test: two trees a clear millimetre apart still have overlapping
    // axis-aligned boxes, so boxes only shortlist the pairs worth examining, and the
    // verdict is whether a vertex of one actually falls inside the other.
    for (const biome of BIOME_IDS) {
      for (const seed of ['intersect', 'intersect2', 'intersect3']) {
        const tile = generateTile({ seed, biome, R });
        const props = buildPlacedProps(tile);
        for (let i = 0; i < props.length; i++) {
          for (let j = i + 1; j < props.length; j++) {
            const a = props[i]!;
            const b = props[j]!;
            if (!boxesOverlap(a.box, b.box)) continue;
            expect(
              pierces(a, b) || pierces(b, a),
              `${biome}/${seed}: ${a.name} intersects ${b.name}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('stands every prop on one level, straddling nothing', () => {
    // A prop's base is a flat disc. Centred on a terrace step, a shoreline or the lip of a
    // path, half of it would float.
    everyTile((tile) => {
      for (const placement of tile.placements) {
        expect(
          tile.surface.levelAcross(placement.at, propRadius(placement.id) * placement.scale),
          `${tile.biome}/${tile.seed}: ${placement.id} straddles a step`,
        ).toBe(true);
      }
    });
  });

  it('leaves most of the surface empty', () => {
    // The references keep well over half the top clear; clutter is the failure mode.
    everyTile((tile) => {
      const covered = tile.placements.reduce(
        (sum, p) => sum + Math.PI * Math.pow(propRadius(p.id) * p.scale, 2),
        0,
      );
      const usable = Math.PI * Math.pow(R * 0.78, 2);
      expect(covered / usable, `${tile.biome}/${tile.seed}`).toBeLessThan(0.5);
    });
  });

  it('culls props too small to print rather than shrinking them', () => {
    everyTile((tile) => {
      for (const placement of tile.placements) {
        expect(
          propMinFeature(placement.id) * placement.scale,
          `${tile.biome}/${tile.seed}: ${placement.id} at ${placement.scale.toFixed(2)}×`,
        ).toBeGreaterThanOrEqual(MIN_FEATURE);
      }
    });
  });
});

describe('water and paths', () => {
  it('generates water only in biomes that declare it', () => {
    everyTile((tile) => {
      if (BIOMES[tile.biome].water === null) expect(tile.water).toBeNull();
    });
  });

  it('keeps a closed body clear of the tile edge, so a shore always exists', () => {
    // Bodies that open onto a seam are a different matter: they are *meant* to reach it,
    // and are left overshooting so the booleans stay non-degenerate.
    everyTile((tile) => {
      if (!tile.water || tile.edges.includes('water')) return;
      for (const p of tile.water) {
        expect(hexInset(p, R), `${tile.biome}/${tile.seed}`).toBeGreaterThan(EDGE_MARGIN - 1e-6);
      }
    });
  });

  it('never routes a path through water or a terrace', () => {
    everyTile((tile) => {
      if (!tile.path) return;
      for (const p of tile.path.centreLine) {
        if (tile.water) expect(polygonContains(tile.water, p)).toBe(false);
        for (const terrace of tile.terraces) {
          expect(
            polygonContains(terrace.polygon, p),
            `${tile.biome}/${tile.seed}: path crosses terrace ${terrace.level}`,
          ).toBe(false);
        }
      }
    });
  });

  it('keeps the path corridor within reach of the tile', () => {
    // The corridor overshoots its seams on purpose; what matters is that it does not wander
    // off somewhere the tile cannot contain it.
    everyTile((tile) => {
      if (!tile.path) return;
      for (const p of tile.path.polygon) {
        expect(Math.hypot(p[0], p[1]), `${tile.biome}/${tile.seed}`).toBeLessThan(R * 1.25);
      }
    });
  });
});

describe('determinism', () => {
  it('produces identical geometry for the same seed', () => {
    for (const biome of BIOME_IDS) {
      const a = generateTile({ seed: 'repeat', biome, R });
      const b = generateTile({ seed: 'repeat', biome, R });
      expect(a.solids.map((s) => s.name)).toEqual(b.solids.map((s) => s.name));
      for (let i = 0; i < a.solids.length; i++) {
        const pa = a.solids[i]!.geometry.getAttribute('position').array;
        const pb = b.solids[i]!.geometry.getAttribute('position').array;
        expect(Array.from(pa)).toEqual(Array.from(pb));
      }
    }
  });

  it('does not depend on generation order', () => {
    const direct = generateTile({ seed: 'order', biome: 'forest', coord: { q: 2, r: -1 }, R });
    // Generating other tiles first must not perturb this one.
    generateTile({ seed: 'order', biome: 'alpine', coord: { q: 0, r: 0 }, R });
    generateTile({ seed: 'order', biome: 'coast', coord: { q: 1, r: 1 }, R });
    const after = generateTile({ seed: 'order', biome: 'forest', coord: { q: 2, r: -1 }, R });
    expect(after.terraces).toEqual(direct.terraces);
  });

  it('varies with the tile coordinate', () => {
    const a = generateTile({ seed: 'coords', biome: 'alpine', coord: { q: 0, r: 0 }, R });
    const b = generateTile({ seed: 'coords', biome: 'alpine', coord: { q: 1, r: 0 }, R });
    expect(a.terraces).not.toEqual(b.terraces);
  });
});

describe('colour reduction', () => {
  it('emits exactly N filaments for every biome at every colour count', () => {
    for (const id of BIOME_IDS) {
      const biome = BIOMES[id];
      for (const count of [1, 2, 3, 4] as ColourCount[]) {
        const palette = resolvePalette(biome.palette, biome.binding, count, biome.reduction);
        expect(palette.colours, `${id} @ ${count}`).toHaveLength(count);
        expect(new Set(palette.colours).size).toBe(count);
        // Every material must resolve to a real filament index.
        for (const material of Object.keys(biome.binding) as (keyof typeof biome.binding)[]) {
          const index = palette.indexOfMaterial(material);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(count);
        }
      }
    }
  });

  it('keeps water distinct down to two colours in water biomes', () => {
    for (const id of ['coast', 'lake'] as const) {
      const biome = BIOMES[id];
      const palette = resolvePalette(biome.palette, biome.binding, 2, biome.reduction);
      expect(palette.indexOfMaterial('water')).not.toBe(palette.indexOfMaterial('grass'));
      expect(palette.indexOfMaterial('water')).not.toBe(palette.indexOfMaterial('sand'));
    }
  });

  it('collapses everything to one filament at N = 1', () => {
    const biome = BIOMES.forest;
    const palette = resolvePalette(biome.palette, biome.binding, 1, biome.reduction);
    expect(palette.colours).toEqual([biome.palette.S0]);
    expect(palette.indexOfMaterial('water')).toBe(0);
  });
});

describe('tile anatomy', () => {
  it('starts the ground surface at grade', () => {
    everyTile((tile) => {
      const ground = tile.solids.filter((s) => s.name.startsWith('tile.ground'));
      expect(ground.length, `${tile.biome}/${tile.seed}`).toBeGreaterThan(0);
      expect(boundsOf(ground).max[2]).toBeCloseTo(GRADE, 5);
    });
  });

  it('builds all three strata in every biome', () => {
    for (const biome of BIOME_IDS) {
      const names = generateTile({ seed: 'names', biome, R }).solids.map((s) => s.name);
      expect(names.some((n) => n.startsWith('tile.stone'))).toBe(true);
      expect(names.some((n) => n === 'tile.soil')).toBe(true);
      expect(names.some((n) => n.startsWith('tile.ground'))).toBe(true);
    }
  });
});

describe('the edge contract', () => {
  it('has both neighbours derive the same type for their shared edge', () => {
    for (const biome of BIOME_IDS) {
      for (const other of BIOME_IDS) {
        for (const coord of hexSpiral(2)) {
          for (let direction = 0; direction < 6; direction++) {
            const there = neighbour(coord, direction);
            const mine = edgeTypeAt('contract', coord, biome, direction, other);
            const theirs = edgeTypeAt('contract', there, other, (direction + 3) % 6, biome);
            expect(theirs, `${biome}/${other} at ${direction}`).toBe(mine);
          }
        }
      }
    }
  });

  it('never gives two biomes a type neither can present', () => {
    // Water only crosses a seam where both sides can hold it.
    for (const biome of BIOME_IDS) {
      for (const other of BIOME_IDS) {
        for (let i = 0; i < 40; i++) {
          const type = edgeTypeAt(`s${i}`, { q: i, r: -i }, biome, i % 6, other);
          if (type !== 'water') continue;
          expect(canHoldWater(biome) && canHoldWater(other), `${biome}/${other}`).toBe(true);
        }
      }
    }
  });

  it('is independent of which tile asks first', () => {
    const a = { q: 0, r: 0 };
    const edgesFirst = resolveEdges('order', a, 'coast', () => 'lake');
    generateTile({ seed: 'order', biome: 'lake', coord: neighbour(a, 2), R });
    const edgesAfter = resolveEdges('order', a, 'coast', () => 'lake');
    expect(edgesAfter).toEqual(edgesFirst);
  });
});

describe('seams', () => {
  const seamTile = (seed: string, biome: 'coast' | 'lake', edges: EdgeType[]) =>
    generateTile({ seed, biome, R, edges });

  it('brings water to a water seam as a band wide enough to read as one body', () => {
    let produced = 0;
    for (let i = 0; i < 24; i++) {
      const edges: EdgeType[] = ['water', 'land', 'land', 'land', 'land', 'land'];
      const tile = seamTile(`seam${i}`, 'coast', edges);
      if (!tile.water) continue;
      produced++;
      expect(seamBand(tile.water, 0, R), `seam${i}`).toBeGreaterThanOrEqual(MIN_SEAM_BAND);
    }
    expect(produced, 'water seams that produced a body').toBeGreaterThan(18);
  });

  it('brings the path corridor to every path seam', () => {
    let produced = 0;
    for (let i = 0; i < 24; i++) {
      const edges: EdgeType[] = ['path', 'land', 'land', 'path', 'land', 'land'];
      const tile = generateTile({ seed: `road${i}`, biome: 'meadow', R, edges });
      if (!tile.path) continue;
      produced++;
      for (const direction of [0, 3]) {
        expect(seamBand(tile.path.polygon, direction, R), `road${i} dir ${direction}`).toBeGreaterThan(6);
      }
    }
    expect(produced, 'path seams that produced a corridor').toBeGreaterThan(18);
  });

  it('handles a junction of three path seams', () => {
    const edges: EdgeType[] = ['path', 'land', 'path', 'land', 'path', 'land'];
    let produced = 0;
    for (let i = 0; i < 16; i++) {
      const tile = generateTile({ seed: `junction${i}`, biome: 'village', R, edges });
      if (!tile.path) continue;
      produced++;
      for (const direction of [0, 2, 4]) {
        expect(seamBand(tile.path.polygon, direction, R)).toBeGreaterThan(6);
      }
    }
    expect(produced).toBeGreaterThan(10);
  });

  it('keeps water off an edge that was not typed for it', () => {
    for (let i = 0; i < 24; i++) {
      const edges: EdgeType[] = ['water', 'land', 'land', 'land', 'land', 'land'];
      const tile = seamTile(`dry${i}`, 'lake', edges);
      if (!tile.water) continue;
      for (const direction of [1, 2, 3, 4, 5]) {
        expect(seamBand(tile.water, direction, R), `dry${i} dir ${direction}`).toBeLessThan(4);
      }
    }
  });
});

describe('connectors', () => {
  const tile = generateTile({ seed: 'joins', biome: 'meadow', R });

  it('puts a tab on directions 0–2 and a slot on 3–5', () => {
    const tabs = tile.solids.filter((s) => s.name.startsWith('tile.connector'));
    expect(tabs).toHaveLength(3);
    for (let direction = 0; direction < 6; direction++) {
      expect(isMaleDirection(direction)).toBe(direction < 3);
    }
  });

  it('mates a tab with the facing neighbour’s slot', () => {
    // A tile's tab occupies exactly the volume its neighbour cut away, plus clearance.
    for (let direction = 0; direction < 3; direction++) {
      const opposite = (direction + 3) % 6;
      const tab = connectorTab(direction, R);
      const slot = connectorSlot(opposite, R);
      const shift = axialToWorld(DIRECTIONS[direction]!, R);

      // Move the neighbour's slot into this tile's frame.
      const moved: [number, number][] = slot.map((p) => [p[0] + shift[0], p[1] + shift[1]]);
      for (const corner of tab) {
        if (Math.hypot(corner[0], corner[1]) < inradius(R)) continue; // the tab's own root
        expect(
          polygonContains(moved, corner),
          `tab ${direction} corner outside slot ${opposite}`,
        ).toBe(true);
      }
    }
  });

  it('leaves a sliding-fit clearance rather than an interference fit', () => {
    const tab = connectorTab(0, R);
    const slot = connectorSlot(3, R);
    const shift = axialToWorld(DIRECTIONS[0]!, R);
    const moved: [number, number][] = slot.map((p) => [p[0] + shift[0], p[1] + shift[1]]);
    // Every tab corner clears the slot wall, and by a sliding fit rather than a rattle.
    for (const corner of tab) {
      if (Math.hypot(corner[0], corner[1]) < inradius(R)) continue;
      const gap = distanceToBoundary(moved, corner);
      expect(gap, `corner (${corner[0].toFixed(1)}, ${corner[1].toFixed(1)})`).toBeGreaterThan(0.15);
      expect(gap).toBeLessThan(1.0);
    }
  });

  it('omits connectors entirely when asked', () => {
    const plain = generateTile({ seed: 'joins', biome: 'meadow', R, connectors: 'none' });
    expect(plain.solids.some((s) => s.name.startsWith('tile.connector'))).toBe(false);
    for (const p of cornersOf(plain.solids)) expect(hexContains(p, R + 1e-6)).toBe(true);
  });
});

interface Box {
  min: number[];
  max: number[];
}

interface PlacedProp {
  name: string;
  box: Box;
  solids: Solid[];
}

/**
 * Rebuilds each placement with the same rng the tile used, so the solids here are exactly
 * the ones the tile emitted, grouped by which prop they belong to.
 */
function buildPlacedProps(tile: ReturnType<typeof generateTile>): PlacedProp[] {
  return tile.placements.map((placement, index) => {
    const solids = PROPS[placement.id].build({
      rng: makeRng(tile.seed, tile.biome, tile.coord.q, tile.coord.r, 'prop', index),
      at: placement.at,
      surfaceZ: placement.surfaceZ,
      rotation: placement.rotation,
      scale: placement.scale,
    });
    return { name: `${placement.id}#${index}`, box: boundsOf(solids), solids };
  });
}

function boxesOverlap(a: Box, b: Box): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (a.max[axis]! <= b.min[axis]! || b.max[axis]! <= a.min[axis]!) return false;
  }
  return true;
}

/** True when any vertex of `a` lies inside any solid of `b`. */
function pierces(a: PlacedProp, b: PlacedProp): boolean {
  for (const solid of a.solids) {
    const position = solid.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const point: [number, number, number] = [
        position.getX(i),
        position.getY(i),
        position.getZ(i),
      ];
      if (b.solids.some((other) => pointInSolid(other, point))) return true;
    }
  }
  return false;
}

/** Every vertex XY in a solid set, for footprint checks. */
function cornersOf(solids: readonly { geometry: import('three').BufferGeometry }[]) {
  const out: [number, number][] = [];
  for (const solid of solids) {
    const position = solid.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) out.push([position.getX(i), position.getY(i)]);
  }
  return out;
}

/** Z components of every face normal in a solid. */
function faceNormalsZ(solid: { geometry: import('three').BufferGeometry }): number[] {
  const position = solid.geometry.getAttribute('position');
  const index = solid.geometry.getIndex()!;
  const out: number[] = [];
  for (let t = 0; t < index.count / 3; t++) {
    const a = index.getX(t * 3);
    const b = index.getX(t * 3 + 1);
    const c = index.getX(t * 3 + 2);
    const ux = position.getX(b) - position.getX(a);
    const uy = position.getY(b) - position.getY(a);
    const uz = position.getZ(b) - position.getZ(a);
    const vx = position.getX(c) - position.getX(a);
    const vy = position.getY(c) - position.getY(a);
    const vz = position.getZ(c) - position.getZ(a);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-9) out.push(nz / len);
  }
  return out;
}
