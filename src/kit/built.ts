// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Made things: the props that say somebody lives here.
 *
 * This is the only family allowed unsupported horizontal spans: a bench seat between its
 * legs, a fence rail between posts, a dock deck between piles. FDM bridges these cleanly
 * well under MAX_BRIDGE, and designing them out would mean solid blocks instead of
 * furniture. Every builder that bridges declares `bridges: true`.
 */

import { EMBED, MeshBuilder, MAX_BRIDGE, MIN_LEG, type Solid } from './solid';
import { beam, lathe } from './primitives';
import { baseFrame, Parts, type PropContext, type PropDef } from './prop';

/** Square-section post from the ground to `height`. */
function post(b: MeshBuilder, frame: ReturnType<typeof baseFrame>, x: number, y: number, height: number, size = MIN_LEG) {
  beam(b, frame, { from: [x, y, 0], to: [x, y, height], width: size, height: size });
}

export const bench: PropDef = {
  id: 'bench',
  footprint: 7.3,
  height: 8.5,
  budget: 100,
  bridges: true,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    // Long and low. An earlier version sat at 6.5 mm on 1.6 mm slab ends 4.2 mm deep, which
    // read as a walled box rather than a bench and stood taller than the saplings beside it.
    // A park bench is mostly seat.
    const length = rng.range(11, 13.5);
    const seatZ = rng.range(3.6, 4.2);
    const PLANK = 1.2;
    const b = new Parts();

    // Parts of a compound prop must *interpenetrate*, never meet flush. Two boxes sharing
    // an exact edge get their vertices welded and the result is non-manifold; the seat
    // and the backrest of an earlier version of this bench did exactly that. Overlapping
    // them costs nothing: the slicer unions overlapping closed solids anyway.
    const legInset = length / 2 - 1.4;
    const legs = b.part('prop.bench.legs', 'wood');
    for (const x of [-legInset, legInset]) {
      beam(legs, frame, { from: [x, 0, 0], to: [x, 0, seatZ], width: PLANK, height: 3.6 });
    }

    // Seat: dips 0.3 below the leg tops.
    beam(b.part('prop.bench.seat', 'wood'), frame, {
      from: [-length / 2, 0, seatZ + 0.3],
      to: [length / 2, 0, seatZ + 0.3],
      width: 4.0,
      height: PLANK,
    });
    // Back: overlaps the seat's top by 0.25, and is inset in x so no corner aligns.
    beam(b.part('prop.bench.back', 'wood'), frame, {
      from: [-length / 2 + 0.35, -1.5, seatZ + 2.2],
      to: [length / 2 - 0.35, -1.5, seatZ + 2.2],
      width: PLANK,
      height: 3.0,
    });

    return b.build();
  },
};

export const picnicTable: PropDef = {
  id: 'picnicTable',
  footprint: 7.7,
  height: 6,
  budget: 160,
  bridges: true,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const length = rng.range(11, 13);
    const seatZ = 3.0;
    const topZ = rng.range(5.0, 5.6);
    const PLANK = 1.2;
    const b = new Parts();

    // Two solid trestles rather than four legs and a cross member. The seats land on the
    // wide lower half and the top on the narrow upper half, so every plank is carried by
    // something instead of hanging beside a leg, and the whole frame prints off the bed.
    const inset = length / 2 - 1.5;
    const trestles = b.part('prop.picnicTable.trestles', 'wood');
    for (const x of [-inset, inset]) {
      beam(trestles, frame, { from: [x, 0, 0], to: [x, 0, seatZ + 0.4], width: 1.6, height: 8.4 });
      beam(trestles, frame, { from: [x, 0, seatZ], to: [x, 0, topZ], width: 1.6, height: 4.4 });
    }

    // The planks bridge the gap between the trestles, which is what `bridges` declares.
    beam(b.part('prop.picnicTable.top', 'wood'), frame, {
      from: [-length / 2, 0, topZ - 0.2],
      to: [length / 2, 0, topZ - 0.2],
      width: 4.6,
      height: PLANK,
    });

    // One part for both seats: they never touch, so they cannot weld into each other.
    const seats = b.part('prop.picnicTable.seats', 'wood');
    for (const y of [-3.4, 3.4]) {
      beam(seats, frame, {
        from: [-length / 2 + 0.4, y, seatZ + 0.1],
        to: [length / 2 - 0.4, y, seatZ + 0.1],
        width: 2.2,
        height: PLANK,
      });
    }

    return b.build();
  },
};

