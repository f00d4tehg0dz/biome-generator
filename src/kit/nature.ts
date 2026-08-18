// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Ground cover: the small stuff that makes a tile read as inhabited rather than empty.
 *
 * These are the props most likely to fall below the printable minimum, so every dimension here
 * is checked at nominal scale, and scatter culls them rather than shrinking them when the tile
 * scale drops.
 *
 * They were also the worst offenders for the thing printing exposed: written as lathe radii on
 * four sides, a stem that reads as "0.75" in the source is 1.06 mm of plastic flat to flat.
 * Six sides and a radius that means what it looks like. See MIN_DURABLE.
 */

import { MeshBuilder } from './solid';
import { beam, flareTo, lathe, type ProfileRing } from './primitives';
import { baseFrame, coherentWobble, Parts, type PropContext, type PropDef } from './prop';

/** Scatters `count` items around the prop's origin, in a deterministic ring. */
function around(ctx: PropContext, count: number, radius: number, fn: (x: number, y: number, i: number) => void) {
  const phase = ctx.rng.range(0, Math.PI * 2);
  for (let i = 0; i < count; i++) {
    const angle = phase + (i / count) * Math.PI * 2 + ctx.rng.range(-0.35, 0.35);
    const distance = ctx.rng.range(radius * 0.25, radius);
    fn(Math.cos(angle) * distance, Math.sin(angle) * distance, i);
  }
}

export const bush: PropDef = {
  id: 'bush',
  footprint: 4.5,
  height: 6,
  budget: 40,
  build(ctx) {
    const rng = ctx.rng;
    const radius = rng.range(2.6, 3.8);
    const foot: ProfileRing = { r: radius * 0.72, z: 0 };
    const b = new MeshBuilder();
    lathe(b, baseFrame(ctx), {
      profile: [foot, flareTo(foot, radius), { r: 0, z: rng.range(4.5, 7) }],
      sides: 5,
      phase: rng.range(0, Math.PI * 2),
      // Coherent, not per-vertex: the flare here runs at MAX_FLARE, so perturbing its two
      // rings independently would tip individual faces past 45°.
      wobble: coherentWobble(rng, 5, 0.12),
    });
    return [b.build('prop.bush', 'foliage')];
  },
};

export const flowerPatch: PropDef = {
  id: 'flowerPatch',
  footprint: 4.2,
  height: 3,
  budget: 100,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    // Six sides at r 1.5 gives 2.6 mm flat to flat. The old four sides at r 0.75 were 1.06 mm
    // of plastic — printable, and gone the first time anyone touched the tile.
    // Separate solids because two scattered stems can land close enough to overlap.
    around(ctx, rng.int(3, 4), 2.6, (x, y, i) => {
      lathe(parts.part(`prop.flowerPatch.${i}`, 'blossom'), frame.translate(x, y, 0), {
        profile: [
          { r: 1.5, z: 0 },
          { r: 1.3, z: rng.range(1.8, 2.8) },
        ],
        sides: 6,
        phase: rng.range(0, Math.PI / 3),
      });
    });
    return parts.build();
  },
};

export const reed: PropDef = {
  id: 'reed',
  footprint: 3.7,
  height: 8,
  budget: 60,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    // Shorter as well as thicker: a reed is a cone, and it was a tall one on a 1.1 mm base.
    around(ctx, rng.int(4, 5), 2.0, (x, y, i) => {
      lathe(parts.part(`prop.reed.${i}`, 'foliage'), frame.translate(x, y, 0), {
        profile: [
          { r: 1.6, z: 0 },
          { r: 0, z: rng.range(4.5, 7) },
        ],
        sides: 6,
        phase: rng.range(0, Math.PI / 3),
      });
    });
    return parts.build();
  },
};

export const lilyPad: PropDef = {
  id: 'lilyPad',
  footprint: 2.8,
  height: 1,
  budget: 40,
  build(ctx) {
    const rng = ctx.rng;
    const b = new MeshBuilder();
    // 1.0 mm thick: the minimum that survives being peeled off the plate.
    lathe(b, baseFrame(ctx), {
      profile: [
        { r: rng.range(1.9, 2.6), z: 0 },
        { r: rng.range(1.9, 2.6), z: 1.0 },
      ],
      sides: 5,
      phase: rng.range(0, Math.PI * 2),
    });
    return [b.build('prop.lilyPad', 'foliage')];
  },
};

export const mushroom: PropDef = {
  id: 'mushroom',
  footprint: 3.4,
  height: 4,
  budget: 60,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const stemTop = rng.range(1.4, 2.2);

    // Six sides at r 1.5 is 2.6 mm flat to flat, and the whole cap stands on it.
    const stem = new MeshBuilder();
    lathe(stem, frame, {
      profile: [
        { r: 1.5, z: 0 },
        { r: 1.4, z: stemTop + 0.4 },
      ],
      sides: 6,
      phase: rng.range(0, Math.PI / 3),
    });

    // The cap flares at 45°. A real mushroom's undercut would need support. Its foot stays
    // inside the stem's *inscribed* radius (1.4·cos 30° = 1.21), so the cap's underside is
    // fully buried — and the brim grew with the stem, or it would read as a nail.
    const cap = new MeshBuilder();
    const foot: ProfileRing = { r: 1.1, z: stemTop };
    const brim = flareTo(foot, rng.range(2.7, 3.3));
    lathe(cap, frame, {
      profile: [foot, brim, { r: brim.r * 0.8, z: brim.z + 0.7 }, { r: 0, z: brim.z + 1.3 }],
      sides: 5,
      phase: rng.range(0, Math.PI * 2),
    });

    return [stem.build('prop.mushroom.stem', 'wood'), cap.build('prop.mushroom.cap', 'blossom')];
  },
};

