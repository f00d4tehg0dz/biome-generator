// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { describe, expect, it } from 'vitest';
import { PROPS, PROP_IDS, propRadius, type PropId } from './index';
import { soloContext } from './prop';
import { makeRng } from '../core/rng';
import {
  boundsOf,
  EMBED,
  MAX_BRIDGE,
  MAX_CANTILEVER,
  MIN_FEATURE,
  triangleCount,
  type Solid,
} from './solid';
import { checkSolid } from '../check/manifold';
import { checkPropOverhang } from '../check/overhang';
import { checkFeatures } from '../check/features';
import { checkFloating } from '../check/enclosure';

const SEEDS = Array.from({ length: 12 }, (_, i) => `p${i}`);

function buildAll(id: PropId): { seed: string; solids: Solid[] }[] {
  return SEEDS.map((seed) => ({
    seed,
    solids: PROPS[id].build(soloContext(makeRng(id, seed))),
  }));
}

function eachProp(fn: (id: PropId, solids: Solid[], seed: string) => void) {
  for (const id of PROP_IDS) {
    for (const { seed, solids } of buildAll(id)) fn(id, solids, seed);
  }
}

describe('kit registry', () => {
  it('registers every prop under its own id', () => {
    for (const id of PROP_IDS) expect(PROPS[id].id).toBe(id);
  });

  it('covers the catalogue', () => {
    // Guards against a builder being written but never wired into the registry.
    expect(PROP_IDS.length).toBeGreaterThanOrEqual(30);
  });
});

describe('every prop', () => {
  it('produces at least one solid', () => {
    eachProp((id, solids) => {
      expect(solids.length, id).toBeGreaterThan(0);
    });
  });

  it('is watertight with consistent winding', () => {
    eachProp((id, solids, seed) => {
      for (const solid of solids) {
        const report = checkSolid(solid);
        expect(
          report.ok,
          `${id}/${seed} ${solid.name}: ${report.issues.map((i) => i.detail).join('; ')}`,
        ).toBe(true);
      }
    });
  });

  it('never overhangs past 45°, except for short cantilevers and declared bridges', () => {
    eachProp((id, solids, seed) => {
      const report = checkPropOverhang(solids, { baseZ: -EMBED });
      if (report.ok) return;

      const where =
        `${id}/${seed}: ${report.solid} (nz=${report.worstNormalZ.toFixed(3)}, ` +
        `${report.offending} faces, ${report.area.toFixed(2)} mm²)`;

      // A protrusion held at one end prints unaided at this length, whatever the prop.
      expect(report.cantilever, `${where} cantilever`).toBeLessThanOrEqual(MAX_CANTILEVER);

      // A genuine span, held at both ends, only belongs in a prop that declares it.
      if (report.span > 0) {
        expect(PROPS[id].bridges, `${where} bridges`).toBe(true);
        expect(report.span, `${where} span`).toBeLessThanOrEqual(MAX_BRIDGE);
      }
    });
  });

  it('has nothing floating, every solid rests on the ground or embeds in a sibling', () => {
    eachProp((id, solids, seed) => {
      const report = checkFloating(solids, -EMBED);
      expect(report.ok, `${id}/${seed}: floating ${report.floating.join(', ')}`).toBe(true);
    });
  });

  it('is still attached once scatter has turned it', () => {
    // Every prop on a tile is rotated; every prop in the tests above is not. A bench seat
    // that reads as attached at 0° and floating at 0.3 rad is the check being fooled by an
    // axis-aligned sample grid, and it fooled this one.
    for (const id of PROP_IDS) {
      for (const rotation of [0.3, Math.PI / 4, 1.2, 2.6]) {
        const solids = PROPS[id].build(soloContext(makeRng(id, 'turned'), { rotation }));
        const report = checkFloating(solids, -EMBED);
        expect(report.ok, `${id} at ${rotation}: floating ${report.floating.join(', ')}`).toBe(
          true,
        );
      }
    }
  });

  it('clears the minimum feature size', () => {
    eachProp((id, solids, seed) => {
      const report = checkFeatures(solids, MIN_FEATURE);
      expect(
        report.ok,
        `${id}/${seed}: ${report.violations.map((v) => `${v.name} ${v.smallest.toFixed(2)}mm`).join(', ')}`,
      ).toBe(true);
    });
  });

  it('stays inside its triangle budget', () => {
    eachProp((id, solids, seed) => {
      expect(triangleCount(solids), `${id}/${seed}`).toBeLessThanOrEqual(PROPS[id].budget);
    });
  });

  it('sits on the surface, sunk at least one nozzle width', () => {
    eachProp((id, solids, seed) => {
      const { min } = boundsOf(solids);
      // A tilted beam's end cap is perpendicular to its axis, so a leaning trunk dips a
      // fraction below the embed plane. Deeper is harmless; shallower would leave a gap.
      expect(min[2], `${id}/${seed} floats`).toBeLessThanOrEqual(-EMBED + 1e-6);
      expect(min[2], `${id}/${seed} sunk too far`).toBeGreaterThan(-EMBED - 1.5);
    });
  });

  it('declares a footprint that matches what it actually builds', () => {
    // Scatter measures rather than trusting this, but a declaration that drifts is a
    // catalogue that lies, and it was a stale one (a 13.6 mm fence declaring 9) that first
    // put a prop over the tile edge.
    for (const id of PROP_IDS) {
      const declared = PROPS[id].footprint;
      const measured = propRadius(id);
      expect(measured, `${id} reaches further than declared`).toBeLessThanOrEqual(declared + 1e-6);
      expect(declared, `${id} declares far more than it uses`).toBeLessThan(measured * 1.3 + 0.5);
    }
  });

  it('stays within its declared height', () => {
    eachProp((id, solids, seed) => {
      const { max } = boundsOf(solids);
      expect(max[2], `${id}/${seed} height`).toBeLessThanOrEqual(PROPS[id].height * 1.5);
    });
  });
});

