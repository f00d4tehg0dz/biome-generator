// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { useEffect, useMemo } from 'react';
import { mergeSolidsBy } from '../kit/solid';
import type { Tile } from '../gen/tile';
import type { ResolvedPalette } from '../palette/reduce';

/**
 * Renders a tile as one mesh per printed filament. The geometry here is the *same*
 * geometry the exporters will write. Merging by colour is the only transformation.
 */
export function TileMesh({ tile, palette }: { tile: Tile; palette: ResolvedPalette }) {
  const groups = useMemo(() => {
    const merged = mergeSolidsBy(tile.solids, (solid) => palette.indexOfMaterial(solid.material));
    return [...merged.entries()].sort((a, b) => a[0] - b[0]);
  }, [tile, palette]);

  useEffect(() => {
    return () => {
      for (const [, geometry] of groups) geometry.dispose();
    };
  }, [groups]);

  return (
    <group>
      {groups.map(([index, geometry]) => (
        <mesh key={index} geometry={geometry}>
          <meshLambertMaterial color={palette.colours[index]} flatShading />
        </mesh>
      ))}
    </group>
  );
}
