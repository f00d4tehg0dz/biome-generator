// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { Fragment, useState } from 'react';
import { BIOME_LIST } from '../gen/biomes';
import type { BiomeId } from '../gen/biomes';
import { hexExtent } from '../core/hex';
import { SLOT_NAMES } from '../palette/slots';
import type { ColourCount, ResolvedPalette } from '../palette/reduce';
import { MAX_TILE_R, MIN_TILE_R, useApp, type Tab } from '../state/store';
import { BOARD_PRESETS, type Board } from '../gen/board';
import { PROP_IDS } from '../kit';
import { ExportSection } from './ExportSection';
import { LinkIcon, RedoIcon, RerollIcon, UndoIcon } from './icons';
import { SHORTCUTS } from './shortcuts';

const COUNTS: ColourCount[] = [1, 2, 3, 4];

/**
 * The sidebar. One panel at a time, chosen from the rail, rather than one column holding
 * everything: the whole lot stacked put the export button below the fold on a laptop.
 */
export function Panel({
  board,
  palette,
  paletteSource,
  tab,
}: {
  board: Board;
  palette: ResolvedPalette;
  paletteSource: string;
  tab: Tab;
}) {
  return (
    <div className="sidebar" id="sidebar" role="tabpanel">
      {tab === 'design' && <DesignPanel board={board} />}
      {tab === 'colours' && <ColoursPanel palette={palette} paletteSource={paletteSource} />}
      {tab === 'export' && <ExportSection board={board} paletteSource={paletteSource} />}

      <div className="colophon">
        <p>
          Geometry is authored in print space: Z-up, millimetres, bottom at zero. What you see
          is what gets sliced.
        </p>
        <p>
          Free software under the{' '}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">
            AGPL-3.0
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function DesignPanel({ board }: { board: Board }) {
  const {
    seed,
    biome,
    connectors,
    plan,
    R,
    selected,
    view,
    past,
    future,
    setSeed,
    setBiome,
    setConnectors,
    setR,
    reroll,
    clearBoard,
    applyPreset,
    undo,
    redo,
  } = useApp();
  const tileCount = Object.keys(plan).length;
  const [width, depth] = hexExtent(R);

  return (
    <>
      <div className="card">
        <h2>Seed</h2>
        <div className="row">
          <input
            id="seed"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            spellCheck={false}
            aria-label="Seed"
          />
          <button className="btn btn-icon" onClick={reroll}>
            <RerollIcon />
            Re-roll
          </button>
        </div>
        <p className="hint">
          Every tile derives from this and its own coordinates, so the same seed always builds
          the same board.
        </p>
      </div>

      <div className="card">
        <h2>
          Biome
          <span className="meta">{selected ? 'selected tile' : 'whole board'}</span>
        </h2>
        <select
          id="biome"
          value={biome}
          onChange={(e) => setBiome(e.target.value as BiomeId)}
          aria-label="Biome"
        >
          {BIOME_LIST.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <p className="hint">{BIOME_LIST.find((b) => b.id === biome)?.blurb}</p>
      </div>

      <div className="card">
        <h2>
          Board
          <span className="meta">
            {tileCount} {tileCount === 1 ? 'tile' : 'tiles'}
          </span>
        </h2>

        <select
          value={BOARD_PRESETS.find((p) => p.tiles === tileCount)?.id ?? ''}
          onChange={(e) => {
            const preset = BOARD_PRESETS.find((p) => p.id === e.target.value);
            if (preset) applyPreset(preset);
          }}
          aria-label="Board layout"
        >
          {/* A hand-built board matches no preset, and saying so beats showing whichever one
              happens to have the same tile count. */}
          <option value="">Custom</option>
          {BOARD_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} ({preset.tiles} {preset.tiles === 1 ? 'tile' : 'tiles'})
            </option>
          ))}
        </select>

        <div className="row row-actions" style={{ marginTop: 10 }}>
          <button className="btn btn-icon" onClick={undo} disabled={past.length === 0}>
            <UndoIcon />
            Undo
          </button>
          <button className="btn btn-icon" onClick={redo} disabled={future.length === 0}>
            <RedoIcon />
            Redo
          </button>
          <ShareButton />
        </div>

        <button
          className="btn"
          style={{ width: '100%', marginTop: 10 }}
          onClick={clearBoard}
          disabled={tileCount <= 1}
        >
          Clear board
        </button>
        <p className="hint">
          {selected
            ? 'Click a faint hex to add a neighbour, or change the biome above to retint this tile.'
            : 'Click a faint hex to add a tile. Click a tile to select it.'}
        </p>
      </div>

      <div className="card">
        <h2>
          Tile
          <span className="meta">
            {width.toFixed(0)} × {depth.toFixed(0)} mm
          </span>
        </h2>
        <input
          type="range"
          min={MIN_TILE_R}
          max={MAX_TILE_R}
          step={5}
          value={R}
          onChange={(e) => setR(Number(e.target.value))}
          aria-label="Tile size"
        />
        <p className="hint">
          {R} mm circumradius. Props are culled as this shrinks; below about 35 mm the
          smallest of them stop clearing the minimum feature size.
        </p>

        <span className="field-label">Connectors</span>
        <div className="segmented">
          <button
            aria-pressed={connectors === 'dovetail'}
            onClick={() => setConnectors('dovetail')}
          >
            Dovetail
          </button>
          <button aria-pressed={connectors === 'none'} onClick={() => setConnectors('none')}>
            None
          </button>
        </div>
      </div>

      <div className="card">
        <h2>{view === 'kit' ? 'Kit' : 'Model'}</h2>
        {view === 'kit' ? (
          <dl className="stats">
            <dt>Props</dt>
            <dd>{PROP_IDS.length}</dd>
          </dl>
        ) : (
          <dl className="stats">
            <dt>Props placed</dt>
            <dd>{board.tiles.reduce((sum, t) => sum + t.tile.placements.length, 0)}</dd>
            <dt>Water tiles</dt>
            <dd>{board.tiles.filter((t) => t.tile.water).length}</dd>
            <dt>Path tiles</dt>
            <dd>{board.tiles.filter((t) => t.tile.path).length}</dd>
          </dl>
        )}
      </div>

      <div className="card">
        <h2>Keyboard</h2>
        <dl className="stats">
          {SHORTCUTS.map((shortcut) => (
            <Fragment key={shortcut.keys}>
              <dt>{shortcut.does}</dt>
              <dd>
                <kbd>{shortcut.keys}</kbd>
              </dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </>
  );
}

/**
 * The address bar already holds a link that reproduces the board; this is for the case
 * where that is true and nobody knows it.
 */
function ShareButton() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused outright. The link is still in the address bar.
    }
  };

  return (
    <button className="btn btn-icon" onClick={copy}>
      <LinkIcon />
      {copied ? 'Copied' : 'Link'}
    </button>
  );
}

function ColoursPanel({
  palette,
  paletteSource,
}: {
  palette: ResolvedPalette;
  paletteSource: string;
}) {
  const { colourCount, setColourCount } = useApp();

  return (
    <div className="card">
      <h2>
        Filaments
        <span className="meta">{paletteSource}</span>
      </h2>
      <div className="segmented">
        {COUNTS.map((n) => (
          <button key={n} aria-pressed={n === colourCount} onClick={() => setColourCount(n)}>
            {n}
          </button>
        ))}
      </div>

      <ul className="swatches">
        {palette.colours.map((colour, i) => (
          <li key={i}>
            <span className="chip" style={{ background: colour }} />
            <span className="chip-label">
              <strong>{i + 1}</strong> {palette.labels[i]!.map((s) => SLOT_NAMES[s]).join(' + ')}
            </span>
            <code>{colour.toUpperCase()}</code>
          </li>
        ))}
      </ul>

      <p className="hint">
        Taken from{' '}
        {paletteSource};
      </p>
    </div>
  );
}
