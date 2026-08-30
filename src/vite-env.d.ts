// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou

// Declares the things Vite lets you import that TypeScript otherwise knows nothing about,
// `./styles.css` among them. The tsconfig pins `types` to keep stray globals out, which
// stops this being picked up on its own.
/// <reference types="vite/client" />

/** Repository URL, baked in at build time. See vite.config.ts and the AGPL §13 note. */
declare const __SOURCE_URL__: string;
