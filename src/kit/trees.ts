// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Trees. See docs/biomes.md §3 for the catalogue and docs/art-direction.md §5 for why
 * these forms and not others.
 *
 * Two constraints shape everything here:
 *
 *  - **No canopy may be a sphere.** A sphere's underside is a 90° overhang. Cones and
 *    stepped domes give the same read and print without support.
 *  - **A canopy may never be wider than what it sits on.** Dropping a wide disc onto a thin
 *    trunk leaves an exposed downward ring, the most common way a low-poly tree becomes
 *    unprintable. Every crown here starts at the trunk's own radius and flares out at 45°.
 */

import { MeshBuilder, type Solid } from './solid';
import { beam, flareTo, lathe, type ProfileRing } from './primitives';
import { baseFrame, Parts, type PropContext, type PropDef } from './prop';

/**
 * How far a limb's root is pushed back inside its parent, so its base cap is buried.
 *
 * Scaled to the limb rather than fixed: the cap that has to disappear is as wide as the limb
 * is, so a thicker branch has to reach further in. At the old fixed 1.2 mm a 2.4 mm branch
 * would have left a corner of its base cap outside the trunk.
 */
function rootSink(thickness: number): number {
  return Math.max(1.2, thickness * 0.75);
}

interface TrunkSpec {
  radius: number;
  height: number;
  taper: number;
  sides: number;
}

function trunk(ctx: PropContext, spec: TrunkSpec, name: string): Solid {
  const b = new MeshBuilder();
  lathe(b, baseFrame(ctx), {
    profile: [
      { r: spec.radius, z: 0 },
      { r: spec.radius * spec.taper, z: spec.height },
    ],
    sides: spec.sides,
    phase: ctx.rng.range(0, (Math.PI * 2) / spec.sides),
  });
  return b.build(name, 'wood');
}

/** Trunk radius at a height. */
function trunkRadiusAt(spec: TrunkSpec, z: number): number {
  const t = Math.min(1, Math.max(0, z / spec.height));
  return spec.radius * (1 - t) + spec.radius * spec.taper * t;
}

/**
 * The largest radius that still fits *inside* the trunk at a height.
 *
 * A lathe's profile radius reaches its corners; between them the wall cuts in to
 * `r·cos(π/sides)`. Anything rooted in the trunk has to stay inside that smaller circle or a
 * sliver of its base cap sticks out through the flats as an exposed downward face.
 */
function trunkInsideAt(spec: TrunkSpec, z: number): number {
  return trunkRadiusAt(spec, z) * Math.cos(Math.PI / spec.sides);
}

export const conifer: PropDef = {
  id: 'conifer',
  footprint: 5.6,
  height: 26,
  budget: 90,
  build(ctx) {
    const rng = ctx.rng;
    const spread = rng.range(4.4, 5.4);
    const top = rng.range(23, 29);

    // The skirt reaches the ground rather than perching on a trunk, then flares out at 45°.
    // The shelf between the two tiers flares at 45° too; stacked cones would put a 90°
    // ceiling at every tier boundary.
    const foot: ProfileRing = { r: 1.7, z: 0 };
    const skirt = flareTo(foot, spread);
    const waist: ProfileRing = { r: spread * 0.66, z: Math.max(skirt.z + 3, top * 0.4) };
    const shoulder = flareTo(waist, spread * 0.9);

    const b = new MeshBuilder();
    lathe(b, baseFrame(ctx), {
      profile: [foot, skirt, waist, shoulder, { r: 0, z: top }],
      sides: 6,
      phase: rng.range(0, Math.PI / 3),
    });
    return [b.build('prop.conifer', 'foliage')];
  },
};

/**
 * Stepped dome starting at `footRadius`, which must be the radius of whatever it sits on,
 * rising at 45°, rounding over, and closing to a point.
 */
function crown(footRadius: number, radius: number, base: number, top: number): ProfileRing[] {
  const foot: ProfileRing = { r: footRadius, z: base };
  const shoulder = flareTo(foot, radius);
  const peak = Math.max(top, shoulder.z + 4);
  const brow: ProfileRing = { r: radius * 1.04, z: shoulder.z + (peak - shoulder.z) * 0.3 };
  return [
    foot,
    shoulder,
    brow,
    { r: radius * 0.84, z: brow.z + (peak - brow.z) * 0.42 },
    { r: radius * 0.46, z: peak - (peak - brow.z) * 0.16 },
    { r: 0, z: peak },
  ];
}