export const lamp: PropDef = {
  id: 'lamp',
  footprint: 2.0,
  height: 14,
  budget: 100,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const height = rng.range(11, 14);

    const stem = new MeshBuilder();
    lathe(stem, frame, {
      profile: [
        { r: 1.0, z: 0 },
        { r: 0.75, z: height },
      ],
      sides: 4,
      phase: rng.range(0, Math.PI / 2),
    });

    // The head flares at 45° off the post, so its underside is inside the limit.
    const head = new MeshBuilder();
    lathe(head, frame, {
      profile: [
        { r: 0.5, z: height - 1.2 },
        { r: 1.7, z: height + 0.9 },
        { r: 1.5, z: height + 2.0 },
        { r: 0, z: height + 3.0 },
      ],
      sides: 5,
      phase: rng.range(0, Math.PI * 2),
    });

    return [stem.build('prop.lamp.post', 'wood'), head.build('prop.lamp.head', 'blossom')];
  },
};

export const fence: PropDef = {
  id: 'fence',
  footprint: 13.8,
  height: 6,
  budget: 140,
  bridges: true,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const bays = rng.int(2, 3);
    const spacing = Math.min(MAX_BRIDGE - 3, 8.5);
    const height = rng.range(5, 6.5);

    // Posts never touch each other, so they share a solid; the rails cross them, so each
    // rail is its own.
    const posts = parts.part('prop.fence.posts', 'wood');
    for (let i = 0; i <= bays; i++) {
      post(posts, frame, (i - bays / 2) * spacing, 0, height);
    }
    [height * 0.42, height * 0.84].forEach((railZ, i) => {
      beam(parts.part(`prop.fence.rail.${i}`, 'wood'), frame, {
        from: [(-bays / 2) * spacing, 0, railZ],
        to: [(bays / 2) * spacing, 0, railZ],
        width: 1.2,
        height: 1.2,
      });
    });
    return parts.build();
  },
};

interface HutSpec {
  id: string;
  width: number;
  height: number;
  roofRise: number;
  chimney: boolean;
  snow: boolean;
}

/**
 * How far the eave reaches past the wall, as a multiple of the wall's half-width.
 *
 * Not a styling choice. A hip roof rising from the wall line barely clears the wall at all,
 * and at 1.06 it did not clear it: the rim stood a fifth of a millimetre proud of the roof
 * the whole way round, which reads as a hairline of wall colour tracing the eave. The roof
 * has to *cover* the top of the walls, and the width of the eave is what buys the height to
 * do it with.
 */
const EAVE = 1.18;

