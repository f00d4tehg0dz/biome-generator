// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Where an export ends up.
 *
 * In a browser that can only ever be the downloads folder, one file at a time. The desktop
 * build is here for exactly this: a print run is a set of files that belong together (four
 * per-colour STLs, or one 3MF per plate) and dropping them into a pile of downloads to be
 * fished out later is the part of the web version that is genuinely worse.
 *
 * The Tauri modules load lazily. They are dead weight in the web bundle otherwise, and
 * importing them at the top level would pull the IPC layer into a page that has no IPC.
 */

import type { ExportedFile } from './index';
import { download } from './index';

export type SaveOutcome =
  | { kind: 'downloaded'; files: number }
  | { kind: 'saved'; files: number; where: string }
  | { kind: 'cancelled' };

/** True inside the desktop shell. The web build never sees this global. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function saveFiles(files: readonly ExportedFile[]): Promise<SaveOutcome> {
  if (files.length === 0) return { kind: 'cancelled' };
  if (!isDesktop()) {
    for (const file of files) download(file);
    return { kind: 'downloaded', files: files.length };
  }

  const [{ open, save }, { writeFile, mkdir }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);

  // One file is a save dialog; several are a folder, because naming them one by one is not
  // a decision anyone wants to make four times.
  if (files.length === 1) {
    const file = files[0]!;
    const path = await save({
      defaultPath: file.name,
      filters: [filterFor(file.name)],
    });
    if (!path) return { kind: 'cancelled' };
    await writeFile(path, file.data);
    return { kind: 'saved', files: 1, where: basename(path) };
  }

  const directory = await open({ directory: true, multiple: false, title: 'Save the plates in' });
  if (typeof directory !== 'string') return { kind: 'cancelled' };

  await mkdir(directory, { recursive: true });
  for (const file of files) {
    await writeFile(`${directory}/${file.name}`, file.data);
  }
  return { kind: 'saved', files: files.length, where: basename(directory) };
}

function filterFor(name: string) {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const named: Record<string, string> = {
    stl: 'STL mesh',
    '3mf': '3MF model',
    zip: 'STL bundle',
    png: 'PNG image',
  };
  return { name: named[extension] ?? 'File', extensions: [extension] };
}

/** The last segment of a path, for saying where something went without saying all of it. */
function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path;
}
