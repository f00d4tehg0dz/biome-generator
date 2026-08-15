# Biome Generator

**[Try it →](https://f00d4tehg0dz.github.io/biome-generator/)**

Generate low-poly pastel hexagonal biome tiles in the browser, connect them into a board, and export them for 3D printing. Single colour, or multi-colour for AMS / CFS systems with 1 to 4 filaments.

<p align="center">
  <img src="/screencaps/biome-screencap.png" width="46%" alt="Meadow biome Single tile" />
  <img src="/screencaps/biome-screencap-2.png" width="46%" alt="Meadow biome more tiles" />
  <img src="/screencaps/biome-screencap-3.png" width="46%" alt="Lake biome more tiles" />
  <img src="/screencaps/biome-screencap-4.png" width="46%" alt="Coastal biome more tiles" />
</p>

---

## Features

- **Generates** a hex tile of a chosen biome from a seeded terraced ground, water, paths, trees, rocks, benches, huts, fences.
- **Connects** tiles on a hex grid. Neighbours agree on their shared edge, so grass meets grass, water meets water, and a path continues across the seam, stuff like that.
- **Exports** for print: STL, multi-material 3MF (Bambu/Orca flavour), and a per-colour STL bundle with a generated README.
- **Checks** before it exports: checks for watertight meshes, the 45° overhang rule thing, minimum feature size, and whether every solid actually rests on something.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run test
npm run typecheck
```

## Desktop

```bash
rustup default stable
npm run desktop
npm run desktop:build
```

## Testing 

Write a real export to disk
```
npx vite-node src/export/smoke.report.ts -- ./out
```

## License

Copyright (C) 2026 Adrian Chrysanthou.