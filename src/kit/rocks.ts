// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Rock and terrain props.
 *
 * Every one of these has a flat bottom and leans inward as it rises. Rocks are the easiest
 * prop to get wrong for printing: a "natural" boulder modelled as a lumpy sphere is
 * undercut everywhere. So the whole family is built from lathes whose radius never grows
 * faster than the height.
 */

import type { Rng } from '../core/rng';
import { MeshBuilder, type Solid } from './solid';
import { lathe, MAX_FLARE, type ProfileRing } from './primitives';
import type { Frame } from './frame';
import { baseFrame, Parts, wobbleTable, type PropDef } from './prop';

interface RockOptions {
  radius: number;
  height: number;
  sides: number;
  /** Radius irregularity, 0..0.4. */
  rough: number;
  name: string;
}

/**
 * Takes a Frame rather than a context so callers can offset sub-rocks in *local* space.
 * Offsetting the context's attachment point instead would leave those offsets unscaled,
 * and a cluster at half scale would spread as far as one at full scale.
 */
function rock(frame: Frame, rng: Rng, options: RockOptions): Solid {
  const { radius, height, sides, rough, name } = options;
  const b = new MeshBuilder();
  // Waist slightly wider than the foot, but never by more than the rise allows.
  const waistZ = height * 0.35;
  const waist = Math.min(radius, radius * 0.9 + waistZ * MAX_FLARE);
  const profile: ProfileRing[] = [
    { r: radius * 0.9, z: 0 },
    { r: waist, z: waistZ },
    { r: 0, z: height },
  ];
  lathe(b, frame, {
    profile,
    sides,
    phase: rng.range(0, Math.PI * 2),
    wobble: wobbleTable(rng, profile.length, sides, rough),
  });
  return b.build(name, 'rock');
}

export const boulder: PropDef = {
  id: 'boulder',
  footprint: 6.1,
  height: 7,
  budget: 24,
  build(ctx) {
    const rng = ctx.rng;
    return [
      rock(baseFrame(ctx), rng, {
        radius: rng.range(3.4, 5.2),
        height: rng.range(4.5, 8),
        sides: 5,
        rough: 0.16,
        name: 'prop.boulder',
      }),
    ];
  },
};

export const rockCluster: PropDef = {
  id: 'rockCluster',
  footprint: 7.8,
  height: 6,
  budget: 90,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const count = rng.int(2, 3);
    const solids: Solid[] = [];
    for (let i = 0; i < count; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const distance = rng.range(1.5, 4);
      solids.push(
        rock(frame.translate(Math.cos(angle) * distance, Math.sin(angle) * distance, 0), rng, {
          radius: rng.range(1.8, 3.4),
          height: rng.range(2.4, 5),
          sides: 5,
          rough: 0.2,
          name: `prop.rockCluster.${i}`,
        }),
      );
    }
    return solids;
  },
};

export const cairn: PropDef = {
  id: 'cairn',
  footprint: 3.6,
  height: 9,
  budget: 90,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();

    // Each stone starts no wider than the top of the one below, so a stack of steps reads
    // without a single downward-facing shelf. Consecutive stones overlap, so one solid each.
    let z = 0;
    let radius = rng.range(2.8, 3.4);
    for (let i = 0; i < 3; i++) {
      const top = radius * rng.range(0.76, 0.86);
      const thickness = rng.range(1.8, 2.6);
      lathe(parts.part(`prop.cairn.${i}`, 'rock'), frame, {
        profile: [
          { r: radius, z },
          { r: top, z: z + thickness },
        ],
        sides: 5,
        phase: rng.range(0, Math.PI * 2),
      });
      z += thickness - 0.3;
      radius = top;
    }
    return parts.build();
  },
};

export const mesa: PropDef = {
  id: 'mesa',
  footprint: 10.2,
  height: 16,
  budget: 140,
  build(ctx) {
    const rng = ctx.rng;
    const sides = 6;
    const profile: ProfileRing[] = [];
    let radius = rng.range(7.5, 9.5);
    let z = 0;

    // Push the foot once, then only what each tier adds. Emitting a tier's start ring when
    // it duplicates the previous tier's end ring looks harmless, but the two rings get
    // different wobble rows, so a nominally zero-height annulus crumples, and some of its
    // faces end up pointing straight down.
    profile.push({ r: radius, z });
    for (let tier = 0; tier < 3; tier++) {
      z += rng.range(3.5, 5.5);
      profile.push({ r: radius * rng.range(0.94, 0.98), z });
      radius *= rng.range(0.7, 0.82);
      // An inward step at constant height is an upward-facing annulus, never an overhang.
      profile.push({ r: radius, z });
    }
    profile.push({ r: radius * 0.94, z: z + 2 });

    const b = new MeshBuilder();
    lathe(b, baseFrame(ctx), {
      profile,
      sides,
      phase: ctx.rng.range(0, Math.PI * 2),
      wobble: wobbleTable(ctx.rng, profile.length, sides, 0.06),
    });
    return [b.build('prop.mesa', 'rock')];
  },
};

export const peak: PropDef = {
  id: 'peak',
  footprint: 11.6,
  height: 30,
  budget: 140,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const sides = 6;
    const base = rng.range(8, 10.5);
    const snowLine = rng.range(17, 21);
    const summit = snowLine + rng.range(6, 10);

    const shoulder = base * 0.55;
    const neck = base * 0.28;
    const stone = new MeshBuilder();
    const profile: ProfileRing[] = [
      { r: base, z: 0 },
      { r: shoulder, z: snowLine * 0.55 },
      { r: neck, z: snowLine },
    ];
    lathe(stone, frame, {
      profile,
      sides,
      phase: rng.range(0, Math.PI * 2),
      wobble: wobbleTable(rng, profile.length, sides, 0.1),
    });

    // The cap starts inside the rock's radius at that height, so it can never ledge out.
    const cap = new MeshBuilder();
    lathe(cap, frame, {
      profile: [
        { r: neck * 0.94, z: snowLine - 1.2 },
        { r: 0, z: summit },
      ],
      sides,
      phase: rng.range(0, Math.PI * 2),
    });

    return [stone.build('prop.peak.rock', 'rock'), cap.build('prop.peak.snow', 'snow')];
  },
};

export const ROCKS = { boulder, rockCluster, cairn, mesa, peak };

