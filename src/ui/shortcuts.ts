// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Keyboard shortcuts, for the things you do over and over: re-roll, undo, drop the tile you
 * just placed, flip between one and four filaments to see what survives the reduction.
 *
 * Listed in the Design panel rather than hidden, because a shortcut nobody knows about is
 * only a way to surprise someone who leant on the keyboard.
 */

import { useEffect } from 'react';
import { parseHexKey } from '../core/hex';
import { useApp } from '../state/store';
import type { ColourCount } from '../palette/reduce';

export const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: 'R', does: 'Re-roll the seed' },
  { keys: '1 – 4', does: 'Filament count' },
  { keys: '⌫', does: 'Remove the selected tile' },
  { keys: 'Esc', does: 'Deselect' },
  { keys: 'B / K', does: 'Board or kit view' },
  { keys: '⌘Z', does: 'Undo, ⇧⌘Z to redo' },
];

export function useShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Never take a key away from something being typed into.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;

      const state = useApp.getState();
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod) return; // leave every other chord to the browser

      switch (event.key) {
        case 'Escape':
          state.select(null);
          return;
        case 'Backspace':
        case 'Delete':
          // The board is never empty: there is nothing to look at, and nothing to print.
          if (state.selected && Object.keys(state.plan).length > 1) {
            event.preventDefault();
            state.remove(parseHexKey(state.selected));
          }
          return;
      }

      switch (event.key.toLowerCase()) {
        case 'r':
          state.reroll();
          return;
        case 'b':
          state.setView('board');
          return;
        case 'k':
          state.setView('kit');
          return;
        case '1':
        case '2':
        case '3':
        case '4':
          state.setColourCount(Number(event.key) as ColourCount);
          return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
