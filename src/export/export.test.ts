// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { generateBoard, singleTile, type BoardPlan } from '../gen/board';
import { hexKey, hexSpiral } from '../core/hex';
import { BIOME_IDS, type BiomeId } from '../gen/biomes';
import { hashInt } from '../core/rng';
import { triangleCount } from '../kit/solid';
import { boundsOf } from '../kit/solid';
import { layoutPlates, plateSolids, PRINTERS, PLATE_SPACING } from './plate';
import { writeBinaryStl, triangleCountOf } from './stl';
import { assemblyId, meshObjectId, writeThreeMf } from './threemf';
import { writeStlBundle } from './bundle';
import { colourGroups, exportBoard } from './index';
import type { ColourCount } from '../palette/reduce';

const R = 50;

function flower(seed: string): BoardPlan {
  const plan: BoardPlan = {};
  hexSpiral(1).forEach((coord, i) => {
    plan[hexKey(coord)] = BIOME_IDS[hashInt(0, BIOME_IDS.length - 1, seed, 'b', i)]! as BiomeId;
  });
  return plan;
}

const board = generateBoard({ seed: 'export', R, connectors: 'dovetail', plan: flower('export') });
const single = generateBoard({
  seed: 'export',
  R,
  connectors: 'dovetail',
  plan: singleTile('meadow'),
});

describe('plate layout', () => {
  it('fits four tiles on a 256 mm bed and one on an A1 mini', () => {
    const big = layoutPlates(board, PRINTERS.find((p) => p.id === 'p1x1')!);
    const small = layoutPlates(board, PRINTERS.find((p) => p.id === 'a1mini')!);
    expect(big.perPlate).toBe(4);
    // One, not two: the dovetails add ~5 mm to the footprint, and two tabbed tiles side by
    // side no longer clear 180 mm.
    expect(small.perPlate).toBe(1);
    expect(big.tooLarge).toBe(false);
    expect(small.tooLarge).toBe(false);
  });

  it('fits a second tile on the A1 mini once the connectors come off', () => {
    const plain = generateBoard({ seed: 'export', R, connectors: 'none', plan: flower('export') });
    const layout = layoutPlates(plain, PRINTERS.find((p) => p.id === 'a1mini')!);
    expect(layout.perPlate).toBe(2);
  });

  it('places every tile exactly once', () => {
    const layout = layoutPlates(board, PRINTERS[1]!);
    const placed = layout.plates.flatMap((plate) => plate.items.map((item) => item.tile));
    expect(placed).toHaveLength(board.tiles.length);
    expect(new Set(placed.map((t) => hexKey(t.tile.coord))).size).toBe(board.tiles.length);
  });

  it('keeps every plate inside the bed', () => {
    for (const printer of PRINTERS) {
      const layout = layoutPlates(board, printer);
      for (const plate of layout.plates) {
        const bounds = boundsOf(plateSolids(plate));
        const width = bounds.max[0]! - bounds.min[0]!;
        const height = bounds.max[1]! - bounds.min[1]!;
        expect(width, `${printer.name} width`).toBeLessThanOrEqual(printer.bed[0]);
        expect(height, `${printer.name} height`).toBeLessThanOrEqual(printer.bed[1]);
      }
    }
  });

  it('never lets two tiles on a plate touch', () => {
    const layout = layoutPlates(board, PRINTERS[1]!);
    for (const plate of layout.plates) {
      const boxes = plate.items.map(({ tile, offset }) => {
        const bounds = boundsOf(tile.tile.solids);
        return {
          minX: bounds.min[0]! + offset[0],
          maxX: bounds.max[0]! + offset[0],
          minY: bounds.min[1]! + offset[1],
          maxY: bounds.max[1]! + offset[1],
        };
      });
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const apart =
            a.maxX <= b.minX + 1e-6 ||
            b.maxX <= a.minX + 1e-6 ||
            a.maxY <= b.minY + 1e-6 ||
            b.maxY <= a.minY + 1e-6;
          expect(apart, `tiles ${i} and ${j} overlap on the plate`).toBe(true);
        }
      }
    }
  });

  it('leaves the plate sitting on the bed, not floating', () => {
    const layout = layoutPlates(board, PRINTERS[1]!);
    for (const plate of layout.plates) {
      expect(boundsOf(plateSolids(plate)).min[2]).toBeCloseTo(0, 5);
    }
  });

  it('allows room for the connector tabs in its cell', () => {
    // The hexagon is 86.6 mm across flats; a dovetail adds about 5 mm on one side.
    const layout = layoutPlates(board, PRINTERS[1]!);
    expect(layout.cell[0]).toBeGreaterThan(86.6 + PLATE_SPACING);
  });
});

