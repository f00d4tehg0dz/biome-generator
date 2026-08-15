// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { useEffect, useState } from 'react';
import { checkBoard, type PrintCheck as Report } from '../check/board';
import type { Board } from '../gen/board';

/**
 * The print check, next to the export button because that is when the answer matters.
 *
 * Run on demand rather than on every edit. It takes about ten milliseconds on a seven-tile
 * board, so cost is not the reason. The reason is that a verdict which reappears on its
 * own after every click stops being read. Any change to the board clears it instead, because
 * a result about a board you have since edited is worse than no result.
 */
export function PrintCheck({ board }: { board: Board }) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setReport(null), [board]);

  const run = () => {
    setBusy(true);
    // Let the button repaint first; the check holds the main thread while it runs.
    setTimeout(() => {
      try {
        setReport(checkBoard(board));
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  return (
    <div className="card">
      <h2>
        Print check
        {report && <span className="meta">{report.solids} solids</span>}
      </h2>

      {report ? (
        <ul className="checks">
          {report.sections.map((section) => (
            <li key={section.id} className={`check check-${section.severity}`}>
              <span className="check-mark" aria-hidden="true" />
              <div>
                <strong>{section.label}</strong>
                <p>{section.summary}</p>
                {section.offenders.length > 0 && (
                  <p className="check-offenders">{section.offenders.join(', ')}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">
          Watertight meshes, the 45° overhang rule, minimum feature size, and whether every
          solid actually rests on something. Run it on the board as it stands.
        </p>
      )}

      <button className="btn" style={{ width: '100%' }} onClick={run} disabled={busy}>
        {busy ? 'Checking…' : report ? 'Check again' : 'Run print check'}
      </button>

      {report && !report.ok && (
        <p className="notice">
          The export is not blocked (a slicer will still open this), but the flagged geometry
          is what will go wrong on the plate.
        </p>
      )}
    </div>
  );
}
