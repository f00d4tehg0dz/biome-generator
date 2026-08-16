// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * 3MF.
 *
 * A ZIP holding an XML mesh plus metadata. Unlike STL it carries units, colour and object
 * structure, and the spec requires watertight meshes, which is why it is the primary output
 * and STL the fallback. See docs/export-spec.md §3.
 *
 * One `<object>` per surviving colour slot, each pointing at a `<base>` through `pid`/
 * `pindex`. Slicers read the separate objects as separately assignable parts and match
 * filaments by RGB distance on `displaycolor`. Base materials, not colour groups: base
 * materials describe manufacturing materials and are what PrusaSlicer and Bambu Studio map
 * onto extruders, while colour groups are a rendering concept handled inconsistently.
 */

import { zipSync, strToU8 } from 'fflate';
import type { Solid } from '../kit/solid';

export interface ColourGroup {
  /** Human-readable, ends up as the material name. */
  name: string;
  /** `#RRGGBB`. */
  colour: string;
  solids: Solid[];
}

export interface ThreeMfOptions {
  /** Model title, recorded in the archive metadata. */
  title?: string;
  /**
   * Where the plate's centre sits in bed coordinates, millimetres.
   *
   * Bed origin in these slicers is the front-left corner, not the middle, so geometry built
   * around (0, 0) arrives with three quarters of itself off the plate. Bambu Studio quietly
   * rearranges it; Orca and Creality Print refuse to slice and say the object is over the
   * boundary. Passing the bed's centre puts it where the user would have dragged it.
   */
  origin?: readonly [number, number];
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="text/xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

/** Vertices are written to this many decimals, well under a nozzle width. */
const PRECISION = 4;

export function writeThreeMf(groups: readonly ColourGroup[], options: ThreeMfOptions = {}): Uint8Array {
  const live = groups.filter((group) => group.solids.length > 0);

  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELS),
      '3D/3dmodel.model': strToU8(
        modelXml(live, options.title ?? 'Biome board', options.origin ?? [0, 0]),
      ),
      'Metadata/model_settings.config': strToU8(modelSettings(live)),
    },
    { level: 6 },
  );
}

/** Resource ids. Mesh objects start at 3; the assembly follows them. */
const MATERIALS_ID = 1;
const COLOURS_ID = 2;
const FIRST_OBJECT_ID = 3;

/** Id of the assembly object that holds every colour as a component. */
export function assemblyId(groupCount: number): number {
  return FIRST_OBJECT_ID + groupCount;
}

/** Id of the mesh object carrying colour `index`. */
export function meshObjectId(index: number): number {
  return FIRST_OBJECT_ID + index;
}

