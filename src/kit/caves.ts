// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Cave mouths: a rock mass with a way into it.
 *
 * These belong to no biome in particular. A hillside opens up in a forest, on a moor, at the
 * back of a beach, and the point of having them as props rather than as a biome of their own
 * is that one can turn up on a tile you already like.
 *
 * The whole difficulty is the opening. A hole through a mass is a boolean this project does
 * not do, and an arch over a gap is the one shape guaranteed to need support. So nothing
 * here is hollowed out: the mouth is the gap left *between* separate rock masses, with a
 * hill behind it to stop the gap being a window.
 *
 * There was a roof over it for a while, two slabs running from the jambs back into the hill,
 * and it went through three attempts before the measurements made the point. Leaning them
 * together over the middle cantilevers twice as far as FDM carries. Burying their far ends
 * in the hill looks like it fixes that and does not: a buried face is exempt from the
 * overhang analysis, so the support on the far side of the gap stops being counted and the
 * span reads as held at one end after all.
 *
 * Leaving the top open solves both the print and the picture. A tile is looked at from above,
 * and a roofed doorway seen from above is three boulders standing near each other; the same
 * mouth left open shows its own floor, which is what makes it read as a way in.
 */

import type { Rng } from '../core/rng';
import { MeshBuilder, type Solid } from './solid';
import { beam, lathe, MAX_FLARE, type ProfileRing } from './primitives';
import type { Frame } from './frame';
import { baseFrame, Parts, wobbleTable, type PropContext, type PropDef } from './prop';

interface MassOptions {
  at: readonly [number, number];
  radius: number;
  height: number;
  rough: number;
}

/**
 * One lump of rock. Same rule as the boulder: the radius never outruns the rise.
 *
 * Blunt at the top rather than tapering to a point. A point is the rockier silhouette, and
 * on a boulder standing alone it is fine, but here the masses carry a brow across the mouth
 * and a section check does not care how picturesque a tip is: at 2 mm across, under load, it
 * is what snaps.
 */
function mass(b: MeshBuilder, frame: Frame, rng: Rng, options: MassOptions): void {
  const { at, radius, height, rough } = options;
  const waistZ = height * 0.3;
  const waist = Math.min(radius, radius * 0.92 + waistZ * MAX_FLARE);
  const profile: ProfileRing[] = [
    { r: radius * 0.94, z: 0 },
    { r: waist, z: waistZ },
    { r: radius * 0.58, z: height * 0.76 },
    { r: radius * 0.36, z: height },
  ];
  lathe(b, frame.translate(at[0], at[1], 0), {
    profile,
    sides: 6,
    phase: rng.range(0, Math.PI * 2),
    wobble: wobbleTable(rng, profile.length, 6, rough),
  });
}

interface MouthSpec {
  id: string;
  /** Clear width of the opening, millimetres. */
  gap: number;
  /** Height of the jambs either side of it. */
  jamb: number;
  /** Radius of the two masses that make the jambs. */
  flank: number;
  /** The mass behind, which is what stops the doorway being a window. */
  backRadius: number;
  backHeight: number;
}

/** Two flanking masses with a mouth between them, and the hill they are cut into. */
function mouth(ctx: PropContext, spec: MouthSpec): Solid[] {
  const rng = ctx.rng;
  const frame = baseFrame(ctx);
  const parts = new Parts();
  const half = spec.gap / 2 + spec.flank * 0.62;

  for (const [index, side] of [-1, 1].entries()) {
    mass(parts.part(`prop.${spec.id}.flank.${index}`, 'rock'), frame, rng, {
      at: [side * half, rng.range(-0.6, 0.6)],
      radius: spec.flank * rng.range(0.92, 1.08),
      height: spec.jamb * rng.range(0.92, 1.1),
      rough: 0.16,
    });
  }

  // Far enough back to leave a floor between the jambs, which is the part that reads as an
  // alcove rather than as a gap, and close enough that the two flanks still overlap it.
  const hillY = -(spec.backRadius * 0.78 + spec.gap * 0.22);

  mass(parts.part(`prop.${spec.id}.hill`, 'rock'), frame, rng, {
    at: [0, hillY],
    radius: spec.backRadius,
    height: spec.backHeight,
    rough: 0.14,
  });

  return parts.build();
}

export const caveMouth: PropDef = {
  id: 'caveMouth',
  // Kept deliberately small. Scatter will not place a prop unless the whole of its reach
  // stands on one level, clear of water and path, so a wide prop on a terraced tile is a
  // prop that never appears: at 13 mm this landed three times in a hundred and twenty tiles.
  footprint: 9.4,
  height: 8,
  build: (ctx) =>
    mouth(ctx, {
      id: 'caveMouth',
      gap: ctx.rng.range(4.4, 5.2),
      jamb: ctx.rng.range(4.6, 5.6),
      flank: ctx.rng.range(2.7, 3.2),
      backRadius: ctx.rng.range(3.8, 4.6),
      backHeight: ctx.rng.range(6, 8),
    }),
  budget: 320,
};

export const caveEntrance: PropDef = {
  id: 'caveEntrance',
  footprint: 14.6,
  height: 12,
  build: (ctx) =>
    mouth(ctx, {
      id: 'caveEntrance',
      gap: ctx.rng.range(7, 8.4),
      jamb: ctx.rng.range(7, 8.5),
      flank: ctx.rng.range(4, 4.8),
      backRadius: ctx.rng.range(6, 7),
      backHeight: ctx.rng.range(10, 12.5),
    }),
  budget: 320,
};

/**
 * A fissure rather than a doorway: two slabs leaning apart with a gap you can see down.
 *
 * The cheap variant, and the one that suits a tile that already has something on it. No
 * ridge over the top, so nothing to bridge and nothing to declare.
 */
export const caveCrack: PropDef = {
  id: 'caveCrack',
  footprint: 7.0,
  height: 10,
  budget: 200,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const gap = rng.range(2.4, 3.6);
    const height = rng.range(7, 10);

    for (const [index, side] of [-1, 1].entries()) {
      const slab = parts.part(`prop.caveCrack.slab.${index}`, 'rock');
      // Leaning away from the gap, so the inward face is the overhang-free one and the
      // crack widens as it rises.
      beam(slab, frame, {
        from: [side * (gap / 2 + 1.6), rng.range(-0.5, 0.5), 0],
        to: [side * (gap / 2 + 3.4), rng.range(-0.5, 0.5), height * rng.range(0.85, 1.05)],
        width: rng.range(4.5, 6),
        height: 3.4,
        taper: 0.55,
      });
    }

    return parts.build();
  },
};

export const CAVES = { caveMouth, caveEntrance, caveCrack };