function crownedTree(ctx: PropContext, id: string, material: 'blossom' | 'foliage'): Solid[] {
  const rng = ctx.rng;
  const radius = material === 'blossom' ? rng.range(6, 7.6) : rng.range(5, 6.4);
  const stem = material === 'blossom' ? rng.range(7, 9) : rng.range(5, 6.5);

  // Six sides at this radius, not four at half of it. The four-sided trunk this replaces was
  // written `r: 1.3`, which is 1.84 mm flat to flat — and it was carrying a crown of over a
  // thousand cubic millimetres on a lever twenty millimetres long. They snapped off, and the
  // surprise is that any survived. See MIN_NECK.
  const spec: TrunkSpec = {
    radius: material === 'blossom' ? 2.6 : 2.4,
    height: stem,
    taper: 0.82,
    sides: 6,
  };

  const attach = stem * 0.72;
  const b = new MeshBuilder();
  lathe(b, baseFrame(ctx), {
    profile: crown(
      // Start no wider than the trunk's inside radius at that height, so the crown's
      // underside is entirely buried in the trunk.
      trunkInsideAt(spec, attach),
      radius,
      attach,
      material === 'blossom' ? rng.range(21, 27) : rng.range(16, 21),
    ),
    sides: 6,
    phase: rng.range(0, Math.PI / 3),
  });

  return [trunk(ctx, spec, `prop.${id}.trunk`), b.build(`prop.${id}.crown`, material)];
}

export const blossom: PropDef = {
  id: 'blossom',
  footprint: 8.1,
  height: 24,
  budget: 140,
  build: (ctx) => crownedTree(ctx, 'blossom', 'blossom'),
};

export const roundCrown: PropDef = {
  id: 'roundCrown',
  footprint: 6.9,
  height: 19,
  budget: 140,
  build: (ctx) => crownedTree(ctx, 'roundCrown', 'foliage'),
};

export const palm: PropDef = {
  id: 'palm',
  footprint: 5.7,
  height: 27,
  budget: 140,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const height = rng.range(12, 15);

    // The trunk is upright, not leaning. A leaning trunk moves its own axis away from the
    // crown's at every height, so nothing rooted at the top is reliably inside it and every
    // frond base becomes an exposed 50° ceiling. At this scale the lean reads as almost
    // nothing while costing exactly that; the fronds carry the silhouette.
    const parts = new Parts();
    lathe(parts.part('prop.palm.trunk', 'wood'), frame, {
      profile: [
        { r: 2.6, z: 0 },
        { r: 2.1, z: height },
      ],
      sides: 6,
      phase: rng.range(0, Math.PI * 2),
    });

    // A thickened crown, so the fronds have something wide enough to root inside. It has to
    // grow with them: the fronds below are more than twice the section they were.
    const bossFoot: ProfileRing = { r: 1.6, z: height - 2.2 };
    const bossBrow = flareTo(bossFoot, 3.4);
    lathe(parts.part('prop.palm.crown', 'wood'), frame, {
      profile: [bossFoot, bossBrow, { r: 2.8, z: bossBrow.z + 1.2 }, { r: 0, z: bossBrow.z + 2.2 }],
      sides: 6,
      phase: rng.range(0, Math.PI * 2),
    });

    // Fronds rise at 50° above horizontal (any droop puts their undersides past 45°) and
    // root back inside the crown so their base caps are buried, not exposed ceilings.
    // Adjacent fronds overlap near the root, so each is its own solid.
    const count = rng.int(5, 6);
    const phase = rng.range(0, Math.PI * 2);
    const rise = Math.sin((50 * Math.PI) / 180);
    const reach = Math.cos((50 * Math.PI) / 180);
    const root = bossBrow.z + 0.3;
    const FROND_WIDE = 2.8;
    const FROND_THICK = 2.2;
    const sink = rootSink(FROND_WIDE);
    for (let i = 0; i < count; i++) {
      const angle = phase + (i / count) * Math.PI * 2;
      // Shortened as they thickened. A frond is a cantilever, and what breaks one is the
      // ratio of its reach to its section, not either on its own.
      const length = rng.range(6, 7.5);
      beam(parts.part(`prop.palm.frond.${i}`, 'foliage'), frame, {
        from: [
          -Math.cos(angle) * reach * sink,
          -Math.sin(angle) * reach * sink,
          root - rise * sink,
        ],
        to: [
          Math.cos(angle) * reach * length,
          Math.sin(angle) * reach * length,
          root + rise * length,
        ],
        width: FROND_WIDE,
        height: FROND_THICK,
        taper: 0,
      });
    }

    return parts.build();
  },
};

