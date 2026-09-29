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

/**
 * A barrel standing on end.
 *
 * The belly is what makes it a barrel rather than a post, and it is the one part of it that
 * widens going up, so it is kept shallow: under a millimetre of swell over half the height.
 * The hoops stand proud of the staves on a chamfer rather than a step, because a ring with a
 * flat underside is a ledge all the way round.
 */
export const barrel: PropDef = {
  id: 'barrel',
  footprint: 3.6,
  height: 8,
  budget: 280,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const height = rng.range(6.5, 8);
    const end = rng.range(2.5, 2.8);
    const belly = end + rng.range(0.45, 0.6);
    const phase = rng.range(0, Math.PI / 5);
    const parts = new Parts();

    const radiusAt = (z: number) => end + (belly - end) * (1 - Math.abs(z / (height / 2) - 1));

    // The top is dished by a third of a millimetre inside a rim, which is the whole difference
    // between a barrel and a drum at this size.
    lathe(parts.part('prop.barrel.staves', 'wood'), frame, {
      profile: [
        { r: end, z: 0 },
        { r: belly, z: height / 2 },
        { r: end, z: height },
        { r: end - 0.6, z: height },
        { r: end - 0.6, z: height - 0.3 },
      ],
      sides: 10,
      phase,
    });

    const HOOP = 1.3;
    [height * 0.14, height * 0.86 - HOOP].forEach((z, i) => {
      const r = Math.max(radiusAt(z), radiusAt(z + HOOP));
      lathe(parts.part(`prop.barrel.hoop.${i}`, 'stone'), frame, {
        profile: [
          // Starts inside the staves and chamfers out: 0.65 over 0.8 is inside MAX_FLARE.
          { r: r - 0.35, z },
          { r: r + 0.3, z: z + 0.8 },
          { r: r + 0.3, z: z + HOOP },
          { r: r - 0.35, z: z + HOOP },
        ],
        sides: 10,
        phase,
      });
    });

    return parts.build();
  },
};

/**
 * A strongbox. The pack's chest has a rounded lid, and a rounded lid is a half-cylinder lying
 * on its side, which is overhang from the equator down. A hipped lid says the same thing and
 * only ever narrows going up.
 */
export const chest: PropDef = {
  id: 'chest',
  footprint: 5.7,
  height: 7,
  budget: 72,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const length = rng.range(7, 8.5);
    const depth = rng.range(5, 5.8);
    const body = rng.range(3.4, 4);
    const parts = new Parts();

    beam(parts.part('prop.chest.body', 'wood'), frame, {
      from: [0, 0, 0],
      to: [0, 0, body],
      width: length,
      height: depth,
    });

    // Proud by a third of a millimetre, the same short cantilever the crate lid gets away with.
    beam(parts.part('prop.chest.rim', 'wood'), frame, {
      from: [0, 0, body - 0.6],
      to: [0, 0, body + 0.6],
      width: length + 0.7,
      height: depth + 0.7,
    });

    beam(parts.part('prop.chest.lid', 'wood'), frame, {
      from: [0, 0, body + 0.3],
      to: [0, 0, body + rng.range(1.8, 2.4)],
      width: length + 0.4,
      height: depth + 0.4,
      taper: 0.55,
    });

    // The lock plate is gold, so on a four-filament print the chest carries one warm spot the
    // way the brazier does. Half of it is buried in the front face, which is what holds it on.
    beam(parts.part('prop.chest.lock', 'blossom'), frame, {
      from: [0, -depth / 2 - 0.1, body - 2.1],
      to: [0, -depth / 2 - 0.1, body + 0.5],
      width: 2.4,
      height: 1.4,
    });

    return parts.build();
  },
};

/**
 * A heap of coin with a couple of stacks leaning on it. All one colour, so it has to read by
 * shape: the stacks are the only straight-sided thing in it, and they are what says "coin"
 * rather than "sand".
 */
