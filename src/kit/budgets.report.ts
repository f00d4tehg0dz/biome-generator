// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Prints measured triangle counts per prop, so docs/geometry-spec.md quotes real numbers
 * rather than guesses. Run with `npx vite-node src/kit/budgets.report.ts`.
 */

import { PROP_FAMILIES, PROPS, propMinFeature, propRadius, type PropId } from './index';
import { soloContext } from './prop';
import { makeRng } from '../core/rng';
import { triangleCount } from './solid';

const SEEDS = Array.from({ length: 24 }, (_, i) => `b${i}`);

for (const family of PROP_FAMILIES) {
  console.log(`\n## ${family.name}`);
  for (const id of family.ids as PropId[]) {
    const builds = SEEDS.map((seed) => PROPS[id].build(soloContext(makeRng(id, seed))));
    const counts = builds.map(triangleCount);
    const solids = builds.map((b) => b.length);
    const avg = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
    console.log(
      `${id.padEnd(14)} tris ${String(Math.min(...counts)).padStart(3)}-${String(
        Math.max(...counts),
      ).padStart(3)} (avg ${String(avg).padStart(3)})  cap ${String(PROPS[id].budget).padStart(
        3,
      )}  solids ${Math.min(...solids)}-${Math.max(...solids)}` +
        `  reach ${propRadius(id).toFixed(1).padStart(5)} (declared ${String(
          PROPS[id].footprint,
        ).padStart(4)})  minFeature ${propMinFeature(id).toFixed(2)}`,
    );
  }
}
