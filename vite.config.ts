// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Vitest owns this config's `test` block, and from Vitest 4 its own defineConfig is what
// types it. Importing from 'vite' instead typechecks everything except the tests.
import { defineConfig } from 'vitest/config';
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
 * A custom domain serves the site from the domain's own root, not from `/<repo>/`.
 *
 * `public/CNAME` is the file GitHub Pages reads to keep the domain attached across deploys,
 * so it is also what decides the base path here — one file rather than two settings that can
 * disagree. They did disagree: with the domain attached and the base still `/biome-generator/`,
 * every asset request went to a path that does not exist there, Pages answered each one with
 * its 404 *page*, and the browser reported a stylesheet that 404s and a module blocked for
 * being `text/html`. Both were the same missing prefix.
 */
const cnamePath = fileURLToPath(new URL('./public/CNAME', import.meta.url));
const customDomain = existsSync(cnamePath) ? readFileSync(cnamePath, 'utf8').trim() : '';

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
  base: repositoryName && !desktop && !customDomain ? `/${repositoryName}/` : '/',
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
