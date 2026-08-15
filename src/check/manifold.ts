// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Mesh validation. A mesh must be watertight with consistent outward winding to slice
 * correctly. See the printability figures in docs/geometry-spec.md.
 *
 * Grows into the full print-check panel at M6. Today it covers the checks that gate
 * every kit builder: manifold edges, consistent winding, and degenerate triangles.
 */

import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three';
import type { Solid } from '../kit/solid';

export type IssueKind =
  | 'unindexed'
  | 'open-edge'
  | 'non-manifold-edge'
  | 'inconsistent-winding'
  | 'degenerate-triangle'
  | 'unused-vertex';

export interface MeshIssue {
  kind: IssueKind;
  count: number;
  detail: string;
}

export interface MeshReport {
  ok: boolean;
  triangles: number;
  vertices: number;
  issues: MeshIssue[];
}

/** Triangles with an area below this (mm²) are treated as degenerate. */
const MIN_AREA = 1e-7;

export function checkGeometry(geometry: BufferGeometry): MeshReport {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const issues: MeshIssue[] = [];

  if (!index) {
    return {
      ok: false,
      triangles: 0,
      vertices: position?.count ?? 0,
      issues: [{ kind: 'unindexed', count: 1, detail: 'geometry has no index buffer' }],
    };
  }

  const triangles = index.count / 3;
  const used = new Set<number>();
  /** undirected edge -> how many half-edges use it */
  const undirected = new Map<number, number>();
  /** directed half-edge -> how many triangles emit it in that direction */
  const directed = new Map<number, number>();
  let degenerate = 0;

  const stride = position.count;
  const undirectedKey = (a: number, b: number) => (a < b ? a * stride + b : b * stride + a);
  const directedKey = (a: number, b: number) => a * stride + b;

  for (let t = 0; t < triangles; t++) {
    const a = index.getX(t * 3);
    const b = index.getX(t * 3 + 1);
    const c = index.getX(t * 3 + 2);
    used.add(a).add(b).add(c);

    if (triangleArea(position, a, b, c) < MIN_AREA) degenerate++;

    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      undirected.set(undirectedKey(from, to), (undirected.get(undirectedKey(from, to)) ?? 0) + 1);
      directed.set(directedKey(from, to), (directed.get(directedKey(from, to)) ?? 0) + 1);
    }
  }

  let open = 0;
  let nonManifold = 0;
  for (const count of undirected.values()) {
    if (count === 1) open++;
    else if (count > 2) nonManifold++;
  }

  // In a consistently wound closed mesh every half-edge appears exactly once; a repeated
  // direction means two neighbouring faces disagree about which side is outside.
  let flipped = 0;
  for (const count of directed.values()) if (count > 1) flipped++;

  if (open > 0)
    issues.push({ kind: 'open-edge', count: open, detail: `${open} edges belong to one face` });
  if (nonManifold > 0)
    issues.push({
      kind: 'non-manifold-edge',
      count: nonManifold,
      detail: `${nonManifold} edges shared by more than two faces`,
    });
  if (flipped > 0)
    issues.push({
      kind: 'inconsistent-winding',
      count: flipped,
      detail: `${flipped} half-edges emitted twice in the same direction`,
    });
  if (degenerate > 0)
    issues.push({
      kind: 'degenerate-triangle',
      count: degenerate,
      detail: `${degenerate} triangles below ${MIN_AREA} mm²`,
    });
  if (used.size !== position.count)
    issues.push({
      kind: 'unused-vertex',
      count: position.count - used.size,
      detail: `${position.count - used.size} vertices are not referenced by any triangle`,
    });

  return { ok: issues.length === 0, triangles, vertices: position.count, issues };
}

export function checkSolid(solid: Solid): MeshReport {
  return checkGeometry(solid.geometry);
}

type PositionAttribute = BufferAttribute | InterleavedBufferAttribute;

function triangleArea(position: PositionAttribute, a: number, b: number, c: number): number {
  const ax = position.getX(a);
  const ay = position.getY(a);
  const az = position.getZ(a);
  const ux = position.getX(b) - ax;
  const uy = position.getY(b) - ay;
  const uz = position.getZ(b) - az;
  const vx = position.getX(c) - ax;
  const vy = position.getY(c) - ay;
  const vz = position.getZ(c) - az;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return Math.hypot(cx, cy, cz) / 2;
}