function hutLike(ctx: PropContext, spec: HutSpec): Solid[] {
  const rng = ctx.rng;
  const frame = baseFrame(ctx);
  const solids: Solid[] = [];
  const half = spec.width / 2;

  const walls = new MeshBuilder();
  beam(walls, frame, {
    from: [0, 0, 0],
    to: [0, 0, spec.height],
    width: spec.width,
    height: spec.width * rng.range(0.85, 1.0),
  });
  solids.push(walls.build(`prop.${spec.id}.walls`, 'wood'));

  const eaveZ = spec.height - EMBED;

  /**
   * Height of the roof's surface `m` from the centre, measured square to a face.
   *
   * The roof is a four-sided lathe phased onto the diagonals, so its faces are flat and
   * axis-aligned and a point's cover depends on its distance from the axis along the wider
   * of the two axes, not on its radius.
   */
  const roofTop = (m: number) => eaveZ + spec.roofRise * (1 - m / (half * EAVE));

  if (spec.chimney) {
    // Height taken from the roof it comes through rather than from the apex. Measured from
    // the apex, a stack standing a third of the way out from the middle towered over the
    // house by most of the roof's rise.
    const centre = spec.width * 0.28;
    const stack = new MeshBuilder();
    beam(stack, frame, {
      from: [centre, 0, spec.height - 1.5],
      to: [centre, 0, roofTop(centre + 1.1) + 3.4],
      width: 2.2,
      height: 2.2,
    });
    solids.push(stack.build(`prop.${spec.id}.chimney`, 'wood'));
  }

  // A hip roof: four faces, each rising from the eave to the apex.
  const roof = new MeshBuilder();
  lathe(roof, frame, {
    profile: [
      { r: half * Math.SQRT2 * EAVE, z: eaveZ },
      { r: 0, z: eaveZ + spec.roofRise },
    ],
    sides: 4,
    phase: Math.PI / 4,
  });
  solids.push(roof.build(`prop.${spec.id}.roof`, 'roof'));

  if (spec.snow) {
    const cap = new MeshBuilder();
    lathe(cap, frame, {
      profile: [
        { r: half * Math.SQRT2 * 0.55, z: eaveZ + spec.roofRise * 0.45 },
        { r: 0, z: eaveZ + spec.roofRise + 0.5 },
      ],
      sides: 4,
      phase: Math.PI / 4,
    });
    solids.push(cap.build(`prop.${spec.id}.snow`, 'snow'));
  }

  return solids;
}

export const hut: PropDef = {
  id: 'hut',
  footprint: 10.9,
  height: 17,
  budget: 200,
  build: (ctx) =>
    hutLike(ctx, {
      id: 'hut',
      width: ctx.rng.range(10, 13),
      height: ctx.rng.range(7, 9),
      roofRise: ctx.rng.range(6, 8),
      chimney: false,
      snow: false,
    }),
};

export const cabin: PropDef = {
  id: 'cabin',
  footprint: 11.8,
  height: 21,
  budget: 200,
  build: (ctx) =>
    hutLike(ctx, {
      id: 'cabin',
      width: ctx.rng.range(11, 14),
      height: ctx.rng.range(8, 10),
      roofRise: ctx.rng.range(7, 9),
      chimney: true,
      snow: true,
    }),
};

export const barn: PropDef = {
  id: 'barn',
  footprint: 14.3,
  height: 23,
  budget: 200,
  build: (ctx) =>
    hutLike(ctx, {
      id: 'barn',
      width: ctx.rng.range(14, 17),
      height: ctx.rng.range(9, 11),
      roofRise: ctx.rng.range(8, 11),
      chimney: false,
      snow: false,
    }),
};

export const tent: PropDef = {
  id: 'tent',
  footprint: 8.0,
  height: 12,
  budget: 60,
  build(ctx) {
    const rng = ctx.rng;
    const half = rng.range(4, 5.5);
    const b = new MeshBuilder();
    lathe(b, baseFrame(ctx), {
      profile: [
        { r: half * Math.SQRT2, z: 0 },
        { r: 0, z: rng.range(9, 13) },
      ],
      sides: 4,
      phase: Math.PI / 4 + rng.range(-0.2, 0.2),
    });
    return [b.build('prop.tent', 'fabric')];
  },
};

export const dock: PropDef = {
  id: 'dock',
  footprint: 10.7,
  height: 5,
  budget: 140,
  bridges: true,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const length = rng.range(14, 20);
    const width = rng.range(5.5, 7);
    const deckZ = rng.range(3, 4);

    const piles = parts.part('prop.dock.piles', 'wood');
    for (const y of [-length / 2 + 1.6, 0, length / 2 - 1.6]) {
      post(piles, frame, -width / 2 + 1.2, y, deckZ);
      post(piles, frame, width / 2 - 1.2, y, deckZ);
    }
    // The deck's underside dips 0.3 below the pile tops. Resting exactly on them would be
    // both flush faces and, as far as any support check can tell, not attached at all.
    beam(parts.part('prop.dock.deck', 'wood'), frame, {
      from: [0, -length / 2, deckZ + 0.4],
      to: [0, length / 2, deckZ + 0.4],
      width,
      height: 1.4,
    });
    return parts.build();
  },
};

