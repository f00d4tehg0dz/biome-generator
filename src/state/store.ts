// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { create } from 'zustand';
import { DEFAULT_R, hexKey, type Axial } from '../core/hex';
import { BIOME_IDS, type BiomeId } from '../gen/biomes';
import {
  decodeBoard,
  encodeBoard,
  singleTile,
  type BoardPlan,
  type BoardPreset,
} from '../gen/board';
import type { ConnectorKind } from '../kit/connectors';
import type { ColourCount } from '../palette/reduce';

/** Short, readable, shareable. UI-side only, never used inside generation. */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

export type View = 'board' | 'kit';

/** Which panel the sidebar is showing. Deliberately not in the URL: it is where you are
 *  looking, not what is on the board, and a shared link should open on the board. */
export type Tab = 'design' | 'colours' | 'export';

/** Tile circumradius bounds in millimetres. Much below 30 and the kit starts culling props. */
export const MIN_TILE_R = 30;
export const MAX_TILE_R = 90;

/**
 * What undo restores.
 *
 * The board, the seed and the biome, and nothing else. Which panel is open, which tile is
 * selected, and how many filaments you are costing it for are not edits to the model, and
 * having undo walk back through them makes it useless for the thing it is for: the tile you
 * just dropped in the wrong cell.
 */
interface Snapshot {
  seed: string;
  biome: BiomeId;
  plan: BoardPlan;
}

/** Deep enough for a session's fiddling, short enough to stay honest about memory. */
const HISTORY_LIMIT = 60;

interface AppState extends Snapshot {
  colourCount: ColourCount;
  /** Tile circumradius in millimetres. */
  R: number;
  view: View;
  tab: Tab;
  connectors: ConnectorKind;
  /** Hex key of the selected tile, if any. */
  selected: string | null;
  past: Snapshot[];
  future: Snapshot[];

  setSeed(seed: string): void;
  setBiome(biome: BiomeId): void;
  setColourCount(count: ColourCount): void;
  setR(R: number): void;
  setView(view: View): void;
  setTab(tab: Tab): void;
  setConnectors(kind: ConnectorKind): void;
  reroll(): void;

  place(coord: Axial): void;
  remove(coord: Axial): void;
  select(coord: Axial | null): void;
  clearBoard(): void;
  applyPreset(preset: BoardPreset): void;
  undo(): void;
  redo(): void;
}

const INITIAL_BIOME: BiomeId = 'meadow';

const DEFAULTS = {
  seed: 'meadow1',
  biome: INITIAL_BIOME,
  colourCount: 4 as ColourCount,
  R: DEFAULT_R,
  view: 'board' as View,
  tab: 'design' as Tab,
  connectors: 'dovetail' as ConnectorKind,
  plan: singleTile(INITIAL_BIOME),
  selected: null as string | null,
  past: [] as Snapshot[],
  future: [] as Snapshot[],
};

export const useApp = create<AppState>((set, get) => ({
  ...DEFAULTS,
  ...restore(),

  setSeed: (seed) => set({ seed }),
  setColourCount: (colourCount) => set({ colourCount }),
  setR: (R) => set({ R: clampR(R) }),
  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab }),
  setConnectors: (connectors) => set({ connectors }),

  // A re-roll rebuilds every tile on the board, so it is an edit like any other.
  reroll: () => set((state) => ({ ...commit(state), seed: randomSeed() })),

  // Changing the biome retints the selected tile, or the whole board when nothing is picked.
  setBiome: (biome) =>
    set((state) => ({
      ...commit(state),
      biome,
      plan:
        state.selected && state.plan[state.selected]
          ? { ...state.plan, [state.selected]: biome }
          : Object.fromEntries(Object.keys(state.plan).map((key) => [key, biome])),
    })),

  place: (coord) =>
    set((state) => ({
      ...commit(state),
      plan: { ...state.plan, [hexKey(coord)]: state.biome },
      selected: hexKey(coord),
    })),

  remove: (coord) =>
    set((state) => {
      const plan = { ...state.plan };
      delete plan[hexKey(coord)];
      return { ...commit(state), plan, selected: null };
    }),

  select: (coord) => {
    const key = coord ? hexKey(coord) : null;
    const { plan } = get();
    set(key && plan[key] ? { selected: key, biome: plan[key]! } : { selected: null });
  },

  clearBoard: () =>
    set((state) => ({ ...commit(state), plan: singleTile(state.biome), selected: null })),

  applyPreset: (preset) =>
    set((state) => ({ ...commit(state), plan: preset.layout(state.biome), selected: null })),

  undo: () =>
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return {};
      return {
        ...previous,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
        // The tile you had picked may not exist in the board you have gone back to.
        selected: state.selected && previous.plan[state.selected] ? state.selected : null,
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return {};
      return {
        ...next,
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
        selected: state.selected && next.plan[state.selected] ? state.selected : null,
      };
    }),
}));

