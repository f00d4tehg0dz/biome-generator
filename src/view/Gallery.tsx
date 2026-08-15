// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { NoToneMapping } from 'three';
import { Capture } from './capture';
import { Lighting } from './Lighting';
import { PROP_FAMILIES, PROPS, type PropId } from '../kit';
import { soloContext } from '../kit/prop';
import { makeRng } from '../core/rng';
import { mergeSolidsBy, type Solid } from '../kit/solid';
import { extrudePolygon } from '../kit/prism';
import { radialPolygon } from '../core/polygon';
import type { ResolvedPalette } from '../palette/reduce';

const CELL = 34;
const DEG = Math.PI / 180;

interface Entry {
  id: PropId;
  x: number;
  y: number;
  solids: Solid[];
}

/**
 * Every prop in the kit, on its own pad, laid out by family. The acceptance gate for M2 is
 * partly automated (manifold, overhang, feature size, budget) and partly this: the shapes
 * have to read as what they are.
 */
const COLUMNS = 7;

function layout(seed: string): { entries: Entry[]; width: number; depth: number } {
  const entries: Entry[] = [];
  let row = 0;
  let widest = 0;

  // Families start on their own row and wrap, so the grid stays roughly square and each
  // family reads as a block.
  for (const family of PROP_FAMILIES) {
    family.ids.forEach((id, index) => {
      const column = index % COLUMNS;
      const y = -(row + Math.floor(index / COLUMNS)) * CELL;
      entries.push({
        id,
        x: column * CELL,
        y,
        solids: PROPS[id].build(
          soloContext(makeRng(id, seed), {
            at: [column * CELL, y],
            rotation: makeRng(id, seed, 'spin').range(0, Math.PI * 2),
          }),
        ),
      });
      widest = Math.max(widest, column + 1);
    });
    row += Math.ceil(family.ids.length / COLUMNS);
  }

  return { entries, width: widest * CELL, depth: row * CELL };
}

/** A small ground pad under each prop, so props read as standing on something. */
function pads(entries: readonly Entry[], seed: string): Solid[] {
  return entries.map((entry, i) =>
    extrudePolygon(
      radialPolygon(makeRng(seed, 'pad', i), {
        centre: [entry.x, entry.y],
        radius: CELL * 0.42,
        wobble: 0.08,
        sides: 9,
      }),
      { name: `gallery.pad.${i}`, material: 'grass', z0: -2.4, z1: 0 },
    ),
  );
}

export function Gallery({ palette, seed }: { palette: ResolvedPalette; seed: string }) {
  const { entries, width, depth } = useMemo(() => layout(seed), [seed]);

  const groups = useMemo(() => {
    const all = [...pads(entries, seed), ...entries.flatMap((entry) => entry.solids)];
    const merged = mergeSolidsBy(all, (solid) => palette.indexOfMaterial(solid.material));
    return [...merged.entries()].sort((a, b) => a[0] - b[0]);
  }, [entries, palette, seed]);

  useEffect(() => {
    return () => {
      for (const [, geometry] of groups) geometry.dispose();
    };
  }, [groups]);

  const distance = Math.hypot(width, depth) * 1.35 + 80;

  return (
    <Canvas
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{
        fov: 30,
        near: 1,
        far: 6000,
        position: [
          distance * Math.sin(58 * DEG) * Math.sin(20 * DEG),
          distance * Math.cos(58 * DEG),
          distance * Math.sin(58 * DEG) * Math.cos(20 * DEG),
        ],
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = NoToneMapping;
      }}
    >
      <Capture />
      <Lighting />
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <group position={[-width / 2 + CELL / 2, depth / 2 - CELL / 2, 0]}>
          {groups.map(([index, geometry]) => (
            <mesh key={index} geometry={geometry}>
              <meshLambertMaterial color={palette.colours[index]} flatShading />
            </mesh>
          ))}
        </group>
      </group>
      <OrbitControls
        enablePan
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={20 * DEG}
        maxPolarAngle={78 * DEG}
      />
    </Canvas>
  );
}
