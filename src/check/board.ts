// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The print check, as the panel shows it.
 *
 * Everything here already existed as a gate on the kit and the generators; this runs those
 * gates against the board actually on screen and phrases the answer. Which is worth doing,
 * because the kit tests check a prop standing on its own pad and this checks the same prop
 * sunk into a terrace, beside a path, next to a hut, where a face that was buried in the
 * test is exposed, or the other way round.
 *
 * One check lives elsewhere: plate fit is a property of the printer rather than of the
 * geometry, and `layoutPlates` already answers it.
 */

import type { Board } from '../gen/board';
import { MAX_OVERHANG_ANGLE, MIN_FEATURE, triangleCount, type Solid } from '../kit/solid';
import { checkFloating } from './enclosure';
import { checkFeatures, type FeatureViolation } from './features';
import { checkSolid } from './manifold';
import { overhangBySolid, type SolidOverhang } from './overhang';

export type Severity = 'pass' | 'warn' | 'fail';

export type CheckId = 'manifold' | 'overhang' | 'features' | 'floating';

export interface CheckSection {
  id: CheckId;
  label: string;
  severity: Severity;
  /** One line, in the terms the printer cares about. */
  summary: string;
  /** Names of the solids at fault, capped. The full count is in the summary. */
  offenders: string[];
}

export interface PrintCheck {
  ok: boolean;
  sections: CheckSection[];
  solids: number;
  triangles: number;
}

/** How many names a section lists before it stops naming them. */
const MAX_OFFENDERS = 5;

/**
 * Checks every tile on the board and reports the totals.
 *
 * Tile by tile rather than all at once, because the enclosure tests ask what a face is
 * buried in, and across the whole board that question would include a neighbour's hillside,
 * which is not what gets printed. Tiles are separate objects on the plate.
 */
export function checkBoard(board: Board): PrintCheck {
  return phrase(board.tiles.map((placed) => tally(placed.tile.solids)).reduce(combine, EMPTY));
}

/** The same check against one loose set of solids: a single tile, or a plate. */
export function checkSolids(solids: readonly Solid[]): PrintCheck {
  return phrase(tally(solids));
}

interface Tally {
  solids: number;
  triangles: number;
  /** Solids that are not closed manifolds. */
  broken: string[];
  /** Solids carrying downward faces that nothing else buries. */
  exposed: SolidOverhang[];
  thin: FeatureViolation[];
  floating: string[];
}

const EMPTY: Tally = {
  solids: 0,
  triangles: 0,
  broken: [],
  exposed: [],
  thin: [],
  floating: [],
};

function tally(solids: readonly Solid[]): Tally {
  // pointInSolid rejects on the bounding box first, and the enclosure tests below run it
  // thousands of times. Without this they are quadratic in triangles.
  for (const solid of solids) solid.geometry.computeBoundingBox();

  return {
    solids: solids.length,
    triangles: triangleCount(solids),
    broken: solids.filter((solid) => !checkSolid(solid).ok).map((solid) => solid.name),
    exposed: overhangBySolid(solids, { maxAngle: MAX_OVERHANG_ANGLE }),
    thin: checkFeatures(solids, MIN_FEATURE).violations,
    floating: checkFloating(solids).floating,
  };
}

function combine(a: Tally, b: Tally): Tally {
  return {
    solids: a.solids + b.solids,
    triangles: a.triangles + b.triangles,
    broken: [...a.broken, ...b.broken],
    exposed: [...a.exposed, ...b.exposed],
    thin: [...a.thin, ...b.thin],
    floating: [...a.floating, ...b.floating],
  };
}

function phrase(tally: Tally): PrintCheck {
  const sections: CheckSection[] = [
    {
      id: 'manifold',
      label: 'Watertight',
      severity: tally.broken.length === 0 ? 'pass' : 'fail',
      summary:
        tally.broken.length === 0
          ? `${count(tally.solids, 'solid')} closed and wound consistently`
          : `${tally.broken.length} of ${tally.solids} solids are not closed`,
      offenders: names(tally.broken),
    },
    overhangSection(tally),
    {
      id: 'features',
      label: `${MIN_FEATURE} mm features`,
      severity: tally.thin.length === 0 ? 'pass' : 'warn',
      summary:
        tally.thin.length === 0
          ? `Nothing thinner than ${MIN_FEATURE} mm`
          : `${count(tally.thin.length, 'solid')} under ${MIN_FEATURE} mm, thinnest ${thinnest(tally.thin)} mm`,
      offenders: names(tally.thin.map((violation) => violation.name)),
    },
    {
      id: 'floating',
      label: 'Attachment',
      severity: tally.floating.length === 0 ? 'pass' : 'fail',
      summary:
        tally.floating.length === 0
          ? 'Every solid reaches the bed or embeds in another'
          : `${count(tally.floating.length, 'solid')} rest on nothing`,
      offenders: names(tally.floating),
    },
  ];

  return {
    ok: sections.every((section) => section.severity !== 'fail'),
    sections,
    solids: tally.solids,
    triangles: tally.triangles,
  };
}

/**
 * Downward faces past the 45° limit, ignoring any buried inside another solid.
 *
 * Which of the two verdicts an exposed face earns depends on what it belongs to. A prop's
 * exposed faces are the short reaches the kit is allowed (a bench seat between its legs, a
 * signpost's plate) and the kit tests hold each of them to MAX_BRIDGE and MAX_CANTILEVER on
 * its own pad, where a span can be measured meaningfully. Tile geometry gets no such
 * allowance: terraces step inward, cliffs are cut back, connectors print off the bed, and
 * nothing else gates them, so an overhang there is this check's to catch.
 */
function overhangSection(tally: Tally): CheckSection {
  const label = `${MAX_OVERHANG_ANGLE}° overhang`;
  const ground = tally.exposed.filter((entry) => entry.name.startsWith('tile.'));

  if (ground.length > 0) {
    // Per tile the list arrives worst-first, but a board's tiles are concatenated, so the
    // flattest face has to be picked rather than read off the front.
    const worst = ground.reduce((a, b) => (b.worstNormalZ < a.worstNormalZ ? b : a));
    return {
      id: 'overhang',
      label,
      severity: 'fail',
      summary: `${count(ground.length, 'tile surface')} overhanging, flattest ${fromHorizontal(worst.worstNormalZ)}° from horizontal`,
      offenders: names(ground.map((entry) => entry.name)),
    };
  }

  return {
    id: 'overhang',
    label,
    severity: tally.exposed.length === 0 ? 'pass' : 'warn',
    summary:
      tally.exposed.length === 0
        ? 'No face needs support'
        : `${count(tally.exposed.length, 'prop part')} reaching unaided, each within the kit's span limits`,
    offenders: names(tally.exposed.map((entry) => entry.name)),
  };
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Distinct, capped: a board repeats the same prop dozens of times. */
function names(all: readonly string[]): string[] {
  return [...new Set(all)].slice(0, MAX_OFFENDERS);
}

function thinnest(violations: readonly FeatureViolation[]): string {
  return Math.min(...violations.map((violation) => violation.smallest)).toFixed(2);
}

/**
 * A downward normal's z as the face's inclination from horizontal, the convention the
 * whole project is written against (MAX_OVERHANG_ANGLE), where a ceiling is 0° and a wall
 * is 90°. Slicers usually quote the complement, so the number is always labelled.
 */
function fromHorizontal(normalZ: number): string {
  return (Math.acos(Math.min(1, -normalZ)) * (180 / Math.PI)).toFixed(0);
}
