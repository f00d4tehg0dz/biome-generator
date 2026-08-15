// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * The 4 → 3 → 2 → 1 colour reduction ladder. See docs/export-spec.md §1.3.
 *
 * A rung maps every slot onto a *representative* slot. Slots sharing a representative
 * print in the same filament; the representative's palette colour is the one used.
 */

import { SLOT_ORDER, type SlotId, type SlotPalette } from './slots';
import type { MaterialId } from './materials';
import type { SlotBinding } from './slots';

export type ColourCount = 1 | 2 | 3 | 4;

/** slot → representative slot */
export type Rung = Record<SlotId, SlotId>;

/** A biome may override any rung; unspecified rungs fall back to the default ladder. */
export type ReductionOverride = Partial<Record<ColourCount, Rung>>;

const DEFAULT_LADDER: Record<ColourCount, Rung> = {
  4: { S0: 'S0', S1: 'S1', S2: 'S2', S3: 'S3' },
  // Accents fold into the earth colour: paths and stone go tan.
  3: { S0: 'S0', S1: 'S1', S2: 'S2', S3: 'S1' },
  // Light against dark: ground + accents vs earth + feature.
  2: { S0: 'S0', S1: 'S1', S2: 'S1', S3: 'S0' },
  1: { S0: 'S0', S1: 'S0', S2: 'S0', S3: 'S0' },
};

/**
 * Keeps the feature colour (water) alive down to two colours, at the cost of the soil
 * band. Beach and lake biomes use this: a two-colour lake tile without water is nothing.
 */
export const KEEP_FEATURE_OVERRIDE: ReductionOverride = {
  2: { S0: 'S0', S1: 'S2', S2: 'S2', S3: 'S0' },
};

export function rungFor(count: ColourCount, override?: ReductionOverride): Rung {
  return override?.[count] ?? DEFAULT_LADDER[count];
}

export interface ResolvedPalette {
  count: ColourCount;
  /** One entry per printed filament, in slot order. */
  colours: string[];
  /** Which slots were merged into each filament, for labelling exports. */
  labels: SlotId[][];
  /** slot → filament index */
  slotIndex: Record<SlotId, number>;
  colourOfSlot(slot: SlotId): string;
  colourOfMaterial(material: MaterialId): string;
  indexOfMaterial(material: MaterialId): number;
}

/**
 * Collapse a 4-colour palette down to `count` filaments and expose lookups by slot and by
 * material. This is the only place a MaterialId becomes a hex string.
 *
 * `palette` and `binding` deliberately come from different places on a mixed board: the
 * board prints with one set of filaments, so the colours are the board's, while the binding
 * what each material *means*, stays the tile's own. A coast tile on a forest-palette
 * board still routes its water to the feature slot; it just comes out the forest's green,
 * because four filaments are four filaments.
 */
export function resolvePalette(
  palette: SlotPalette,
  binding: SlotBinding,
  count: ColourCount,
  override?: ReductionOverride,
): ResolvedPalette {
  const rung = rungFor(count, override);

  // Representatives, deduplicated in slot order so filament 1 is always the ground.
  const reps: SlotId[] = [];
  for (const slot of SLOT_ORDER) {
    const rep = rung[slot];
    if (!reps.includes(rep)) reps.push(rep);
  }

  const slotIndex = {} as Record<SlotId, number>;
  const labels: SlotId[][] = reps.map(() => []);
  for (const slot of SLOT_ORDER) {
    const index = reps.indexOf(rung[slot]);
    slotIndex[slot] = index;
    labels[index]!.push(slot);
  }

  const colours = reps.map((rep) => palette[rep]);

  return {
    count,
    colours,
    labels,
    slotIndex,
    colourOfSlot: (slot) => colours[slotIndex[slot]]!,
    colourOfMaterial: (material) => colours[slotIndex[binding[material]]]!,
    indexOfMaterial: (material) => slotIndex[binding[material]],
  };
}
