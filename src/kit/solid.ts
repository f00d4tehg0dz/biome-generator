// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The one geometry currency in the app. Generation produces `Solid[]`; the viewport and
 * every exporter consume that same array (CLAUDE.md invariant 2).
 *
 * All geometry is Z-up, in millimetres, with the tile bottom at z = 0 (invariant 1).
 */

import { BufferAttribute, BufferGeometry } from 'three';
import type { MaterialId } from '../palette/materials';

/** How far a prop sinks into its host so the two fuse at slice time. One nozzle width. */
export const EMBED = 0.4;

/** Vertical anatomy of a tile, in millimetres. See docs/geometry-spec.md §2.1. */
export const BANDS = {
  stoneTop: 5,
  soilTop: 9,
  /** The walkable surface. */
  grade: 12,
} as const;

export const GRADE = BANDS.grade;
export const TERRACE_STEP = 4;
export const MAX_TERRACES = 4;
/**
 * Height of the exposed soil lip at the foot of a terrace wall. The references show this
 * stratification at every elevation break, and it is what makes a step read at all: a
 * 4 mm wall in the same colour as the surface above it is invisible under flat lighting.
 */
export const TERRACE_RIM = 1.2;
/** No props, terrace walls or water inside this band at the tile edge. */
export const EDGE_MARGIN = 6;
/** Elephant-foot compensation on everything that mates at z = 0. */
export const BOTTOM_CHAMFER = 0.4;

/**
 * Printability limits for a 0.4 mm nozzle, from the `3d-print` skill's tolerance
 * reference. Props below the minimum are culled at scatter time, not shrunk.
 */
export const MIN_FEATURE = 1.0;
export const MIN_WALL = 1.6;
export const MIN_LEG = 2.6;

/**
 * Durability: the thinnest any rod-like member, or any section carrying load, may be.
 *
 * A different question from printability above, and a stricter one. A 1.1 mm branch prints
 * perfectly. It also snaps off between the plate and the shelf, which is what happened:
 * trunks, posts, branches and stems all came away, and every one of them was inside the
 * printable limits. Printable means the nozzle can lay it down; this is about surviving being
 * peeled off the bed, cleaned up, and handled by someone who does not know it is fragile.
 *
 * It is a floor rather than a target — a trunk carrying a canopy comes out at twice this, and
 * should. What it rules out is the member that is thin *for no reason*, because nobody
 * converted the number they wrote into the number that gets printed.
 *
 * Measured across the part, never along an axis, and never from the radius a profile is
 * written in. A square section's thin direction is its side. A hexagonal one's is flat to
 * flat, which is `2·r·cos(π/6)`: the *inscribed* diameter. Confusing the two is how a trunk
 * written `r: 1.3` turned out to be 1.84 mm of wood. See `memberSection` and `weakestSection`,
 * which measure the two ways this gets violated.
 */
export const MIN_DURABLE = 2.2;
/** Longest unsupported horizontal span allowed. Only built props are permitted any. */
export const MAX_BRIDGE = 12;
/**
 * Longest unsupported protrusion allowed: a signpost's plate, a roof's eave. A cantilever
 * is anchored at one end only, but at this length FDM carries it without support and
 * without a visible droop, so it needs no special declaration.
 */
export const MAX_CANTILEVER = 3;
/** Overhang limit from vertical, in degrees. */
export const MAX_OVERHANG_ANGLE = 45;

export interface Solid {
  name: string;
  geometry: BufferGeometry;
  material: MaterialId;
}

const QUANTUM = 1e4; // vertex dedup grid: 0.0001 mm

/**
 * Accumulates positions and triangles with vertex deduplication, so everything leaving the
 * kit is indexed and welded; a duplicate vertex is a manifold failure, not a cosmetic one.
 */
export class MeshBuilder {
  private positions: number[] = [];
  private indices: number[] = [];
  private lookup = new Map<string, number>();

  /** Adds a vertex (or returns the existing one) and gives back its index. */
  vertex(x: number, y: number, z: number): number {
    const key = `${Math.round(x * QUANTUM)},${Math.round(y * QUANTUM)},${Math.round(z * QUANTUM)}`;
    const existing = this.lookup.get(key);
    if (existing !== undefined) return existing;
    const index = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.lookup.set(key, index);
    return index;
  }

  /** Counter-clockwise winding viewed from outside. Degenerate triangles are dropped. */
  tri(a: number, b: number, c: number): void {
    if (a === b || b === c || a === c) return;
    this.indices.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** Triangle fan around `centre`. Valid for convex and star-shaped polygons. */
  fan(centre: number, ring: readonly number[], reverse = false): void {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if (reverse) this.tri(centre, b, a);
      else this.tri(centre, a, b);
    }
  }

  /**
   * Quad strip between two matching rings. Both must be wound counter-clockwise seen from
   * the direction `upper` lies in, which puts the resulting normals on the outside.
   */
  wall(lower: readonly number[], upper: readonly number[]): void {
    for (let i = 0; i < lower.length; i++) {
      const j = (i + 1) % lower.length;
      this.quad(lower[i]!, lower[j]!, upper[j]!, upper[i]!);
    }
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  get isEmpty(): boolean {
    return this.indices.length === 0;
  }

  build(name: string, material: MaterialId): Solid {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setIndex(this.indices.slice());
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return { name, geometry, material };
  }
}

export function triangleCount(solids: readonly Solid[]): number {
  return solids.reduce((sum, s) => sum + (s.geometry.getIndex()?.count ?? 0) / 3, 0);
}

/** Bounding box of a solid set, as [min, max] in millimetres. */
export function boundsOf(solids: readonly Solid[]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const solid of solids) {
    const pos = solid.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const v = pos.getComponent(i, axis);
        if (v < min[axis]!) min[axis] = v;
        if (v > max[axis]!) max[axis] = v;
      }
    }
  }
  return { min, max };
}

/**
 * Concatenates geometries into one buffer. Used to collapse a tile into one mesh per
 * filament for rendering, and one object per filament for 3MF.
 */
export function mergeGeometries(geometries: readonly BufferGeometry[]): BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geometries) {
    vertexCount += g.getAttribute('position').count;
    indexCount += g.getIndex()?.count ?? 0;
  }

  const positions = new Float32Array(vertexCount * 3);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    positions.set(pos.array as ArrayLike<number>, vOffset * 3);
    const index = g.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) indices[iOffset + i] = index.getX(i) + vOffset;
      iOffset += index.count;
    }
    vOffset += pos.count;
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(positions, 3));
  merged.setIndex(new BufferAttribute(indices, 1));
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}

/** Groups solids by an arbitrary key and merges each group into one geometry. */
export function mergeSolidsBy<K>(
  solids: readonly Solid[],
  keyOf: (solid: Solid) => K,
): Map<K, BufferGeometry> {
  const groups = new Map<K, BufferGeometry[]>();
  for (const solid of solids) {
    const key = keyOf(solid);
    const list = groups.get(key);
    if (list) list.push(solid.geometry);
    else groups.set(key, [solid.geometry]);
  }
  const out = new Map<K, BufferGeometry>();
  for (const [key, list] of groups) out.set(key, mergeGeometries(list));
  return out;
}
