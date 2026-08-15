// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Minimum feature size. A prop whose smallest dimension falls below the nozzle's practical
 * limit either fails to print or snaps off during support removal, so it is culled rather
 * than shrunk.
 *
 * This measures each solid's bounding box, which catches a whole prop being too small.
 * Thin features *inside* a solid (a fence rail, a bench leg) are guarded at the builder
 * instead, by the MIN_WALL and MIN_LEG constants those builders are written against.
 */

import { boundsOf, MIN_FEATURE, type Solid } from '../kit/solid';

export interface FeatureViolation {
  name: string;
  /** Smallest bounding-box dimension, in millimetres. */
  smallest: number;
}

export interface FeatureReport {
  ok: boolean;
  violations: FeatureViolation[];
}

export function checkFeatures(solids: readonly Solid[], minFeature = MIN_FEATURE): FeatureReport {
  const violations: FeatureViolation[] = [];
  for (const solid of solids) {
    const { min, max } = boundsOf([solid]);
    const smallest = Math.min(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
    if (smallest < minFeature) violations.push({ name: solid.name, smallest });
  }
  return { ok: violations.length === 0, violations };
}

/** Smallest bounding-box dimension across a solid set: the number scatter culls on. */
export function smallestFeature(solids: readonly Solid[]): number {
  let smallest = Infinity;
  for (const solid of solids) {
    const { min, max } = boundsOf([solid]);
    smallest = Math.min(smallest, max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
  }
  return smallest;
}
