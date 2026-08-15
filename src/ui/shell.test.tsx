// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Shell smoke tests.
 *
 * Not a look test: nothing here can tell you the thing is well designed. What it does catch
 * is a panel that throws, and the AGPL §13 obligation: the offer of source has to be
 * reachable, and splitting one scrolling column into three tabs is exactly the kind of change
 * that leaves it stranded on a panel nobody opens.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Panel } from './Panel';
import { Rail } from './Rail';
import { TileDetail } from './TileDetail';
import { generateBoard, paletteBiome, singleTile } from '../gen/board';
import { BIOMES } from '../gen/biomes';
import { resolvePalette } from '../palette/reduce';
import type { Tab } from '../state/store';

const TABS: Tab[] = ['design', 'colours', 'export'];

const plan = singleTile('meadow');
const board = generateBoard({ seed: 'ui', R: 50, connectors: 'dovetail', plan });
const source = BIOMES[paletteBiome(plan)];
const palette = resolvePalette(source.palette, source.binding, 4, source.reduction);

const sidebar = (tab: Tab) =>
  renderToStaticMarkup(
    <Panel board={board} palette={palette} paletteSource={source.name} tab={tab} />,
  );

describe('shell', () => {
  it('renders a panel for every rail tab', () => {
    for (const tab of TABS) expect(sidebar(tab), tab).toContain('class="card"');
  });

  it('offers the source from the rail, and the licence from every panel', () => {
    // AGPL §13. The rail is on screen whichever panel is open, which is the point of putting
    // the source link there rather than at the foot of one of them.
    expect(renderToStaticMarkup(<Rail tab="design" onTab={() => {}} />)).toContain('github.com');
    for (const tab of TABS) expect(sidebar(tab), tab).toContain('agpl-3.0');
  });

  it('marks the open tab, and only that one', () => {
    for (const tab of TABS) {
      const html = renderToStaticMarkup(<Rail tab={tab} onTab={() => {}} />);
      expect(html.match(/aria-selected="true"/g), tab).toHaveLength(1);
    }
  });

  it('tags the selected tile with the edge types it carries, and no others', () => {
    const html = renderToStaticMarkup(
      <TileDetail board={board} selected={Object.keys(plan)[0]!} />,
    );
    const edges = board.tiles[0]!.tile.edges;

    for (const type of new Set(edges)) expect(html, type).toContain(`tag-${type}`);
    // A tag is a claim about the seam contract, so an absent type must not appear.
    for (const type of ['land', 'water', 'shore', 'path'] as const) {
      if (!edges.includes(type)) expect(html, type).not.toContain(`tag-${type}`);
    }
  });

  it('shows nothing over the stage when no tile is selected', () => {
    expect(renderToStaticMarkup(<TileDetail board={board} selected={null} />)).toBe('');
  });
});
