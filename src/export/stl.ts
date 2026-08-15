// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Binary STL.
 *
 * The format carries triangles and nothing else: no units, no colour, no object structure.
 * That is exactly why it is the fallback: every slicer ever written reads it. Units are
 * implied, and every slicer assumes millimetres, which is what the geometry is already in
 * (CLAUDE.md invariant 1). No transform is applied here; if one were needed, the bug would
 * be upstream.
 *
 * Face normals are recomputed from the winding rather than read from a normal attribute:
 * in STL the winding *is* the normal, and the two disagreeing is a classic source of
 * inside-out solids.
 */

import type { Solid } from '../kit/solid';

const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

export function triangleCountOf(solids: readonly Solid[]): number {
  return solids.reduce((sum, solid) => sum + (solid.geometry.getIndex()?.count ?? 0) / 3, 0);
}

export function writeBinaryStl(solids: readonly Solid[], header = 'biome-generator'): Uint8Array {
  const triangles = triangleCountOf(solids);
  const buffer = new ArrayBuffer(HEADER_BYTES + 4 + triangles * TRIANGLE_BYTES);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // The header is free-form; some tools show it, none parse it.
  const label = header.slice(0, HEADER_BYTES - 1);
  for (let i = 0; i < label.length; i++) bytes[i] = label.charCodeAt(i) & 0x7f;

  view.setUint32(HEADER_BYTES, triangles, true);

  let offset = HEADER_BYTES + 4;
  for (const solid of solids) {
    const position = solid.geometry.getAttribute('position');
    const index = solid.geometry.getIndex();
    if (!index) continue;

    for (let t = 0; t < index.count; t += 3) {
      const a = index.getX(t);
      const b = index.getX(t + 1);
      const c = index.getX(t + 2);

      const ax = position.getX(a);
      const ay = position.getY(a);
      const az = position.getZ(a);
      const bx = position.getX(b);
      const by = position.getY(b);
      const bz = position.getZ(b);
      const cx = position.getX(c);
      const cy = position.getY(c);
      const cz = position.getZ(c);

      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;

      for (const value of [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz]) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
      view.setUint16(offset, 0, true);
      offset += 2;
    }
  }

  return bytes;
}
