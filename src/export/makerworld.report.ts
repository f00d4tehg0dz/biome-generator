// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Builds the file set for the MakerWorld listing.
 *
 * Run with `npx vite-node src/export/makerworld.report.ts -- <outputDir>`.
 *
 * The listing has one job the generator cannot do for it: give someone something to print in
 * the next ten minutes, without opening a web app. So the set is small, opinionated and
 * pre-named — a starter board that shows what a connected world looks like, one tile of each
 * biome so anyone can print just the one they want, and a single-colour fallback for printers
 * without a filament changer.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateBoard, singleTile, type BoardPlan } from '../gen/board';
import { BIOMES, BIOME_IDS, type BiomeId } from '../gen/biomes';
import { hexKey, hexSpiral } from '../core/hex';
import { exportBoard, PRINTERS } from './index';

const out = process.argv[2] ?? './makerworld';
mkdirSync(out, { recursive: true });

const R = 50;
const SEED = 'starter';
const p1x1 = PRINTERS.find((p) => p.id === 'p1x1')!;

/** A meadow in the middle with a different neighbour on every side. */
const RING: BiomeId[] = ['meadow', 'forest', 'lake', 'coast', 'desert', 'village', 'alpine'];

const plan: BoardPlan = {};
hexSpiral(1).forEach((coord, i) => {
  plan[hexKey(coord)] = RING[i]!;
});

const written: { name: string; kb: number }[] = [];

function write(name: string, data: Uint8Array) {
  writeFileSync(join(out, name), data);
  written.push({ name, kb: data.byteLength / 1024 });
}

// 1. The starter board: seven tiles that meet at every seam.
const board = generateBoard({ seed: SEED, R, connectors: 'dovetail', plan });
console.log(`starter board: ${board.tiles.length} tiles, ${board.triangles} triangles`);

for (const [format, label] of [
  ['3mf', '4-colour'],
  ['stl', 'single-colour'],
] as const) {
  const files = exportBoard({
    board,
    paletteBiome: 'meadow',
    colourCount: format === '3mf' ? 4 : 1,
    printer: p1x1,
    seed: SEED,
    connectors: 'dovetail',
    format,
  });
  files.forEach((file, i) => {
    const plate = files.length > 1 ? `-plate-${i + 1}` : '';
    const extension = file.name.slice(file.name.lastIndexOf('.'));
    write(`01-starter-board-7-tiles-${label}${plate}${extension}`, file.data);
  });
}

// 2. One tile of every biome, so the listing works for someone who wants a single print.
for (const id of BIOME_IDS) {
  const tile = generateBoard({
    seed: `${id}-01`,
    R,
    connectors: 'dovetail',
    plan: singleTile(id),
  });
  const [file] = exportBoard({
    board: tile,
    paletteBiome: id,
    colourCount: 4,
    printer: p1x1,
    seed: id,
    connectors: 'dovetail',
    format: '3mf',
  });
  const slug = BIOMES[id].name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  write(`02-single-tile-${slug}-4-colour.3mf`, file!.data);
}

// 3. A plain-text note travelling with the files, for anyone who downloads the zip and never
//    reads the listing page.
const tallest = Math.max(...board.tiles.map((t) => t.tile.height));

// Deliberately plain ASCII. A .txt travels to strangers on unknown machines, and an em dash
// that arrives as a mojibake smudge costs more than it is worth.
const readme = `Biome Generator - printable hex terrain
https://biomegenerator.com

WHAT IS IN HERE
  01-starter-board-*   Seven tiles that connect: a meadow ringed by six other biomes.
                       The 4-colour .3mf files are for AMS / CFS. The single-colour .stl
                       prints the same board in one filament.
  02-single-tile-*     One tile of each of the ${BIOME_IDS.length} biomes, 4-colour.

PRINTING
  No supports. Nothing here overhangs past 45 degrees.
  Tile size        ${(R * Math.sqrt(3)).toFixed(0)} x ${R * 2} mm across the flats and corners
  Tile height      about 12 mm of base, up to ${tallest.toFixed(0)} mm with the tallest tree
  Layer height     0.2 mm
  Infill           10-15%
  Material         PLA. Any colours you like - the models carry roles, not colours.
  Orientation      As supplied. Everything sits flat on the bed already.

FILAMENT SLOTS (4-colour files)
  1  Ground    the top surface
  2  Soil      the band under it
  3  Feature   trees, water, rock
  4  Accent    blossom, snow, crops

CONNECTING TILES
  Every tile has three dovetail tabs and three sockets, so any edge mates with any other
  edge. They are sized for a 0.2 mm clearance; if your printer runs tight, scale the board
  by 100.5% or sand the tabs lightly.

MAKING YOUR OWN
  biomegenerator.com generates these in the browser. Pick a biome, roll a seed, click to
  add tiles, and export. Free, no account, open source (AGPL-3.0).
  Whatever you generate is yours - the licence covers the generator, not its output.
`;
// CRLF: this is read on Windows as often as not, and Notepad still shows LF as one long line.
write('README.txt', new TextEncoder().encode(readme.replace(/\n/g, '\r\n')));

console.log('');
for (const file of written) {
  console.log(`  ${file.name.padEnd(46)} ${file.kb.toFixed(1).padStart(7)} KB`);
}
console.log(`\n${written.length} files in ${out}`);