export const hoard: PropDef = {
  id: 'hoard',
  footprint: 4.7,
  height: 4,
  budget: 140,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const radius = rng.range(3.4, 4.2);
    const height = rng.range(2.4, 3.2);
    const parts = new Parts();

    lathe(parts.part('prop.hoard.heap', 'blossom'), frame, {
      profile: [
        { r: radius, z: 0 },
        { r: radius * 0.8, z: 0.9 },
        { r: radius * 0.45, z: height * 0.75 },
        { r: 0, z: height },
      ],
      sides: 9,
      phase: rng.range(0, Math.PI),
      wobble: coherentWobble(rng, 9, 0.12),
    });

    const start = rng.range(0, Math.PI * 2);
    for (let i = 0; i < 2; i++) {
      const angle = start + i * rng.range(1.8, 2.6);
      const distance = radius * 0.7;
      // 1.4 across an octagon is 2.6 mm flat to flat, clear of MIN_DURABLE.
      lathe(parts.part(`prop.hoard.stack.${i}`, 'blossom'), frame.translate(Math.cos(angle) * distance, Math.sin(angle) * distance, 0), {
        profile: [
          { r: 1.4, z: 0 },
          { r: 1.4, z: rng.range(2.2, 3.6) },
        ],
        sides: 8,
        phase: rng.range(0, Math.PI / 4),
      });
    }

    return parts.build();
  },
};

/**
 * A skull and the bones that went with it.
 *
 * At true scale a skull on a dungeon tile is under three millimetres and a femur is a hair,
 * so both are drawn at the size they need to be to survive being picked up. The bones lie
 * flat, which is the only way a thing that long and thin prints and stays on: held along its
 * whole length rather than standing on one end.
 */
export const bones: PropDef = {
  id: 'bones',
  footprint: 6,
  height: 4,
  budget: 216,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();

    const skullAngle = rng.range(0, Math.PI * 2);
    lathe(
      parts.part('prop.bones.skull', 'path'),
      frame.translate(Math.cos(skullAngle) * 2.4, Math.sin(skullAngle) * 2.4, 0),
      {
        profile: [
          { r: 1.9, z: 0 },
          { r: 2.05, z: 1.3 },
          { r: 1.7, z: 2.6 },
          { r: 0.9, z: 3.3 },
        ],
        sides: 7,
        phase: rng.range(0, Math.PI),
      },
    );

    const count = rng.int(2, 3);
    for (let i = 0; i < count; i++) {
      const angle = skullAngle + Math.PI * 0.6 + i * rng.range(0.7, 1.1);
      const length = rng.range(5.5, 7);
      const cx = Math.cos(angle + Math.PI / 2) * (i - (count - 1) / 2) * 1.2;
      const cy = Math.sin(angle + Math.PI / 2) * (i - (count - 1) / 2) * 1.2;
      const dx = (Math.cos(angle) * length) / 2;
      const dy = (Math.sin(angle) * length) / 2;

      beam(parts.part(`prop.bones.shaft.${i}`, 'path'), frame, {
        from: [cx - dx, cy - dy, 1.2],
        to: [cx + dx, cy + dy, 1.2],
        width: 2.4,
        height: 2.4,
      });

      // Knuckles at each end, stood upright so they print as short blocks rather than as a
      // cross-grain overhang off the shaft.
      for (const [end, sign] of [
        ['a', -1],
        ['b', 1],
      ] as const) {
        beam(parts.part(`prop.bones.knuckle.${i}.${end}`, 'path'), frame, {
          from: [cx + sign * dx, cy + sign * dy, 0],
          to: [cx + sign * dx, cy + sign * dy, 2.8],
          width: 3.2,
          height: 3.2,
          roll: angle,
        });
      }
    }

    return parts.build();
  },
};

/**
 * A plate of floor spikes. Each spike is a four-sided cone rather than a round one: the pack's
 * are square-section, and a pyramid narrows on every face, so it is self-supporting by shape.
 */
export const spikeTrap: PropDef = {
  id: 'spikeTrap',
  footprint: 7.5,
  height: 6,
  budget: 96,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const side = rng.range(9, 10.5);
    const pitch = side / 3;
    const parts = new Parts();

    beam(parts.part('prop.spikeTrap.plate', 'rock'), frame, {
      from: [0, 0, 0],
      to: [0, 0, 1.2],
      width: side,
      height: side,
    });

    // Nine spikes that never touch each other can share one builder; they all stand in the
    // plate, which is the one they must not share with.
    const spikes = parts.part('prop.spikeTrap.spikes', 'stone');
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        lathe(spikes, frame.translate(i * pitch, j * pitch, 0), {
          profile: [
            // 1.75 on a square is 2.5 mm across the flats at the foot.
            { r: 1.75, z: 0.6 },
            { r: 0, z: 0.6 + rng.range(3.2, 4.4) },
          ],
          sides: 4,
          phase: Math.PI / 4,
        });
      }
    }

    return parts.build();
  },
};

