// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { useEffect, useMemo } from 'react';
import { Panel } from './ui/Panel';
import { Rail } from './ui/Rail';
import { TileDetail } from './ui/TileDetail';
import { BoardView } from './view/BoardView';
import { Gallery } from './view/Gallery';
import { generateBoard, paletteBiome } from './gen/board';
import { BIOMES, type BiomeId } from './gen/biomes';
import { boundsOf } from './kit/solid';
import { resolvePalette, type ResolvedPalette } from './palette/reduce';
import { boardUrl, saveSession, useApp } from './state/store';
import { useShortcuts } from './ui/shortcuts';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function App() {
  const { seed, biome, colourCount, R, view, tab, connectors, plan, selected } = useApp();
  const { select, place, setView, setTab } = useApp();
  const webgl = useMemo(hasWebGL, []);
  useShortcuts();

  const board = useMemo(
    () => generateBoard({ seed, R, connectors, plan }),
    [seed, R, connectors, plan],
  );

  // One palette for the board. You print with four filaments, not four per tile, but each
  // tile keeps its own binding, so what a colour *means* still varies from tile to tile.
  const source = useMemo(() => BIOMES[paletteBiome(plan)], [plan]);
  const paletteFor = useMemo(() => {
    const cache = new Map<BiomeId, ResolvedPalette>();
    return (biome: BiomeId): ResolvedPalette => {
      const hit = cache.get(biome);
      if (hit) return hit;
      const resolved = resolvePalette(
        source.palette,
        BIOMES[biome].binding,
        colourCount,
        source.reduction,
      );
      cache.set(biome, resolved);
      return resolved;
    };
  }, [source, colourCount]);

  const palette = paletteFor(source.id);

  // Measured off the built solids rather than from the tile count, so it is the real printed
  // extent, connectors and all.
  const size = useMemo(() => {
    const bounds = boundsOf(board.tiles.flatMap((t) => t.tile.solids));
    return bounds.max.map((v, i) => v - bounds.min[i]!);
  }, [board]);

  // Keep the address bar in step, so the link in the bar always reproduces what is shown,
  // and keep the same state where the next session can find it.
  useEffect(() => {
    const shared = { seed, biome, colourCount, connectors, R, plan };
    window.history.replaceState(null, '', boardUrl(shared));
    saveSession(shared);
  }, [seed, biome, colourCount, connectors, R, plan]);

  return (
    <div className="app">
      <Rail tab={tab} onTab={setTab} />
      <Panel board={board} palette={palette} paletteSource={source.name} tab={tab} />

      <main className="stage">
        {webgl ? (
          view === 'kit' ? (
            <Gallery palette={palette} seed={seed} />
          ) : (
            <BoardView
              board={board}
              paletteFor={paletteFor}
              R={R}
              selected={selected}
              onSelect={(coord) => select(coord)}
              onPlace={(coord) => place(coord)}
            />
          )
        ) : (
          <div className="fallback">
            <p>This browser has no WebGL support, so the 3D preview can’t run.</p>
            <p>Generation and export still work, they don’t need the GPU.</p>
          </div>
        )}

        {/* What you are looking at is a control on the view, not on the model, so it lives on
            the view, the way a map keeps its own layer switch. */}
        <div className="overlay overlay-tl">
          <div className="floating">
            <div className="segmented segmented-solid">
              <button aria-pressed={view === 'board'} onClick={() => setView('board')}>
                Board
              </button>
              <button aria-pressed={view === 'kit'} onClick={() => setView('kit')}>
                Kit
              </button>
            </div>
          </div>
        </div>

        {view === 'board' && (
          <>
            <div className="overlay overlay-bl">
              <div className="floating chip-stats">
                <span>
                  <b>{board.triangles.toLocaleString()}</b> triangles
                </span>
                <span>
                  <b>
                    {size[0]!.toFixed(0)} × {size[1]!.toFixed(0)} × {size[2]!.toFixed(1)}
                  </b>{' '}
                  mm
                </span>
              </div>
            </div>
            <TileDetail board={board} selected={selected} />
          </>
        )}
      </main>
    </div>
  );
}
