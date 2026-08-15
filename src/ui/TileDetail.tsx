// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { BIOMES } from '../gen/biomes';
import type { EdgeType } from '../gen/edges';
import { parseHexKey } from '../core/hex';
import { useApp } from '../state/store';
import type { Board } from '../gen/board';

const EDGE_LABEL: Record<EdgeType, string> = {
  land: 'Land',
  water: 'Water',
  shore: 'Shore',
  path: 'Path',
};

/**
 * The card that appears over the stage when a tile is picked.
 *
 * Its edge tags are the one place colour is allowed in the chrome, because they are the one
 * thing you have to read rather than look at: they are the contract with the six neighbours,
 * and they decide what a tile will and will not agree to build at each seam.
 */
export function TileDetail({ board, selected }: { board: Board; selected: string | null }) {
  const { plan, remove } = useApp();
  if (!selected) return null;

  const coord = parseHexKey(selected);
  const placed = board.tiles.find((t) => t.tile.coord.q === coord.q && t.tile.coord.r === coord.r);
  if (!placed) return null;

  const counted = new Set(placed.tile.edges);

  return (
    <div className="overlay overlay-br">
      <div className="floating detail">
        <h3>{BIOMES[placed.tile.biome].name}</h3>
        <p className="coord">
          {coord.q}, {coord.r} · {placed.tile.placements.length} props
        </p>

        <div className="tags">
          {(['land', 'water', 'shore', 'path'] as EdgeType[])
            .filter((type) => counted.has(type))
            .map((type) => (
              <span key={type} className={`tag tag-${type}`}>
                {EDGE_LABEL[type]} {placed.tile.edges.filter((e) => e === type).length}
              </span>
            ))}
        </div>

        <button
          className="btn"
          onClick={() => remove(coord)}
          disabled={Object.keys(plan).length <= 1}
        >
          Remove tile
        </button>
      </div>
    </div>
  );
}
