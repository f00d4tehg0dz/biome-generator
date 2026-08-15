// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The prop contract. Every builder is a pure function of (context) → Solid[], with all
 * transforms already baked in.
 */

import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/hex';
import type { MaterialId } from '../palette/materials';
import { Frame } from './frame';
import { EMBED, MeshBuilder, type Solid } from './solid';

export interface PropContext {
  rng: Rng;
  /** Attachment point in tile-local XY. */
  at: Vec2;
  /** Surface height at `at`. The prop's local z = 0 sits EMBED below this. */
  surfaceZ: number;
  /** Rotation about Z, radians. */
  rotation: number;
  /** Uniform scale. 1 is the nominal size quoted in the catalogue. */
  scale: number;
}

export interface PropDef {
  id: string;
  /**
   * Declared reach from the prop's origin at scale 1, in millimetres. Documentation, and
   * checked against the measured value by the kit tests. Scatter uses `propRadius`, which
   * measures the built geometry: a declared number drifts the moment a builder changes, and
   * the cost of the drift is a prop hanging over the tile edge into its neighbour.
   */
  footprint: number;
  /** Height at scale 1, in millimetres. */
  height: number;
  /** Triangle cap. Exceeding it is a build error, not a warning. */
  budget: number;
  /**
   * True when the prop is allowed short unsupported spans: a bench seat between its legs,
   * a fence rail between posts. Natural props never bridge.
   */
  bridges?: boolean;
  build(ctx: PropContext): Solid[];
}

/** The frame a prop is built in: on the surface, sunk by EMBED so it fuses with its host. */
export function baseFrame(ctx: PropContext): Frame {
  return Frame.at(ctx.at, ctx.surfaceZ - EMBED, ctx.rotation, ctx.scale);
}

/** Convenience context for a prop standing on its own, used by the gallery and tests. */
export function soloContext(rng: Rng, overrides: Partial<PropContext> = {}): PropContext {
  return { rng, at: [0, 0], surfaceZ: 0, rotation: 0, scale: 1, ...overrides };
}

export type PropSet = Record<string, PropDef>;

/**
 * Collects a compound prop as one Solid per closed volume.
 *
 * **Interpenetrating parts must not share a MeshBuilder.** Two overlapping boxes written
 * into one buffer weld at any coincident vertex, which is non-manifold; and even when they
 * do not touch, the inside/outside parity that the enclosure check relies on breaks down
 * for self-overlapping geometry, so a buried joint reads as an exposed ceiling. One Solid
 * per volume keeps both checks meaningful. It costs nothing downstream; the renderer and
 * the exporters merge by colour anyway.
 *
 * Disjoint repeats that genuinely never touch (a row of crop ridges) may share one part.
 */
export class Parts {
  private readonly items: { builder: MeshBuilder; name: string; material: MaterialId }[] = [];

  part(name: string, material: MaterialId): MeshBuilder {
    const builder = new MeshBuilder();
    this.items.push({ builder, name, material });
    return builder;
  }

  build(): Solid[] {
    return this.items
      .filter((item) => !item.builder.isEmpty)
      .map((item) => item.builder.build(item.name, item.material));
  }
}

/**
 * Per-vertex radius multipliers, so a rock is irregular but still deterministic.
 *
 * Only safe on profiles with slope to spare. Perturbing two rings independently changes the
 * slope of the face between them, so on a segment already flaring near MAX_FLARE it can tip
 * individual faces past 45°. Use `coherentWobble` there instead.
 */
export function wobbleTable(rng: Rng, rings: number, sides: number, amount: number) {
  const table: number[][] = [];
  for (let ring = 0; ring < rings; ring++) {
    const row: number[] = [];
    for (let side = 0; side < sides; side++) row.push(1 + rng.range(-amount, amount));
    table.push(row);
  }
  return (ring: number, side: number) => table[ring]?.[side] ?? 1;
}

/**
 * One multiplier per side, shared by every ring. Scales the whole profile column, so face
 * slopes change only by that factor and a flare stays a flare. Reads as a coherently lumpy
 * silhouette rather than noise.
 */
export function coherentWobble(rng: Rng, sides: number, amount: number) {
  const row: number[] = [];
  for (let side = 0; side < sides; side++) row.push(1 + rng.range(-amount, amount));
  return (_ring: number, side: number) => row[side] ?? 1;
}