export const rowboat: PropDef = {
  id: 'rowboat',
  footprint: 6.2,
  height: 3,
  budget: 60,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const half = rng.range(4.5, 6);
    const TAPER = 0.35;
    const hullHeight = 3.0;
    // A tapered beam narrows in both axes, so the hull's underside rises toward each end.
    // Sitting the waist on the surface would leave that underside hanging just clear of the
    // ground along most of its length, a shallow but real ceiling. Sinking the keel until
    // the *highest* part of the underside is level with the surface fixes it, and reads as a
    // boat pulled up onto the shore.
    const keel = (hullHeight / 2) * TAPER;
    // Two halves back to back, starting on opposite sides of the waist so they overlap
    // instead of meeting flush; identical touching end caps would weld and go non-manifold.
    for (const [name, end] of [
      ['prop.rowboat.bow', half],
      ['prop.rowboat.stern', -half],
    ] as const) {
      beam(parts.part(name, 'wood'), frame, {
        from: [0, end > 0 ? -0.8 : 0.8, keel],
        to: [0, end, keel],
        width: 3.6,
        height: hullHeight,
        taper: TAPER,
      });
    }
    return parts.build();
  },
};

export const well: PropDef = {
  id: 'well',
  footprint: 4.8,
  height: 13,
  budget: 200,
  bridges: true,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const outer = rng.range(2.9, 3.4);
    const rim = rng.range(4, 5);

    // The lathe profile walks up the outside, across the rim, back *down* the inside and
    // closes on the axis, which is how a lathe makes a bucket without a boolean.
    const ring = new MeshBuilder();
    lathe(ring, frame, {
      profile: [
        { r: outer, z: 0 },
        { r: outer, z: rim },
        { r: outer - 1.2, z: rim },
        { r: outer - 1.2, z: rim - 1.6 },
        { r: 0, z: rim - 1.6 },
      ],
      sides: 6,
      phase: rng.range(0, Math.PI / 3),
    });

    const parts = new Parts();
    const roofZ = rim + rng.range(5, 6.5);
    const posts = parts.part('prop.well.posts', 'wood');
    post(posts, frame, -outer + 0.9, 0, roofZ);
    post(posts, frame, outer - 0.9, 0, roofZ);
    lathe(parts.part('prop.well.roof', 'roof'), frame, {
      profile: [
        { r: outer * 1.35, z: roofZ - 1.4 },
        { r: 0, z: roofZ - 1.4 + outer * 1.35 * 0.75 },
      ],
      sides: 4,
      phase: Math.PI / 4,
    });

    return [ring.build('prop.well.ring', 'stone'), ...parts.build()];
  },
};

export const signpost: PropDef = {
  id: 'signpost',
  footprint: 3.0,
  height: 9,
  budget: 60,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const parts = new Parts();
    const height = rng.range(7, 9.5);
    post(parts.part('prop.signpost.post', 'wood'), frame, 0, 0, height, 1.4);
    beam(parts.part('prop.signpost.plate', 'wood'), frame, {
      from: [-2.6, 0, height - 1.6],
      to: [2.6, 0, height - 1.2],
      width: 1.2,
      height: 2.2,
    });
    return parts.build();
  },
};

export const haystack: PropDef = {
  id: 'haystack',
  footprint: 3.6,
  height: 8,
  budget: 60,
  build(ctx) {
    const rng = ctx.rng;
    const b = new MeshBuilder();
    const radius = rng.range(2.6, 3.4);
    lathe(b, baseFrame(ctx), {
      profile: [
        { r: radius, z: 0 },
        { r: radius * 0.82, z: rng.range(2.5, 3.5) },
        { r: 0, z: rng.range(6.5, 8.5) },
      ],
      sides: 6,
      phase: rng.range(0, Math.PI / 3),
    });
    // Straw shares the crops' colour, not the trees'. See cropRow.
    return [b.build('prop.haystack', 'blossom')];
  },
};

export const BUILT = {
  bench,
  picnicTable,
  lamp,
  fence,
  hut,
  cabin,
  barn,
  tent,
  dock,
  rowboat,
  well,
  signpost,
  haystack,
};










