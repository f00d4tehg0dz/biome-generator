// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Underground: what a dungeon floor and a cave floor have standing on them.
 *
 * These sit apart from the built family because they answer to a different constraint. A
 * bench is furniture and can be delicate. A pillar is load-bearing scenery: it is the tallest
 * thing on the tile, it is what a hand reaches for when the board gets picked up, and it is
 * mostly a single column of plastic with nothing beside it to share the load. So everything
 * here is fatter than it looks in a render, and the profiles are written from the inscribed
 * diameter rather than the radius, because that is the direction a column actually snaps.
 *
 * Nothing overhangs, which underground is harder than it sounds: the shapes that say "cave"
 * are stalactites and arches, and both of them point the wrong way. Stalactites are out
 * entirely, since a spike hanging from a ceiling has no ceiling to hang from on a tile you
 * look down into. An arch is in, but as a flat lintel on two posts, which is a bridge the
 * printer crosses in one pass rather than a curve it has to support.
 */

import { EMBED, MeshBuilder, MIN_DURABLE } from './solid';
import { beam, lathe } from './primitives';
import { baseFrame, coherentWobble, Parts, type PropContext, type PropDef } from './prop';

/**
 * A column, from plinth to capital.
 *
 * Eight sides rather than six: a pillar is the one prop people look at straight on, and at
 * six the facets read as a nut rather than as stone. The shaft is the piece that matters
 * for strength, so its radius is set from `MIN_DURABLE` and the flat-to-flat distance an
 * eight-sided lathe actually delivers, not from a number that looked about right.
 */
function column(ctx: PropContext, height: number, radius: number): MeshBuilder {
  const shaft = new MeshBuilder();
  lathe(shaft, baseFrame(ctx), {
    profile: [
      { r: radius * 1.34, z: 0 },
      { r: radius * 1.34, z: 1.3 },
      { r: radius, z: 2.2 },
      { r: radius, z: height - 2.2 },
      { r: radius * 1.34, z: height - 1.3 },
      { r: radius * 1.34, z: height },
    ],
    sides: 8,
    phase: Math.PI / 8,
  });
  return shaft;
}

/** Flat to flat across an eight-sided lathe, which is what a snapping column measures. */
const OCTAGON_INSCRIBED = 2 * Math.cos(Math.PI / 8);
const SHAFT_RADIUS = MIN_DURABLE / OCTAGON_INSCRIBED + 0.35;

export const pillar: PropDef = {
  id: 'pillar',
  footprint: 2.2,
  height: 18,
  budget: 220,
  build(ctx) {
    const height = ctx.rng.range(14, 18);
    return [column(ctx, height, SHAFT_RADIUS).build('prop.pillar.shaft', 'stone')];
  },
};

export const brokenPillar: PropDef = {
  id: 'brokenPillar',
  footprint: 2.4,
  height: 9,
  budget: 220,
  build(ctx) {
    const rng = ctx.rng;
    const height = rng.range(4.5, 8);
    const stump = new MeshBuilder();

    // Snapped rather than sawn: the top ring is pulled about unevenly, and the last stretch
    // leans inward so the break still prints without anything under it.
    lathe(stump, baseFrame(ctx), {
      profile: [
        { r: SHAFT_RADIUS * 1.34, z: 0 },
        { r: SHAFT_RADIUS * 1.34, z: 1.3 },
        { r: SHAFT_RADIUS, z: 2.2 },
        { r: SHAFT_RADIUS, z: height },
        { r: SHAFT_RADIUS * 0.72, z: height + rng.range(0.6, 1.6) },
      ],
      sides: 8,
      phase: Math.PI / 8,
      wobble: coherentWobble(rng, 8, 0.09),
    });

    return [stump.build('prop.brokenPillar.stump', 'stone')];
  },
};