/**
 * A short flight up to a landing. Each step is its own block running all the way back to the
 * top, so they overlap rather than meet, and every one of them stands on the floor.
 */
export const stairs: PropDef = {
  id: 'stairs',
  footprint: 7,
  height: 11,
  budget: 64,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const steps = rng.int(3, 4);
    const rise = rng.range(2.2, 2.6);
    const tread = rng.range(2.4, 2.8);
    const width = rng.range(7, 8.5);
    const depth = steps * tread;
    const parts = new Parts();

    for (let i = 0; i < steps; i++) {
      const front = -depth / 2 + i * tread;
      beam(parts.part(`prop.stairs.step.${i}`, 'stone'), frame, {
        from: [0, (front + depth / 2) / 2, 0],
        to: [0, (front + depth / 2) / 2, (i + 1) * rise],
        width,
        height: depth / 2 - front,
      });
    }

    return parts.build();
  },
};

/**
 * Bars between two posts, the pack's cell door stood on its own.
 *
 * Two bars, not five. A bar has to be 2.3 mm to survive, and it needs daylight either side
 * of it to read as a bar rather than a wall, so a gate this size holds two. The crossbar
 * bridges from post to post through them, which is what makes it a grille and not a fence.
 */
export const portcullis: PropDef = {
  id: 'portcullis',
  footprint: 7.8,
  height: 12,
  budget: 100,
  bridges: true,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const height = rng.range(9, 11);
    const post = 2.8;
    const bar = 2.3;
    const gap = rng.range(8.8, 9.6);
    const span = gap + post;
    const parts = new Parts();

    const posts = parts.part('prop.portcullis.posts', 'stone');
    for (const x of [-span / 2, span / 2]) {
      beam(posts, frame, { from: [x, 0, 0], to: [x, 0, height], width: post, height: post });
    }

    beam(parts.part('prop.portcullis.lintel', 'stone'), frame, {
      from: [-span / 2 - post / 2, 0, height + 0.9],
      to: [span / 2 + post / 2, 0, height + 0.9],
      width: post,
      height: 2.6,
    });

    const bars = parts.part('prop.portcullis.bars', 'rock');
    for (const x of [-gap / 4, gap / 4]) {
      beam(bars, frame, { from: [x, 0, 0], to: [x, 0, height + 0.3], width: bar, height: bar });
    }

    beam(parts.part('prop.portcullis.crossbar', 'rock'), frame, {
      from: [-span / 2, 0, height * 0.5],
      to: [span / 2, 0, height * 0.5],
      width: bar,
      height: bar,
    });

    return parts.build();
  },
};

/**
 * Candles in a pool of their own wax. The pool is what holds them: three free-standing
 * sticks this thin are three levers, one lump with three sticks in it is a single part.
 */
export const candles: PropDef = {
  id: 'candles',
  footprint: 3.7,
  height: 9,
  budget: 240,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();

    lathe(parts.part('prop.candles.pool', 'path'), frame, {
      profile: [
        { r: 3.6, z: 0 },
        { r: 3.3, z: 1.3 },
      ],
      sides: 9,
      phase: rng.range(0, Math.PI),
    });

    const count = rng.int(2, 3);
    const start = rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const angle = start + (i / count) * Math.PI * 2;
      const distance = rng.range(1.4, 1.8);
      const at = frame.translate(Math.cos(angle) * distance, Math.sin(angle) * distance, 0);
      const height = rng.range(3.2, 6.5);

      // Eight sides at 1.4 is 2.6 mm flat to flat; the section check reads it as 2.35 square,
      // which is the margin that keeps the tallest candle legal under its own flame.
      lathe(parts.part(`prop.candles.wax.${i}`, 'path'), at, {
        profile: [
          { r: 1.4, z: 0 },
          { r: 1.4, z: height },
        ],
        sides: 8,
      });

      // Narrower than the wax at its foot, so the whole base ring is buried in the candle.
      lathe(parts.part(`prop.candles.flame.${i}`, 'blossom'), at, {
        profile: [
          { r: 1.3, z: height - 0.4 },
          { r: 1.1, z: height + 0.5 },
          { r: 0, z: height + 2.0 },
        ],
        sides: 8,
      });
    }

    return parts.build();
  },
};

export const DUNGEON = {
  barrel,
  chest,
  hoard,
  bones,
  spikeTrap,
  stairs,
  portcullis,
  candles,
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
