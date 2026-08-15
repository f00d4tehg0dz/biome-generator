// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The per-colour STL bundle: the path that always works.
 *
 * One binary STL per filament, all sharing a single origin, plus a README saying what to do
 * with them. No format negotiation, no vendor metadata, no spec interpretation. Every
 * slicer ever written reads binary STL, and "import these together, answer yes when asked
 * whether they are one object" is a two-line instruction.
 *
 * This ships alongside the 3MF, always. The 3MF is better when it works; this is the one
 * that cannot not work.
 */

import { zipSync, strToU8 } from 'fflate';
import { writeBinaryStl } from './stl';
import type { ColourGroup } from './threemf';

export interface BundleOptions {
  seed: string;
  biomes: string[];
  colourCount: number;
  connectors: string;
  /** One entry per plate, each a list of tile descriptions. */
  plates: string[][];
  printer: string;
}

export function writeStlBundle(
  groups: readonly ColourGroup[],
  options: BundleOptions,
): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  groups.forEach((group, index) => {
    const slug = group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const hex = group.colour.replace('#', '').toUpperCase();
    files[`${index + 1}_${slug}_${hex}.stl`] = writeBinaryStl(
      group.solids,
      `biome-generator ${group.name}`,
    );
  });

  files['README.txt'] = strToU8(readme(groups, options));
  return zipSync(files, { level: 6 });
}

function readme(groups: readonly ColourGroup[], options: BundleOptions): string {
  const swatches = groups
    .map((group, index) => `  ${index + 1}. ${group.name.padEnd(18)} ${group.colour.toUpperCase()}`)
    .join('\n');

  const plates = options.plates
    .map((tiles, index) => `  Plate ${index + 1}: ${tiles.join(', ')}`)
    .join('\n');

  return `Biome Generator: printable tiles
=================================

Seed        ${options.seed}
Biomes      ${options.biomes.join(', ')}
Colours     ${options.colourCount}
Connectors  ${options.connectors}
Printer     ${options.printer}

How to print
------------
Import all ${groups.length} STL${groups.length === 1 ? '' : 's'} at once. When your slicer asks
whether they are parts of a single object, answer YES. They are already aligned to a common
origin. Then assign a filament to each part, in this order:

${swatches}

The filenames carry the same index and colour, so the mapping survives losing this file.

Plates
------
${plates}

Notes
-----
* Everything is modelled in millimetres, sitting on the bed, and needs no scaling or
  rotation. If your slicer offers to fix or re-orient the mesh, it does not need to.
* No supports. Every overhang is under 45 degrees by construction; the one exception is a
  handful of short bridges (bench seats, fence rails, dock decks) that FDM spans cleanly.
* ${
    options.connectors === 'dovetail'
      ? 'Tiles join with printed dovetails: no glue, no hardware. Three edges of each tile carry a tab and three a slot, so any two tiles mate.'
      : 'Connectors are switched off, so tiles simply butt together.'
  }
* Matte filament suits this better than gloss: the art direction has no specular highlights
  in it at all.
`;
}