describe('binary STL', () => {
  const solids = plateSolids(layoutPlates(single, PRINTERS[1]!).plates[0]!);
  const data = writeBinaryStl(solids);

  it('has the header, count and fixed-size triangle records the format requires', () => {
    const triangles = triangleCountOf(solids);
    expect(data.byteLength).toBe(80 + 4 + triangles * 50);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint32(80, true)).toBe(triangles);
  });

  it('writes every triangle of every solid', () => {
    expect(triangleCountOf(solids)).toBe(triangleCount(solids));
  });

  it('round-trips vertices within a nozzle width', () => {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const bounds = boundsOf(solids);
    let minZ = Infinity;
    let maxZ = -Infinity;
    const count = view.getUint32(80, true);
    for (let t = 0; t < count; t++) {
      const base = 84 + t * 50 + 12;
      for (let v = 0; v < 3; v++) {
        const z = view.getFloat32(base + v * 12 + 8, true);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
    expect(minZ).toBeCloseTo(bounds.min[2]!, 2);
    expect(maxZ).toBeCloseTo(bounds.max[2]!, 2);
  });

  it('derives face normals from the winding, and they are unit length', () => {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const count = view.getUint32(80, true);
    for (let t = 0; t < Math.min(count, 500); t++) {
      const base = 84 + t * 50;
      const n = [0, 1, 2].map((i) => view.getFloat32(base + i * 4, true));
      expect(Math.hypot(n[0]!, n[1]!, n[2]!)).toBeCloseTo(1, 4);
    }
  });
});

describe('colour grouping', () => {
  const plate = layoutPlates(board, PRINTERS[1]!).plates[0]!;

  it('produces exactly N groups for N colours, and loses no geometry', () => {
    for (const count of [1, 2, 3, 4] as ColourCount[]) {
      const groups = colourGroups(plate, 'coast', count);
      expect(groups, `count ${count}`).toHaveLength(count);

      const grouped = groups.reduce((sum, group) => sum + triangleCount(group.solids), 0);
      const expected = plate.items.reduce((sum, item) => sum + triangleCount(item.tile.tile.solids), 0);
      expect(grouped, `count ${count}`).toBe(expected);
    }
  });

  it('gives every group a distinct colour', () => {
    const groups = colourGroups(plate, 'coast', 4);
    expect(new Set(groups.map((g) => g.colour)).size).toBe(4);
  });

  it('bakes the plate offset into the exported geometry', () => {
    const groups = colourGroups(plate, 'coast', 4);
    const bounds = boundsOf(groups.flatMap((g) => g.solids));
    // More than one tile on the plate, so the spread exceeds a single tile's width.
    expect(bounds.max[0]! - bounds.min[0]!).toBeGreaterThan(90);
  });
});

describe('3MF', () => {
  const plate = layoutPlates(single, PRINTERS[1]!).plates[0]!;
  const groups = colourGroups(plate, 'meadow', 4);

  it('is a zip holding the three files the spec requires', () => {
    const files = unzipSync(writeThreeMf(groups));
    expect(Object.keys(files).sort()).toEqual([
      '3D/3dmodel.model',
      '[Content_Types].xml',
      '_rels/.rels',
    ]);
  });

  it('declares millimetres, one base material per colour, and a mesh object each', () => {
    const files = unzipSync(writeThreeMf(groups));
    const model = strFromU8(files['3D/3dmodel.model']!);
    expect(model).toContain('unit="millimeter"');
    expect(model.match(/<base /g)).toHaveLength(4);
    // Four mesh objects plus the assembly that holds them.
    expect(model.match(/<object /g)).toHaveLength(5);
    for (const group of groups) {
      expect(model).toContain(`displaycolor="${group.colour.toUpperCase()}FF"`);
    }
  });

  it('builds ONE object from components, not one per colour', () => {
    // Slicers apply "place on bed" per build item. The colour groups do not share a lowest
    // point (the stone band starts at z = 0, the ground slab at 8.6) so one item each
    // meant each was dropped to the bed separately and the model collapsed into itself.
    const model = strFromU8(unzipSync(writeThreeMf(groups))['3D/3dmodel.model']!);
    expect(model.match(/<item /g)).toHaveLength(1);
    expect(model.match(/<component /g)).toHaveLength(4);
    expect(model).toContain(`<item objectid="${assemblyId(4)}"`);
    // Every mesh object is referenced exactly once by the assembly.
    for (let index = 0; index < 4; index++) {
      expect(model).toContain(`<component objectid="${meshObjectId(index)}"/>`);
    }
  });

  it('carries the colours as a materials-extension colorgroup as well as base materials', () => {
    // Bambu Studio's standard-3MF parser reads only `m:colorgroup`; others read base
    // materials. A file with only the latter listed the right four filaments and rendered
    // the model in one colour.
    const model = strFromU8(unzipSync(writeThreeMf(groups))['3D/3dmodel.model']!);
    expect(model).toContain('xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"');
    expect(model.match(/<m:color /g)).toHaveLength(4);
    expect(model.match(/<base /g)).toHaveLength(4);
    for (const group of groups) {
      expect(model).toContain(`<m:color color="${group.colour.toUpperCase()}FF"/>`);
    }
    // The objects point at the colorgroup, which has the stricter reader.
    for (let index = 0; index < 4; index++) {
      expect(model).toContain(`pid="2" pindex="${index}"`);
    }
  });

  it('names its material on every triangle, not only on the object', () => {
    // A conformant reader inherits the object's `pindex`; not every reader does, and the
    // symptom is a filament list with the right colours and a model rendered in one.
    const model = strFromU8(unzipSync(writeThreeMf(groups))['3D/3dmodel.model']!);
    const triangles = model.match(/<triangle [^>]*\/>/g) ?? [];
    expect(triangles.length).toBeGreaterThan(0);
    for (const triangle of triangles) expect(triangle).toMatch(/ p1="\d+"/);
    for (let index = 0; index < 4; index++) {
      expect(model).toContain(`pindex="${index}"`);
      expect(model).toContain(`p1="${index}"`);
    }
  });

  it('uses an identity transform, since the geometry is already in world millimetres', () => {
    const model = strFromU8(unzipSync(writeThreeMf(groups))['3D/3dmodel.model']!);
    const transforms = model.match(/transform="[^"]+"/g) ?? [];
    expect(transforms).toHaveLength(1);
    expect(transforms[0]).toBe('transform="1 0 0 0 1 0 0 0 1 0 0 0"');
  });

  it('emits exactly N materials at N colours, never an unused one', () => {
    for (const count of [1, 2, 3] as ColourCount[]) {
      const model = strFromU8(
        unzipSync(writeThreeMf(colourGroups(plate, 'meadow', count)))['3D/3dmodel.model']!,
      );
      expect(model.match(/<base /g), `count ${count}`).toHaveLength(count);
    }
  });

  it('writes as many triangles as the source geometry has', () => {
    const model = strFromU8(unzipSync(writeThreeMf(groups))['3D/3dmodel.model']!);
    const written = (model.match(/<triangle /g) ?? []).length;
    expect(written).toBe(groups.reduce((sum, group) => sum + triangleCount(group.solids), 0));
  });

  it('adds the vendor metadata only for the Bambu flavour', () => {
    const plain = unzipSync(writeThreeMf(groups));
    expect(plain['Metadata/model_settings.config']).toBeUndefined();

    const bambu = unzipSync(writeThreeMf(groups, { vendor: 'bambu' }));
    const settings = strFromU8(bambu['Metadata/model_settings.config']!);
    expect(settings).toContain('key="extruder" value="1"');
    expect(settings).toContain('key="extruder" value="4"');
    expect(strFromU8(bambu['Metadata/project_settings.config']!)).toContain('filament_colour');
  });

  it('points the vendor metadata at the assembly and its real part ids', () => {
    // Describing an object the model file does not contain is how the parts ended up at the
    // wrong height: the slicer reconciles the two descriptions by moving things.
    const bambu = unzipSync(writeThreeMf(groups, { vendor: 'bambu' }));
    const settings = strFromU8(bambu['Metadata/model_settings.config']!);
    const model = strFromU8(bambu['3D/3dmodel.model']!);

    expect(settings).toContain(`<object id="${assemblyId(4)}">`);
    expect(model).toContain(`<object id="${assemblyId(4)}" type="model">`);
    for (let index = 0; index < 4; index++) {
      expect(settings).toContain(`<part id="${meshObjectId(index)}"`);
      expect(model).toContain(`<component objectid="${meshObjectId(index)}"/>`);
    }
  });

  it('keeps every colour group at its true height, so nothing needs re-seating', () => {
    // The parts do not share a lowest point, and that is the whole reason they must arrive
    // as one object: 'place on bed' applied per part would flatten the tile.
    const lows = groups.map((group) => boundsOf(group.solids).min[2]!);
    expect(Math.min(...lows)).toBeCloseTo(0, 5);
    expect(Math.max(...lows)).toBeGreaterThan(4);
  });
});

describe('STL bundle', () => {
  const plate = layoutPlates(single, PRINTERS[1]!).plates[0]!;
  const groups = colourGroups(plate, 'meadow', 3);
  const files = unzipSync(
    writeStlBundle(groups, {
      seed: 'export',
      biomes: ['Meadow / Park'],
      colourCount: 3,
      connectors: 'dovetail',
      printer: 'Bambu P1S / X1C',
      plates: [['Meadow / Park (0,0)']],
    }),
  );

  it('holds one STL per filament plus a README', () => {
    const names = Object.keys(files).sort();
    expect(names.filter((n) => n.endsWith('.stl'))).toHaveLength(3);
    expect(names).toContain('README.txt');
  });

  it('names files so the mapping survives losing the README', () => {
    for (const [index, group] of groups.entries()) {
      const hex = group.colour.replace('#', '').toUpperCase();
      const match = Object.keys(files).find((n) => n.startsWith(`${index + 1}_`));
      expect(match, `group ${index}`).toBeDefined();
      expect(match).toContain(hex);
    }
  });

  it('tells the reader what to actually do', () => {
    const readme = strFromU8(files['README.txt']!);
    expect(readme).toContain('answer YES');
    expect(readme).toContain('millimetres');
    expect(readme).toContain('No supports');
    for (const group of groups) expect(readme).toContain(group.colour.toUpperCase());
  });

  it('writes STLs that parse as STLs', () => {
    for (const [name, data] of Object.entries(files)) {
      if (!name.endsWith('.stl')) continue;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const triangles = view.getUint32(80, true);
      expect(data.byteLength, name).toBe(80 + 4 + triangles * 50);
    }
  });
});

describe('exportBoard', () => {
  const base = {
    board,
    paletteBiome: 'coast' as BiomeId,
    colourCount: 4 as ColourCount,
    printer: PRINTERS.find((p) => p.id === 'p1x1')!,
    seed: 'export',
    connectors: 'dovetail',
  };

  it('emits one file per plate, named for it', () => {
    const files = exportBoard({ ...base, format: 'bundle' });
    expect(files).toHaveLength(2); // seven tiles, four per plate
    expect(files[0]!.name).toContain('plate1');
    expect(files[1]!.name).toContain('plate2');
  });

  it('drops the plate suffix when everything fits on one', () => {
    const files = exportBoard({ ...base, board: single, format: 'stl' });
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('biome_export.stl');
  });

  it('produces non-empty output in every format', () => {
    for (const format of ['stl', 'bundle', '3mf', '3mf-bambu'] as const) {
      for (const file of exportBoard({ ...base, format })) {
        expect(file.data.byteLength, `${format} ${file.name}`).toBeGreaterThan(1000);
      }
    }
  });

  it('names the colour count in multi-material filenames', () => {
    for (const count of [1, 2, 3, 4] as ColourCount[]) {
      const files = exportBoard({ ...base, colourCount: count, format: '3mf' });
      expect(files[0]!.name).toContain(`_${count}c`);
    }
  });
});
