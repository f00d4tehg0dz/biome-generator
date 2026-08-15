// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import type { Tab } from '../state/store';
import { ColoursIcon, DesignIcon, ExportIcon, MarkIcon, SourceIcon } from './icons';

/** Defined by Vite at build time; falls back for `vite dev` and tests. */
const SOURCE_URL = typeof __SOURCE_URL__ === 'string' ? __SOURCE_URL__ : 'https://github.com';

const TABS: { id: Tab; label: string; icon: () => React.ReactElement }[] = [
  { id: 'design', label: 'Design', icon: DesignIcon },
  { id: 'colours', label: 'Colours', icon: ColoursIcon },
  { id: 'export', label: 'Export', icon: ExportIcon },
];

/**
 * The three things you do here, in the order you do them: build the board, decide how many
 * filaments it costs, send it to the printer. Splitting them up keeps each panel to a
 * screenful; the single scrolling column had the export button below the fold.
 */
export function Rail({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <nav className="rail" aria-label="Sections">
      <div className="mark" title="Biome Generator">
        <MarkIcon />
      </div>

      <div className="rail-tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className="rail-tab"
            role="tab"
            aria-selected={tab === id}
            aria-controls="sidebar"
            onClick={() => onTab(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="spacer" />

      {/* AGPL §13: anyone using this over a network is entitled to its source, so the link
          stays reachable from every panel rather than living at the foot of one of them. */}
      <a className="rail-link" href={SOURCE_URL} target="_blank" rel="noreferrer" title="Source code">
        <SourceIcon />
      </a>
    </nav>
  );
}
