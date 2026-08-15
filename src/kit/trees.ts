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

/** How far a branch's root is pushed back inside its parent, so its cap is buried. */
const ROOT_SINK = 1.2;

interface TrunkSpec {
  radius: number;
  height: number;
  taper: number;
}

function trunk(ctx: PropContext, spec: TrunkSpec, name: string): Solid {
  const b = new MeshBuilder();
  lathe(b, baseFrame(ctx), {
    profile: [
      { r: spec.radius, z: 0 },
      { r: spec.radius * spec.taper, z: spec.height },
    ],
    sides: 4,
    phase: ctx.rng.range(0, Math.PI / 2),
  });
  return b.build(name, 'wood');
}

/** Trunk radius at a height, and the largest cross-section that fits inside it there. */
function trunkRadiusAt(spec: TrunkSpec, z: number): number {
  const t = Math.min(1, Math.max(0, z / spec.height));
  return spec.radius * (1 - t) + spec.radius * spec.taper * t;
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
  const spec: TrunkSpec = { radius: material === 'blossom' ? 1.4 : 1.3, height: stem, taper: 0.78 };

  const attach = stem * 0.72;
  const b = new MeshBuilder();
  lathe(b, baseFrame(ctx), {
    profile: crown(
      // Start no wider than the trunk's inscribed radius at that height, so the crown's
      // underside is entirely buried in the trunk.
      trunkRadiusAt(spec, attach) * Math.cos(Math.PI / 4),
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
        { r: 1.6, z: 0 },
        { r: 1.2, z: height },
      ],
      sides: 5,
      phase: rng.range(0, Math.PI * 2),
    });

    // A thickened crown, so the fronds have something wide enough to root inside.
    const bossFoot: ProfileRing = { r: 1.0, z: height - 2.2 };
    const bossBrow = flareTo(bossFoot, 2.4);
    lathe(parts.part('prop.palm.crown', 'wood'), frame, {
      profile: [bossFoot, bossBrow, { r: 2.0, z: bossBrow.z + 1.0 }, { r: 0, z: bossBrow.z + 1.9 }],
      sides: 5,
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
    for (let i = 0; i < count; i++) {
      const angle = phase + (i / count) * Math.PI * 2;
      const length = rng.range(6.5, 8.5);
      beam(parts.part(`prop.palm.frond.${i}`, 'foliage'), frame, {
        from: [
          -Math.cos(angle) * reach * ROOT_SINK,
          -Math.sin(angle) * reach * ROOT_SINK,
          root - rise * ROOT_SINK,
        ],
        to: [
          Math.cos(angle) * reach * length,
          Math.sin(angle) * reach * length,
          root + rise * length,
        ],
        width: 1.4,
        height: 1.1,
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
    // Wide enough, with enough sides, that a branch rooted ROOT_SINK back along its own
    // axis still has its base cap inside the trunk's *inscribed* radius. A four-sided
    // trunk only inscribes 0.71 r, which is not enough to swallow a 1.1 mm branch.
    const spec: TrunkSpec = { radius: 2.0, height, taper: 0.7 };

    const parts = new Parts();
    lathe(parts.part('prop.bare.trunk', 'wood'), frame, {
      profile: [
        { r: spec.radius, z: 0 },
        { r: spec.radius * spec.taper, z: height },
      ],
      sides: 5,
      phase: rng.range(0, Math.PI * 2),
    });

    const count = rng.int(4, 5);
    const phase = rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const angle = phase + (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
      // 55° above horizontal keeps every branch underside inside the 45° limit.
      const elevation = rng.range(54, 64) * (Math.PI / 180);
      const length = rng.range(3.5, 5.5);
      const start = height * rng.range(0.45, 0.7);
      const dx = Math.cos(angle) * Math.cos(elevation);
      const dy = Math.sin(angle) * Math.cos(elevation);
      const dz = Math.sin(elevation);
      beam(parts.part(`prop.bare.branch.${i}`, 'wood'), frame, {
        from: [-dx * ROOT_SINK, -dy * ROOT_SINK, start - dz * ROOT_SINK],
        to: [dx * length, dy * length, start + dz * length],
        width: 1.1,
        height: 1.1,
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
  footprint: 2.1,
  height: 10,
  budget: 40,
  build(ctx) {
    const rng = ctx.rng;
    const b = new MeshBuilder();
    lathe(b, baseFrame(ctx), {
      profile: [
        { r: rng.range(1.4, 1.9), z: 0 },
        { r: 0, z: rng.range(8, 11) },
      ],
      sides: 5,
      phase: rng.range(0, Math.PI * 2),
    });
    return [b.build('prop.sapling', 'foliage')];
  },
};

export const TREES = { conifer, blossom, roundCrown, palm, bare, stump, sapling };