export const brazier: PropDef = {
  id: 'brazier',
  footprint: 3.2,
  height: 12,
  budget: 260,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const stem = rng.range(4.5, 6);
    const parts = new Parts();

    // Stem and bowl are one lathe: a bowl balanced on a separate post is exactly the joint
    // that snaps, and there is no reason for them to be two solids when they share an axis.
    lathe(parts.part('prop.brazier.stand', 'stone'), frame, {
      profile: [
        { r: 2.6, z: 0 },
        { r: 2.6, z: 0.9 },
        { r: 1.5, z: 1.8 },
        { r: 1.5, z: stem },
        // 1.6 out over 2.0 up stays inside the 45° rule with room to spare.
        { r: 3.1, z: stem + 2.0 },
        { r: 3.1, z: stem + 2.6 },
      ],
      sides: 8,
      phase: rng.range(0, Math.PI / 4),
    });

    // The flame is the biome's feature colour, and it is why a brazier is worth having on a
    // four-filament tile at all: one warm thing in a grey room.
    lathe(parts.part('prop.brazier.flame', 'blossom'), frame, {
      profile: [
        { r: 2.4, z: stem + 1.4 },
        { r: 2.1, z: stem + 3.0 },
        { r: 0, z: stem + rng.range(5.0, 6.4) },
      ],
      sides: 6,
      phase: rng.range(0, Math.PI / 3),
    });

    return parts.build();
  },
};

export const crate: PropDef = {
  id: 'crate',
  footprint: 5.3,
  height: 7,
  budget: 120,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const side = rng.range(5.5, 7);
    const height = rng.range(4.5, 6);
    const parts = new Parts();

    beam(parts.part('prop.crate.box', 'wood'), frame, {
      from: [0, 0, 0],
      to: [0, 0, height],
      width: side,
      height: side * rng.range(0.85, 1),
    });

    // A lid that stands proud by a third of a millimetre, which is enough to read as a lid
    // and short enough to print as a chamfer rather than an overhang.
    beam(parts.part('prop.crate.lid', 'wood'), frame, {
      from: [0, 0, height - 0.8],
      to: [0, 0, height + 0.9],
      width: side + 0.7,
      height: side * 0.9 + 0.7,
    });

    return parts.build();
  },
};

export const archway: PropDef = {
  id: 'archway',
  footprint: 5.7,
  height: 13,
  budget: 160,
  // The lintel crosses the gap between the posts unsupported, which is the one thing this
  // family is allowed and the reason the doorway is square rather than arched.
  bridges: true,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const height = rng.range(9, 11);
    const span = rng.range(6.5, 8);
    const post = 2.8;
    const parts = new Parts();

    const posts = parts.part('prop.archway.posts', 'stone');
    for (const x of [-span / 2, span / 2]) {
      beam(posts, frame, {
        from: [x, 0, 0],
        to: [x, 0, height],
        width: post,
        height: post,
      });
    }

    beam(parts.part('prop.archway.lintel', 'stone'), frame, {
      from: [-span / 2 - post / 2, 0, height + 0.9],
      to: [span / 2 + post / 2, 0, height + 0.9],
      width: post,
      height: 2.6,
    });

    return parts.build();
  },
};

/**
 * A run of ruined wall.
 *
 * The one prop that says "room" rather than "outside with stone in it". Built as three
 * courses of different heights rather than one block, because a wall with a level top reads
 * as a bench, and because the tallest course can then stand alone as the corner of
 * something that has mostly fallen down.
 */
export const dungeonWall: PropDef = {
  id: 'dungeonWall',
  footprint: 10.8,
  height: 7,
  budget: 120,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const courses = rng.int(2, 3);
    const length = rng.range(5.5, 7);
    const thickness = 3.0;

    for (let i = 0; i < courses; i++) {
      const x = (i - (courses - 1) / 2) * length;
      beam(parts.part(`prop.dungeonWall.course.${i}`, 'stone'), frame, {
        from: [x, 0, 0],
        to: [x, 0, rng.range(3.5, 7)],
        width: length + 0.4,
        height: thickness,
      });
    }

    return parts.build();
  },
};