export const bare: PropDef = {
  id: 'bare',
  footprint: 3.4,
  height: 18,
  budget: 140,
  build(ctx) {
    const rng = ctx.rng;
    const frame = baseFrame(ctx);
    const height = rng.range(10, 14);
    // The trunk is sized by what has to fit inside it, not by how it looks. A branch rooted
    // back along its own axis buries a base cap as wide as the branch, so the trunk's *inside*
    // radius where the branch meets it has to exceed that cap's half-diagonal. At the old
    // r 2.0 on five sides, a branch thick enough not to snap would not have fitted.
    const spec: TrunkSpec = { radius: 3.0, height, taper: 0.8, sides: 6 };
    const BRANCH = 2.4;
    const sink = rootSink(BRANCH);

    const parts = new Parts();
    lathe(parts.part('prop.bare.trunk', 'wood'), frame, {
      profile: [
        { r: spec.radius, z: 0 },
        { r: spec.radius * spec.taper, z: height },
      ],
      sides: spec.sides,
      phase: rng.range(0, Math.PI * 2),
    });

    const count = rng.int(4, 5);
    const phase = rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const angle = phase + (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
      // 55° above horizontal keeps every branch underside inside the 45° limit.
      const elevation = rng.range(54, 64) * (Math.PI / 180);
      const length = rng.range(3.5, 5);
      const start = height * rng.range(0.45, 0.7);
      const dx = Math.cos(angle) * Math.cos(elevation);
      const dy = Math.sin(angle) * Math.cos(elevation);
      const dz = Math.sin(elevation);
      beam(parts.part(`prop.bare.branch.${i}`, 'wood'), frame, {
        from: [-dx * sink, -dy * sink, start - dz * sink],
        to: [dx * length, dy * length, start + dz * length],
        width: BRANCH,
        height: BRANCH,
        taper: 0,
      });
    }

    return parts.build();
  },
};

export const stump: PropDef = {
  id: 'stump',
  footprint: 2.8,
  height: 4,
  budget: 40,
  build(ctx) {
    const rng = ctx.rng;
    const b = new MeshBuilder();
    lathe(b, baseFrame(ctx), {
      profile: [
        { r: rng.range(2.0, 2.6), z: 0 },
        { r: rng.range(1.7, 2.1), z: rng.range(2.8, 4.2) },
      ],
      sides: 5,
      phase: rng.range(0, Math.PI * 2),
    });
    return [b.build('prop.stump', 'wood')];
  },
};

export const sapling: PropDef = {
  id: 'sapling',
  footprint: 3.0,
  height: 10,
  budget: 40,
  build(ctx) {
    const rng = ctx.rng;
    const b = new MeshBuilder();
    // A cone is the one shape that gets thinner only where it is carrying less, so its tip
    // being fine is not a weakness. The base still has to hold the whole thing up, and at a
    // ninth of its height it was down to 2.16 mm — thin enough to fold over.
    lathe(b, baseFrame(ctx), {
      profile: [
        { r: rng.range(2.4, 2.9), z: 0 },
        { r: 0, z: rng.range(8, 11) },
      ],
      sides: 6,
      phase: rng.range(0, Math.PI * 2),
    });
    return [b.build('prop.sapling', 'foliage')];
  },
};

export const TREES = { conifer, blossom, roundCrown, palm, bare, stump, sapling };



