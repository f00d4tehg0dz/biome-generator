// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Overhang analysis against the 45° rule.
 *
 * Angles here are measured from *horizontal*, the way the rest of the project states the
 * rule: a downward face lying flat is 0°, a vertical wall is 90°, and anything shallower
 * than 45° needs support. In terms of the normal that is `normal.z < -cos(45°)`. Slicers
 * usually quote the complement, so any angle shown to a user says which it is.
 *
 * Two exemptions, both real rather than convenient:
 *  - Faces at or below `baseZ` rest on the print bed or are buried in a host solid.
 *  - A short downward face is a *bridge*, not an overhang. FDM bridges cleanly well past
 *    the span this project ever uses, so the report measures the span and lets the caller
 *    decide (see MAX_BRIDGE).
 */

import type { BufferAttribute, InterleavedBufferAttribute } from 'three';
import type { Solid } from '../kit/solid';
import { barycentric, insideAny, insideAnyOther } from './enclosure';

export interface OverhangOptions {
  /** Height below which downward faces are supported by the bed or a host. */
  baseZ?: number;
  /** Shallowest face angle from horizontal that still prints unsupported. */
  maxAngle?: number;
  /** Height slack when comparing against `baseZ`. */
  tolerance?: number;
}

export interface OverhangReport {
  ok: boolean;
  /** Triangles overhanging past the limit, excluding the exemptions above. */
  offending: number;
  /** Total area of those triangles, in mm². */
  area: number;
  /** Steepest offending normal.z found (−1 is a flat ceiling). */
  worstNormalZ: number;
  /**
   * Longest unsupported run held at *both* ends, in millimetres: a bridge. Compare against
   * MAX_BRIDGE.
   */
  span: number;
  /**
   * Longest unsupported run held at *one* end, in millimetres: a cantilever, like a
   * signpost's plate or a roof eave. Compare against MAX_CANTILEVER.
   */
  cantilever: number;
}

const DEFAULTS = { baseZ: 0, maxAngle: 45, tolerance: 0.05 };

export interface PropOverhangReport extends OverhangReport {
  /** Which solid the worst offending face belongs to. */
  solid: string | null;
}

/** Exposed overhang on one solid, once faces buried in its siblings are discounted. */
export interface SolidOverhang {
  name: string;
  offending: number;
  area: number;
  worstNormalZ: number;
}

/**
 * Overhang check across a whole prop, skipping faces that are buried inside a sibling
 * solid. Those faces are not part of the printed surface, so they need no support. See
 * check/enclosure.ts for why this is tested rather than assumed.
 */
export function checkPropOverhang(
  solids: readonly Solid[],
  options: OverhangOptions = {},
): PropOverhangReport {
  const { exposed, faces } = exposedOverhangs(solids, options);

  let offending = 0;
  let area = 0;
  let worstNormalZ = 0;
  let worstSolid: string | null = null;

  for (const solid of exposed) {
    offending += solid.offending;
    area += solid.area;
    if (solid.worstNormalZ < worstNormalZ) {
      worstNormalZ = solid.worstNormalZ;
      worstSolid = solid.name;
    }
  }

  const runs = unsupportedRun(solids, faces);
  return {
    ok: offending === 0,
    offending,
    area,
    worstNormalZ,
    span: runs.bridge,
    cantilever: runs.cantilever,
    solid: worstSolid,
  };
}

/**
 * Which solids carry exposed overhang, worst first, without measuring how far it reaches.
 *
 * The span measurement is only meaningful for one prop at a time: it pools samples by row,
 * so two props standing in line on the same tile read as one enormous bridge across the gap
 * between them. It is also the expensive half of the analysis. A whole tile therefore asks
 * the cheap question, what is exposed, and leaves *how far it reaches* to the kit tests,
 * which put each prop on its own pad where the answer means something.
 */
export function overhangBySolid(
  solids: readonly Solid[],
  options: OverhangOptions = {},
): SolidOverhang[] {
  return exposedOverhangs(solids, options).exposed.sort((a, b) => a.worstNormalZ - b.worstNormalZ);
}