function snapshot(state: AppState): Snapshot {
  return { seed: state.seed, biome: state.biome, plan: state.plan };
}

/** The history half of an edit: remember where we were, and drop any redo branch. */
function commit(state: AppState): Pick<AppState, 'past' | 'future'> {
  return { past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT), future: [] };
}

function clampR(R: number): number {
  return Math.min(MAX_TILE_R, Math.max(MIN_TILE_R, Math.round(R)));
}

/**
 * `?seed=x&colours=2&r=60&board=0.0.0_1.0.2`. Any state is reproducible from a link, which
 * is also what the screenshot checks run against.
 */
function fromUrl(): Partial<AppState> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) return {};

  const seed = params.get('seed');
  const biome = params.get('biome');
  const colours = Number(params.get('colours'));
  const R = Number(params.get('r'));
  const view = params.get('view');
  const board = params.get('board');
  const connectors = params.get('connectors');
  const chosen =
    biome && (BIOME_IDS as readonly string[]).includes(biome) ? (biome as BiomeId) : null;

  return {
    ...(seed ? { seed } : {}),
    ...(chosen ? { biome: chosen } : {}),
    ...(colours >= 1 && colours <= 4 ? { colourCount: colours as ColourCount } : {}),
    ...(R >= MIN_TILE_R && R <= MAX_TILE_R ? { R } : {}),
    ...(view === 'kit' || view === 'board' ? { view: view as View } : {}),
    ...(connectors === 'none' || connectors === 'dovetail'
      ? { connectors: connectors as ConnectorKind }
      : {}),
    ...(board ? { plan: decodeBoard(board) ?? singleTile(chosen ?? INITIAL_BIOME) } : {}),
  };
}

const STORAGE_KEY = 'biome-generator/board';

/**
 * What to open on.
 *
 * A link wins: someone who followed one expects to see what the person who sent it saw.
 * Failing that, the last board of the last session, so closing the tab is not the same as
 * throwing the work away.
 */
function restore(): Partial<AppState> {
  const url = fromUrl();
  if (Object.keys(url).length > 0) return url;
  if (typeof window === 'undefined') return {};

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as Partial<Shared>) : null;
    if (!parsed?.plan || Object.keys(parsed.plan).length === 0) return {};
    return { ...parsed, R: clampR(parsed.R ?? DEFAULT_R) };
  } catch {
    // A stale or hand-edited entry is not worth failing to start over.
    return {};
  }
}

/** The state a link and a saved session both carry: the board, and how it gets printed. */
export type Shared = Pick<
  AppState,
  'seed' | 'biome' | 'colourCount' | 'connectors' | 'R' | 'plan'
>;

/** Keeps the address bar in step with the board, so a link always reproduces what is shown. */
export function boardUrl(state: Shared): string {
  const params = new URLSearchParams({
    seed: state.seed,
    colours: String(state.colourCount),
    connectors: state.connectors,
    board: encodeBoard(state.plan),
  });
  // Only when it differs, so the common link stays short enough to read.
  if (state.R !== DEFAULT_R) params.set('r', String(state.R));
  return `?${params.toString()}`;
}

export function saveSession(state: Shared): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing, a full quota, storage switched off. None of which should stop the
    // app doing the thing it was actually asked to do.
  }
}
