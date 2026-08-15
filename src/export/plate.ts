// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Print plate layout.
 *
 * Tiles are laid out flat and packed, *not* in their board arrangement: adjacency is what
 * the board is for, and on the plate all that matters is fitting. Each tile keeps its own
 * geometry and gets a translation onto its cell.
 *
 * The cell is measured from the tiles themselves rather than derived from the hex. A dovetail
 * tab reaches ~5 mm past the outline on three sides, and a plate sized for a bare hexagon
 * would quietly overlap them.
 */

import { boundsOf, type Solid } from '../kit/solid';
import type { Board, PlacedTile } from '../gen/board';

export interface Printer {
  id: string;
  name: string;
  /** Usable bed, millimetres. */
  bed: readonly [number, number];
}

export const PRINTERS: Printer[] = [
  { id: 'a1mini', name: 'Bambu A1 mini', bed: [180, 180] },
  { id: 'p1x1', name: 'Bambu P1S / X1C', bed: [256, 256] },
  { id: 'mk4', name: 'Prusa MK4', bed: [250, 210] },
  { id: 'ender3', name: 'Ender 3', bed: [220, 220] },
];

/** Gap between tiles on the plate. */
export const PLATE_SPACING = 3;

export interface PlateItem {
  tile: PlacedTile;
  /** Translation from the tile's own origin to its place on the bed, millimetres. */
  offset: readonly [number, number];
}

export interface Plate {
  index: number;
  items: PlateItem[];
}

export interface PlateLayout {
  plates: Plate[];
  /** Cell footprint used, millimetres. */
  cell: readonly [number, number];
  perPlate: number;
  /** True when even one tile will not fit the bed. */
  tooLarge: boolean;
}

export function layoutPlates(board: Board, printer: Printer): PlateLayout {
  const cell = cellSize(board.tiles);
  const columns = Math.max(1, Math.floor(printer.bed[0] / cell[0]));
  const rows = Math.max(1, Math.floor(printer.bed[1] / cell[1]));
  const perPlate = columns * rows;
  const tooLarge = cell[0] > printer.bed[0] || cell[1] > printer.bed[1];

  const plates: Plate[] = [];
  board.tiles.forEach((tile, index) => {
    const plateIndex = Math.floor(index / perPlate);
    const slot = index % perPlate;
    const column = slot % columns;
    const row = Math.floor(slot / columns);

    if (!plates[plateIndex]) plates[plateIndex] = { index: plateIndex, items: [] };

    // Centre the used part of the grid on the bed, so a half-full plate is not stuck in a
    // corner where a skirt or an auto-levelling probe might not reach.
    const used = Math.min(perPlate, board.tiles.length - plateIndex * perPlate);
    const usedColumns = Math.min(columns, used);
    const usedRows = Math.ceil(used / columns);
    const originX = (usedColumns - 1) / 2;
    const originY = (usedRows - 1) / 2;

    const bounds = boundsOf(tile.tile.solids);
    const centreX = (bounds.min[0]! + bounds.max[0]!) / 2;
    const centreY = (bounds.min[1]! + bounds.max[1]!) / 2;

    plates[plateIndex]!.items.push({
      tile,
      offset: [(column - originX) * cell[0] - centreX, (row - originY) * cell[1] - centreY],
    });
  });

  return { plates, cell, perPlate, tooLarge };
}

/** The largest tile footprint on the board, plus spacing. */
function cellSize(tiles: readonly PlacedTile[]): readonly [number, number] {
  let width = 0;
  let height = 0;
  for (const placed of tiles) {
    const bounds = boundsOf(placed.tile.solids);
    width = Math.max(width, bounds.max[0]! - bounds.min[0]!);
    height = Math.max(height, bounds.max[1]! - bounds.min[1]!);
  }
  return [width + PLATE_SPACING, height + PLATE_SPACING];
}

/** A plate's solids, with each tile's plate offset baked in. */
export function plateSolids(plate: Plate): Solid[] {
  return plate.items.flatMap(({ tile, offset }) =>
    tile.tile.solids.map((solid) => {
      const geometry = solid.geometry.clone();
      geometry.translate(offset[0], offset[1], 0);
      return { ...solid, geometry };
    }),
  );
}