function exposedOverhangs(
  solids: readonly Solid[],
  options: OverhangOptions,
): { exposed: SolidOverhang[]; faces: FaceBox[] } {
  const { baseZ, maxAngle, tolerance } = { ...DEFAULTS, ...options };
  const limit = -Math.cos((maxAngle * Math.PI) / 180);

  const exposed: SolidOverhang[] = [];
  const faces: FaceBox[] = [];

  for (let s = 0; s < solids.length; s++) {
    const solid = solids[s]!;
    const position = solid.geometry.getAttribute('position');
    const index = solid.geometry.getIndex();
    if (!index) continue;

    const entry: SolidOverhang = { name: solid.name, offending: 0, area: 0, worstNormalZ: 0 };

    for (let t = 0; t < index.count / 3; t++) {
      const a = index.getX(t * 3);
      const b = index.getX(t * 3 + 1);
      const c = index.getX(t * 3 + 2);

      const top = Math.max(position.getZ(a), position.getZ(b), position.getZ(c));
      if (top <= baseZ + tolerance) continue;

      const normal = faceNormal(position, a, b, c);
      if (!normal) continue;
      if (normal[2] >= limit - 1e-4) continue;

      // Buried in a sibling? Then it is interior, not a ceiling.
      const centre: [number, number, number] = [
        (position.getX(a) + position.getX(b) + position.getX(c)) / 3,
        (position.getY(a) + position.getY(b) + position.getY(c)) / 3,
        (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3 - 0.05,
      ];
      if (insideAnyOther(solids, s, centre)) continue;

      entry.offending++;
      entry.area += normal[3];
      entry.worstNormalZ = Math.min(entry.worstNormalZ, normal[2]);
      faces.push([
        [position.getX(a), position.getY(a), position.getZ(a)],
        [position.getX(b), position.getY(b), position.getZ(b)],
        [position.getX(c), position.getY(c), position.getZ(c)],
      ]);
    }

    if (entry.offending > 0) exposed.push(entry);
  }

  return { exposed, faces };
}

type Point3 = [number, number, number];
type FaceBox = [Point3, Point3, Point3];

/** Sampling step for the span measurement, in millimetres. */
const SAMPLE_STEP = 0.6;
/** How far below a face to look for something holding it up. */
const PROBE_DEPTH = 0.3;

/**
 * Longest run with nothing underneath it: the distance the printer actually has to bridge.
 *
 * Face granularity is not enough to measure this. A fence rail's underside is a single quad
 * spanning every post it crosses, so no per-face test can tell that most of it is supported;
 * taking the bounding box of the offending faces reports one 17 mm bridge where the real
 * spans are the ~7 mm gaps between posts. So this samples the underside on a grid and asks,
 * at each sample, whether any solid sits just below it.
 */
function unsupportedRun(solids: readonly Solid[], faces: readonly FaceBox[]): UnsupportedRuns {
  if (faces.length === 0) return { bridge: 0, cantilever: 0 };

  const rows = new Map<number, Sample[]>();
  const columns = new Map<number, Sample[]>();

  for (const [a, b, c] of faces) {
    const minX = Math.min(a[0], b[0], c[0]);
    const maxX = Math.max(a[0], b[0], c[0]);
    const minY = Math.min(a[1], b[1], c[1]);
    const maxY = Math.max(a[1], b[1], c[1]);

    for (let x = minX; x <= maxX + 1e-9; x += SAMPLE_STEP) {
      for (let y = minY; y <= maxY + 1e-9; y += SAMPLE_STEP) {
        const bary = barycentric(a, b, c, x, y);
        if (!bary) continue;
        const z = bary[0] * a[2] + bary[1] * b[2] + bary[2] * c[2];
        const supported = insideAny(solids, [x, y, z - PROBE_DEPTH]);

        push(rows, Math.round(y / SAMPLE_STEP), { at: x, supported });
        push(columns, Math.round(x / SAMPLE_STEP), { at: y, supported });
      }
    }
  }

  const byRow = longestRuns(rows);
  const byColumn = longestRuns(columns);
  return {
    bridge: Math.max(byRow.bridge, byColumn.bridge),
    cantilever: Math.max(byRow.cantilever, byColumn.cantilever),
  };
}

interface Sample {
  at: number;
  supported: boolean;
}

export interface UnsupportedRuns {
  bridge: number;
  cantilever: number;
}

function push(map: Map<number, Sample[]>, key: number, sample: Sample): void {
  const list = map.get(key);
  if (list) list.push(sample);
  else map.set(key, [sample]);
}

/**
 * Splits unsupported runs into bridges (held at both ends) and cantilevers (held at one).
 *
 * The distinction is what picks the right axis without being told which one matters. A dock
 * deck has nothing under it along its whole 18 mm length, but it is held at both sides
 * across its 3 mm width, so 3 mm is what actually gets bridged, and the 18 mm run scores
 * nothing because that line never meets support at all. A signpost's plate, by contrast,
 * meets support on one side only: a 2 mm cantilever, which prints without help.
 */
function longestRuns(lines: Map<number, Sample[]>): UnsupportedRuns {
  let bridge = 0;
  let cantilever = 0;

  for (const samples of lines.values()) {
    const sorted = [...samples].sort((a, b) => a.at - b.at);
    if (!sorted.some((sample) => sample.supported)) continue; // held from another direction

    let seenSupport = false;
    let runStart: number | null = null;
    let runEnd = 0;

    for (const sample of sorted) {
      if (sample.supported) {
        // Closed by support on both sides: a bridge. A run before any support at all is a
        // leading cantilever.
        if (runStart !== null) {
          const length = runEnd - runStart;
          if (seenSupport) bridge = Math.max(bridge, length);
          else cantilever = Math.max(cantilever, length);
        }
        seenSupport = true;
        runStart = null;
        continue;
      }
      if (runStart === null) runStart = sample.at;
      runEnd = sample.at;
    }
    // Anything still open at the end never met support on its far side.
    if (runStart !== null) cantilever = Math.max(cantilever, runEnd - runStart);
  }

  return { bridge, cantilever };
}

type PositionAttribute = BufferAttribute | InterleavedBufferAttribute;

/** Returns [nx, ny, nz, area], or null for a degenerate triangle. */
function faceNormal(
  position: PositionAttribute,
  a: number,
  b: number,
  c: number,
): [number, number, number, number] | null {
  const ux = position.getX(b) - position.getX(a);
  const uy = position.getY(b) - position.getY(a);
  const uz = position.getZ(b) - position.getZ(a);
  const vx = position.getX(c) - position.getX(a);
  const vy = position.getY(c) - position.getY(a);
  const vz = position.getZ(c) - position.getZ(a);
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-12) return null;
  return [nx / length, ny / length, nz / length, length / 2];
}