export const log: PropDef = {
  id: 'log',
  footprint: 5.8,
  height: 3.4,
  budget: 40,
  build(ctx) {
    const rng = ctx.rng;
    // A log reads as a log at any thickness, and at the old 1.5–2.0 it read as a twig and
    // broke like one. Nothing here costs anything but plastic.
    const radius = rng.range(2.2, 2.8);
    const taper = 0.88;
    const sides = 6;
    // Rotating a hexagonal lathe onto its side puts a flat face on the ground and keeps
    // every other face within 30° of vertical. A cylinder here would be undercut.
    //
    // Lift by the *narrow* end's inradius, not the wide end's. The taper means the
    // underside is a shallow ramp; lifting by the wide end would leave the far end hanging
    // a fraction of a millimetre in the air: a real, if tiny, unsupported face.
    const flat = radius * taper * Math.cos(Math.PI / sides);
    const frame = baseFrame(ctx).translate(0, 0, flat).rotateX(-Math.PI / 2);
    const b = new MeshBuilder();
    lathe(b, frame, {
      profile: [
        { r: radius, z: -rng.range(3.5, 5) },
        { r: radius * taper, z: rng.range(3.5, 5) },
      ],
      sides,
    });
    return [b.build('prop.log', 'wood')];
  },
};

export const duneGrass: PropDef = {
  id: 'duneGrass',
  footprint: 4.2,
  height: 7,
  budget: 60,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const count = rng.int(3, 4);
    const phase = rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const angle = phase + (i / count) * Math.PI * 2;
      // 60° above horizontal; a drooping blade would overhang.
      const elevation = rng.range(58, 70) * (Math.PI / 180);
      // Shorter and thicker. A blade is a cantilever anchored only at the ground.
      const length = rng.range(4.5, 6.5);
      // Blades share a root, so they overlap: one solid each.
      beam(parts.part(`prop.duneGrass.${i}`, 'foliage'), frame, {
        from: [0, 0, 0],
        to: [
          Math.cos(angle) * Math.cos(elevation) * length,
          Math.sin(angle) * Math.cos(elevation) * length,
          Math.sin(elevation) * length,
        ],
        width: 2.6,
        height: 2.2,
        taper: 0,
      });
    }
    return parts.build();
  },
};

export const cactus: PropDef = {
  id: 'cactus',
  footprint: 6.1,
  height: 14,
  budget: 120,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const height = rng.range(10, 15);

    const parts = new Parts();
    lathe(parts.part('prop.cactus.body', 'foliage'), frame, {
      profile: [
        { r: 2.4, z: 0 },
        { r: 2.5, z: height * 0.7 },
        { r: 0, z: height },
      ],
      sides: 6,
      phase: rng.range(0, Math.PI / 3),
    });

    // Arms elbow at exactly 45°, then run vertical.
    const arms = rng.int(1, 2);
    const facing = rng.range(0, Math.PI * 2);
    for (let i = 0; i < arms; i++) {
      const angle = facing + i * Math.PI;
      const elbow = height * rng.range(0.35, 0.5);
      const reach = rng.range(2.4, 3.4);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      // Root the elbow well inside the body: a 45° arm's base cap faces exactly at the
      // overhang limit, so it must not be exposed.
      beam(parts.part(`prop.cactus.arm.${i}.elbow`, 'foliage'), frame, {
        from: [dx * 0.2, dy * 0.2, elbow - 1.0],
        to: [dx * (1.2 + reach), dy * (1.2 + reach), elbow + reach],
        width: 2.6,
        height: 2.6,
      });
      // Sink the vertical section back along the elbow's own 45° axis, not straight down.
      // Straight down puts the base cap's corners outside the elbow, leaving a flat
      // downward face hanging in the open; along the axis they stay inside it. The sink
      // scales with the section, or a thicker arm outgrows the joint that hides it.
      const sink = 2.4 / Math.SQRT2;
      beam(parts.part(`prop.cactus.arm.${i}.upper`, 'foliage'), frame, {
        from: [
          dx * (1.2 + reach - sink),
          dy * (1.2 + reach - sink),
          elbow + reach - sink,
        ],
        to: [dx * (1.2 + reach), dy * (1.2 + reach), elbow + reach + rng.range(2, 4)],
        width: 2.4,
        height: 2.4,
        taper: 0.9,
      });
    }

    return parts.build();
  },
};

export const cropRow: PropDef = {
  id: 'cropRow',
  footprint: 11.9,
  height: 1,
  budget: 120,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const b = new MeshBuilder();
    const rows = rng.int(4, 5);
    const length = rng.range(14, 20);
    const spacing = 2.6;
    for (let i = 0; i < rows; i++) {
      const offset = (i - (rows - 1) / 2) * spacing;
      beam(b, frame, {
        from: [offset, -length / 2, 0.5],
        to: [offset, length / 2, 0.5],
        width: 1.6,
        height: 1.0,
      });
    }
    // `blossom`, not `foliage`: a farm needs its crops and its trees in different colours,
    // and foliage is already spoken for by the trees.
    return [b.build('prop.cropRow', 'blossom')];
  },
};

export const NATURE = {
  bush,
  flowerPatch,
  reed,
  lilyPad,
  mushroom,
  log,
  duneGrass,
  cactus,
  cropRow,
};





