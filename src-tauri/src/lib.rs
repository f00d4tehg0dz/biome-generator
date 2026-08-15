// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou

//! The desktop shell.
//!
//! Deliberately thin. The generator, the geometry and the exporters are the same TypeScript
//! the web build runs, and nothing here is allowed to grow into a second code path. All the
//! shell adds is the one thing a browser cannot do: write a set of export files where the
//! user asked for them, rather than dropping them one at a time into a downloads folder.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running biome generator");
}