describe('placement', () => {
  it('bakes position, rotation and scale into the vertices', () => {
    for (const id of PROP_IDS) {
      const placed = PROPS[id].build(
        soloContext(makeRng(id, 'placed'), { at: [12, -7], surfaceZ: 15, rotation: 1.1, scale: 0.6 }),
      );
      const { min, max } = boundsOf(placed);
      // EMBED is an absolute nozzle width, so the sink depth does not scale with the prop.
      expect(min[2], `${id} base`).toBeLessThanOrEqual(15 - EMBED + 1e-6);
      // Centre of the footprint should follow the attachment point.
      expect((min[0]! + max[0]!) / 2, `${id} x`).toBeGreaterThan(4);
      expect((min[1]! + max[1]!) / 2, `${id} y`).toBeLessThan(0);
    }
  });

  it('scales uniformly, so overhang angles are unchanged', () => {
    for (const id of PROP_IDS) {
      const full = boundsOf(PROPS[id].build(soloContext(makeRng(id, 'scale'))));
      const half = boundsOf(PROPS[id].build(soloContext(makeRng(id, 'scale'), { scale: 0.5 })));
      const ratio = (max: number[], min: number[]) => [
        max[0]! - min[0]!,
        max[1]! - min[1]!,
        max[2]! - min[2]!,
      ];
      const a = ratio(full.max, full.min);
      const b = ratio(half.max, half.min);
      for (let axis = 0; axis < 3; axis++) {
        expect(b[axis]! / a[axis]!, `${id} axis ${axis}`).toBeCloseTo(0.5, 2);
      }
    }
  });

  it('is deterministic for the same seed', () => {
    for (const id of PROP_IDS) {
      const a = PROPS[id].build(soloContext(makeRng(id, 'same')));
      const b = PROPS[id].build(soloContext(makeRng(id, 'same')));
      expect(a.map((s) => s.name)).toEqual(b.map((s) => s.name));
      for (let i = 0; i < a.length; i++) {
        expect(Array.from(a[i]!.geometry.getAttribute('position').array)).toEqual(
          Array.from(b[i]!.geometry.getAttribute('position').array),
        );
      }
    }
  });
});
