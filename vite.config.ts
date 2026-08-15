// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages serves a project site from `/<repo>/`, so the bundle needs that base. Both
 * values are derived from `GITHUB_REPOSITORY` (`owner/repo`, set by Actions) rather than
 * hardcoded, so a fork or a rename keeps working without editing this file.
 */
const HOME_REPOSITORY = 'f00d4tehg0dz/biome-generator';

const repository = process.env.GITHUB_REPOSITORY ?? '';
const [, repositoryName] = repository.split('/');

/**
 * The desktop shell serves the same bundle from the app's own root, so it always wants
 * `/`, including when the app is built by Actions, where GITHUB_REPOSITORY would otherwise
 * send it looking for its assets under a path that only exists on Pages.
 *
 * Tauri sets `TAURI_ENV_PLATFORM` for its build hooks; `DESKTOP` says the same thing out
 * loud, which is what the release workflow uses rather than relying on the hook's env.
 */
const desktop = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.DESKTOP);

export default defineConfig({
  base: repositoryName && !desktop ? `/${repositoryName}/` : '/',
  plugins: [react()],
  // Tauri watches this port and fails rather than silently attaching to the wrong server.
  server: { strictPort: desktop },
  clearScreen: false,
  define: {
    // The AGPL asks that people using this over a network can get at its source. The link is
    // baked in at build time so the deployed page always points at the commit it came from,
    // falling back to this repository when built outside Actions, since an unbuilt
    // fallback would leave a hosted copy pointing at nothing in particular.
    __SOURCE_URL__: JSON.stringify(`https://github.com/${repository || HOME_REPOSITORY}`),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
