// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Export orchestration: board → plates → colour groups → files.
 *
 * The colour grouping happens here and only here. Everything upstream deals in MaterialIds;
 * this is where the reduction ladder is applied and a material finally becomes a filament.
 */

import type { Board } from '../gen/board';
import { BIOMES, type BiomeId } from '../gen/biomes';
import { SLOT_NAMES } from '../palette/slots';
import { resolvePalette, type ColourCount } from '../palette/reduce';
import type { Solid } from '../kit/solid';
import { layoutPlates, plateSolids, type Plate, type Printer } from './plate';
import { writeBinaryStl } from './stl';
import { writeThreeMf, type ColourGroup } from './threemf';
import { writeStlBundle } from './bundle';

export type ExportFormat = 'stl' | 'bundle' | '3mf';

export interface ExportRequest {
  board: Board;
  /** Biome whose palette supplies the board's colours. */
  paletteBiome: BiomeId;
  colourCount: ColourCount;
  printer: Printer;
  seed: string;
  connectors: string;
  format: ExportFormat;
}

export interface ExportedFile {
  name: string;
  data: Uint8Array;
}

/**
 * Splits a plate's solids by filament.
 *
 * A board prints with one set of filaments, so the *palette* is the board's; the *binding*,
 * what each material means, stays each tile's own. See docs/export-spec.md §1.
 */
export function colourGroups(
  plate: Plate,
  paletteBiome: BiomeId,
  colourCount: ColourCount,
): ColourGroup[] {
  const source = BIOMES[paletteBiome];
  const reference = resolvePalette(source.palette, source.binding, colourCount, source.reduction);

  const groups: ColourGroup[] = reference.colours.map((colour, index) => ({
    name: reference.labels[index]!.map((slot) => SLOT_NAMES[slot]).join(' + '),
    colour,
    solids: [] as Solid[],
  }));

  for (const { tile, offset } of plate.items) {
    const palette = resolvePalette(
      source.palette,
      BIOMES[tile.tile.biome].binding,
      colourCount,
      source.reduction,
    );
    for (const solid of tile.tile.solids) {
      const geometry = solid.geometry.clone();
      geometry.translate(offset[0], offset[1], 0);
      groups[palette.indexOfMaterial(solid.material)]!.solids.push({ ...solid, geometry });
    }
  }

  return groups;
}

export function exportBoard(request: ExportRequest): ExportedFile[] {
  const layout = layoutPlates(request.board, request.printer);
  const multiPlate = layout.plates.length > 1;
  const files: ExportedFile[] = [];

  for (const plate of layout.plates) {
    const suffix = multiPlate ? `_plate${plate.index + 1}` : '';
    const stem = `biome_${request.seed}${suffix}`;

    switch (request.format) {
      case 'stl':
        files.push({
          name: `${stem}.stl`,
          data: writeBinaryStl(plateSolids(plate), `biome-generator ${request.seed}`),
        });
        break;

      case 'bundle':
        files.push({
          name: `${stem}_stls.zip`,
          data: writeStlBundle(
            colourGroups(plate, request.paletteBiome, request.colourCount),
            describe(request, layout.plates),
          ),
        });
        break;

      case '3mf':
        files.push({
          name: `${stem}_${request.colourCount}c.3mf`,
          data: writeThreeMf(colourGroups(plate, request.paletteBiome, request.colourCount), {
            title: `Biome board ${request.seed}`,
            // Centred on the bed. The geometry is built around (0, 0) and these slicers put
            // their origin at the front-left corner of the plate.
            origin: [request.printer.bed[0] / 2, request.printer.bed[1] / 2],
          }),
        });
        break;
    }
  }

  return files;
}

function describe(request: ExportRequest, plates: readonly Plate[]) {
  return {
    seed: request.seed,
    biomes: [...new Set(request.board.tiles.map((t) => BIOMES[t.tile.biome].name))],
    colourCount: request.colourCount,
    connectors: request.connectors,
    printer: request.printer.name,
    plates: plates.map((plate) =>
      plate.items.map(({ tile }) => `${BIOMES[tile.tile.biome].name} (${tile.tile.coord.q},${tile.tile.coord.r})`),
    ),
  };
}

/** Hands a file to the browser. No-op outside one. */
export function download(file: ExportedFile): void {
  if (typeof document === 'undefined') return;
  // Copy into a fresh buffer: the view may be a slice of a larger allocation.
  const blob = new Blob([new Uint8Array(file.data)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { layoutPlates, PRINTERS, type Printer } from './plate';
