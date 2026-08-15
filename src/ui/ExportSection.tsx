// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { useMemo, useState } from 'react';
import { useApp } from '../state/store';
import { paletteBiome, type Board } from '../gen/board';
import { exportBoard, layoutPlates, PRINTERS, type ExportFormat } from '../export';
import { isDesktop, saveFiles, type SaveOutcome } from '../export/save';
import { captureViewport } from '../view/capture';
import { PrintCheck } from './PrintCheck';

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  {
    id: 'bundle',
    label: 'STL bundle',
    hint: 'One STL per filament, plus a README. Works in every slicer, so start here.',
  },
  {
    id: '3mf',
    label: '3MF',
    hint: 'Colours and units travel with the file. Loads as one part per filament.',
  },
  {
    id: '3mf-bambu',
    label: '3MF (Bambu)',
    hint: 'Adds Bambu/Orca metadata so the filament map fills itself in. Unverified, so keep the bundle as a fallback.',
  },
  { id: 'stl', label: 'Single STL', hint: 'One colour, one solid. Universal.' },
];

export function ExportSection({ board, paletteSource }: { board: Board; paletteSource: string }) {
  const { seed, colourCount, connectors, plan } = useApp();
  const [printerId, setPrinterId] = useState(PRINTERS[1]!.id);
  const [format, setFormat] = useState<ExportFormat>('bundle');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);

  const printer = PRINTERS.find((p) => p.id === printerId) ?? PRINTERS[1]!;
  const layout = useMemo(() => layoutPlates(board, printer), [board, printer]);
  const chosen = FORMATS.find((f) => f.id === format)!;

  /** A picture of the model, for a listing or a print log. Not a print file. */
  const savePng = async () => {
    const image = captureViewport();
    if (!image) return;
    await saveFiles([{ name: `biome_${seed}.png`, data: decodeDataUrl(image) }]);
  };

  const run = () => {
    setBusy(true);
    setOutcome(null);
    // Let the button repaint before the main thread goes away for a second.
    setTimeout(async () => {
      try {
        setOutcome(
          await saveFiles(
            exportBoard({
              board,
              paletteBiome: paletteBiome(plan),
              colourCount,
              printer,
              seed,
              connectors,
              format,
            }),
          ),
        );
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  return (
    <>
      <div className="card">
        <h2>Printer</h2>
        <select
          id="printer"
          value={printerId}
          onChange={(e) => setPrinterId(e.target.value)}
          aria-label="Printer"
        >
          {PRINTERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.bed[0]}×{p.bed[1]} mm)
            </option>
          ))}
        </select>

        <dl className="stats" style={{ marginTop: 13 }}>
          <dt>Plates</dt>
          <dd>{layout.plates.length}</dd>
          <dt>Per plate</dt>
          <dd>{layout.perPlate}</dd>
          <dt>Tile cell</dt>
          <dd>
            {layout.cell[0].toFixed(0)} × {layout.cell[1].toFixed(0)} mm
          </dd>
        </dl>

        {layout.tooLarge && (
          <p className="notice">
            A tile is larger than this bed. Pick a bigger printer, or reduce the tile size.
          </p>
        )}
      </div>

      {/* Before the download button, not after it: the point of the check is to be read
          while there is still a decision to make. */}
      <PrintCheck board={board} />

      <div className="card">
        <h2>Format</h2>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          aria-label="Export format"
        >
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>

        <p className="hint">{chosen.hint}</p>

        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Writing…' : `${isDesktop() ? 'Save' : 'Download'} ${chosen.label}`}
        </button>
        <p className="hint">
          {describe(outcome) ?? (
            <>
              Colours come from {paletteSource}. Everything is millimetres, sitting on the bed,
              and needs no scaling or rotation.
            </>
          )}
        </p>

        <button className="btn" style={{ width: '100%' }} onClick={savePng}>
          Save the view as PNG
        </button>
      </div>
    </>
  );
}

/** What just happened, in place of the hint. Nothing to say before the first export. */
function describe(outcome: SaveOutcome | null): string | null {
  if (!outcome) return null;
  switch (outcome.kind) {
    case 'saved':
      return `${outcome.files} ${outcome.files === 1 ? 'file' : 'files'} written to ${outcome.where}.`;
    case 'downloaded':
      return `${outcome.files} ${outcome.files === 1 ? 'file' : 'files'} sent to your downloads.`;
    case 'cancelled':
      return 'Nothing written.';
  }
}

/** The canvas hands back a data URL; everything downstream of here deals in bytes. */
function decodeDataUrl(url: string): Uint8Array {
  const binary = atob(url.slice(url.indexOf(',') + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