export const sarcophagus: PropDef = {
  id: 'sarcophagus',
  footprint: 6.8,
  height: 4,
  budget: 90,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const length = rng.range(9, 11);
    const width = rng.range(4.2, 5);
    const body = rng.range(2.6, 3.4);

    beam(parts.part('prop.sarcophagus.chest', 'stone'), frame, {
      from: [-length / 2, 0, body / 2],
      to: [length / 2, 0, body / 2],
      width,
      height: body,
    });

    // The lid sits proud all round, which is the whole silhouette of the thing, and slides
    // off centre often enough to look disturbed rather than displayed.
    beam(parts.part('prop.sarcophagus.lid', 'stone'), frame, {
      from: [-length / 2 + rng.range(-0.6, 0.6), rng.range(-0.4, 0.4), body - 0.3],
      to: [length / 2 + rng.range(-0.6, 0.6), rng.range(-0.4, 0.4), body - 0.3],
      width: width + 0.9,
      height: 2.4,
    });

    return parts.build();
  },
};

/** Fallen blocks: what a wall leaves behind, squared off rather than weathered round. */
export const masonry: PropDef = {
  id: 'masonry',
  footprint: 4.8,
  height: 4,
  budget: 90,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const blocks = rng.int(2, 3);

    for (let i = 0; i < blocks; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const distance = rng.range(0, 2.4);
      const size = rng.range(2.8, 3.8);
      beam(parts.part(`prop.masonry.block.${i}`, 'stone'), frame, {
        from: [Math.cos(angle) * distance, Math.sin(angle) * distance, 0],
        to: [Math.cos(angle) * distance, Math.sin(angle) * distance, size * rng.range(0.7, 1.1)],
        width: size,
        height: size * rng.range(0.85, 1.15),
        roll: rng.range(0, Math.PI / 2),
      });
    }

    return parts.build();
  },
};

export const stalagmite: PropDef = {
  id: 'stalagmite',
  footprint: 3.5,
  height: 13,
  budget: 200,
  build(ctx) {
    const rng = ctx.rng;
    const height = rng.range(7, 13);
    const spike = new MeshBuilder();

    // Two stretches rather than a straight cone: fat at the foot where the drip pools, then
    // a long taper. Both narrow going up, so the whole thing is self-supporting by shape.
    lathe(spike, baseFrame(ctx), {
      profile: [
        { r: 3.0, z: 0 },
        { r: 2.2, z: height * 0.35 },
        { r: 1.2, z: height * 0.8 },
        { r: 0, z: height },
      ],
      sides: 7,
      phase: rng.range(0, Math.PI * 2),
      wobble: coherentWobble(rng, 7, 0.12),
    });

    return [spike.build('prop.stalagmite.spike', 'rock')];
  },
};

export const crystal: PropDef = {
  id: 'crystal',
  footprint: 3.3,
  height: 9,
  budget: 220,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const count = rng.int(2, 3);

    // A cluster leaning out of one root. Each shard is its own solid because they overlap at
    // the foot, and each leans no more than 20° off vertical so its low side still stands
    // steeper than the 45° limit.
    //
    // The extra sink is not decoration. A beam's end cap is square to its axis, so a leaning
    // shard tilts its own base, and the high corner of that cap rises back above the embed
    // plane and reads as a downward face with nothing under it. Sinking by the amount the
    // lean lifts it puts the whole cap under the surface, where it belongs.
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng.range(0, 1);
      const lean = rng.range(0.1, 0.28);
      const length = rng.range(5.5, 9);
      const foot = 1.5 + i * 0.1;

      beam(parts.part(`prop.crystal.shard.${i}`, 'water'), frame, {
        from: [Math.cos(angle) * 0.8, Math.sin(angle) * 0.8, -EMBED - foot * Math.sin(lean)],
        to: [
          Math.cos(angle) * (0.8 + Math.sin(lean) * length),
          Math.sin(angle) * (0.8 + Math.sin(lean) * length),
          Math.cos(lean) * length,
        ],
        width: foot * 2,
        height: foot * 2,
        taper: 0,
        roll: angle,
      });
    }

    return parts.build();
  },
};

export const DUNGEON = {
  pillar,
  brokenPillar,
  dungeonWall,
  sarcophagus,
  masonry,
  brazier,
  crate,
  archway,
  stalagmite,
  crystal,
};
