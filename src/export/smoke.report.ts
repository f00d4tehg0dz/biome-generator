// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Writes a real export to disk so the files can be opened in a slicer.
 * Run with `npx vite-node src/export/smoke.report.ts -- <outputDir>`.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateBoard, type BoardPlan } from '../gen/board';
import { hexKey, hexSpiral } from '../core/hex';
import { exportBoard, PRINTERS } from './index';
import type { ExportFormat } from './index';

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });

const plan: BoardPlan = {};
const biomes = ['coast', 'coast', 'lake', 'coast', 'meadow', 'coast', 'forest'] as const;
hexSpiral(1).forEach((coord, i) => {
  plan[hexKey(coord)] = biomes[i]!;
});

const board = generateBoard({ seed: 'smoke', R: 50, connectors: 'dovetail', plan });
console.log(`board: ${board.tiles.length} tiles, ${board.triangles} triangles`);

for (const format of ['stl', 'bundle', '3mf'] as ExportFormat[]) {
  const files = exportBoard({
    board,
    paletteBiome: 'coast',
    colourCount: 4,
    printer: PRINTERS.find((p) => p.id === 'p1x1')!,
    seed: 'smoke',
    connectors: 'dovetail',
    format,
  });
  for (const file of files) {
    writeFileSync(join(out, file.name), file.data);
    console.log(`${format.padEnd(10)} ${file.name.padEnd(34)} ${(file.data.byteLength / 1024).toFixed(1)} KB`);
  }
}