function modelXml(
  groups: readonly ColourGroup[],
  title: string,
  origin: readonly [number, number],
): string {
  const materials = groups
    .map((group) => `      <base name="${escapeXml(group.name)}" displaycolor="${toRgba(group.colour)}"/>`)
    .join('\n');

  // Both a basematerials group and a materials-extension colorgroup, because slicers do not
  // agree on which one carries colour. Bambu Studio's standard-3MF parser reads *only*
  // `m:colorgroup` and maps groups to AMS slots in order, ignoring base materials entirely,
  // which is exactly how a file ended up with the right four filaments listed and the model
  // rendered in one colour. Others (Creality's, PrusaSlicer) read base materials.
  //
  // The objects point at the colorgroup, since that is the one with the stricter reader.
  const colours = groups
    .map((group) => `      <m:color color="${toRgba(group.colour)}"/>`)
    .join('\n');

  const objects = groups
    .map((group, index) => {
      return `    <object id="${meshObjectId(index)}" type="model" pid="${COLOURS_ID}" pindex="${index}">
      <mesh>
${meshXml(group.solids, index)}
      </mesh>
    </object>`;
    })
    .join('\n');

  // One object made of components, referenced once, not one build item per colour.
  //
  // Slicers place each build item independently, and "place on bed" is applied per item. The
  // colour groups do not share a lowest point (the stone band starts at z = 0, the ground
  // slab at 8.6, the water at 9), so four separate items were each dropped to the bed and
  // the model collapsed into itself. As one assembly there is a single thing to place, and
  // every part keeps its height relative to the rest.
  const components = groups
    .map((_, index) => `        <component objectid="${meshObjectId(index)}"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
    xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
    xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <metadata name="Title">${escapeXml(title)}</metadata>
  <metadata name="Application">biome-generator</metadata>
  <resources>
    <basematerials id="${MATERIALS_ID}">
${materials}
    </basematerials>
    <m:colorgroup id="${COLOURS_ID}">
${colours}
    </m:colorgroup>
${objects}
    <object id="${assemblyId(groups.length)}" type="model">
      <components>
${components}
      </components>
    </object>
  </resources>
  <build>
    <item objectid="${assemblyId(groups.length)}" transform="1 0 0 0 1 0 0 0 1 ${round(
      origin[0],
    )} ${round(origin[1])} 0"/>
  </build>
</model>`;
}

function meshXml(solids: readonly Solid[], materialIndex: number): string {
  const vertices: string[] = [];
  const triangles: string[] = [];
  let base = 0;

  for (const solid of solids) {
    const position = solid.geometry.getAttribute('position');
    const index = solid.geometry.getIndex();
    if (!index) continue;

    for (let i = 0; i < position.count; i++) {
      vertices.push(
        `          <vertex x="${round(position.getX(i))}" y="${round(position.getY(i))}" z="${round(
          position.getZ(i),
        )}"/>`,
      );
    }
    // Winding is counter-clockwise seen from outside; 3MF has no normal field, so the
    // winding is the normal.
    //
    // `p1` repeats the object's own material on every triangle. A conformant reader would
    // inherit it from the object's `pindex`, but not every reader does: the colours showed
    // up in the filament list and the model still rendered in one colour.
    for (let t = 0; t < index.count; t += 3) {
      triangles.push(
        `          <triangle v1="${base + index.getX(t)}" v2="${base + index.getX(t + 1)}" v3="${
          base + index.getX(t + 2)
        }" p1="${materialIndex}"/>`,
      );
    }
    base += position.count;
  }

  return `        <vertices>
${vertices.join('\n')}
        </vertices>
        <triangles>
${triangles.join('\n')}
        </triangles>`;
}

/**
 * The part-to-extruder map, which is the only thing that actually colours the model.
 *
 * Core-spec 3MF colour (`basematerials`, `m:colorgroup`) is written too, but no slicer here
 * assigns an extruder from it: a file carrying only that arrives with the right filaments
 * listed and every part on extruder 1. Bambu Studio, OrcaSlicer and Creality Print all read
 * this file instead, being forks of one another. PrusaSlicer reads neither and wants its own
 * `Slic3r_PE_model.config`, which is keyed by triangle ranges rather than object ids; until
 * that can be tested against a real PrusaSlicer, the STL bundle is its path.
 *
 * Deliberately no `project_settings.config`. A partial one is worse than none: Orca reads it
 * as a customised preset, warns about unsafe G-code, and replaces the user's own printer and
 * filament selections with entries named after the file. Which filament goes where is the
 * user's business, so the part names carry the colour instead.
 */
function modelSettings(groups: readonly ColourGroup[]): string {
  const parts = groups
    .map(
      (group, index) => `    <part id="${meshObjectId(index)}" subtype="normal_part">
      <metadata key="name" value="${escapeXml(group.name)} ${group.colour.toUpperCase()}"/>
      <metadata key="extruder" value="${index + 1}"/>
    </part>`,
    )
    .join('\n');

  // The object id has to be the *assembly*, and the part ids its components. Naming the
  // first mesh object instead described a structure the model file did not contain, and
  // Bambu Studio reconciled the two by moving things.
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${assemblyId(groups.length)}">
    <metadata key="name" value="biome_board"/>
    <metadata key="extruder" value="1"/>
${parts}
  </object>
</config>`;
}

function round(value: number): string {
  return Number(value.toFixed(PRECISION)).toString();
}

/** 3MF wants `#RRGGBBAA`. */
function toRgba(colour: string): string {
  const hex = colour.replace('#', '').toUpperCase();
  return `#${hex.length === 6 ? `${hex}FF` : hex}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
