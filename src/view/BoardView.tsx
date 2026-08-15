// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { DoubleSide, NoToneMapping, Shape, ShapeGeometry } from 'three';
import { Capture } from './capture';
import { Lighting } from './Lighting';
import { axialToWorld, hexCorners, hexKey, type Axial } from '../core/hex';
import { mergeSolidsBy } from '../kit/solid';
import { GRADE } from '../kit/solid';
import type { Board, PlacedTile } from '../gen/board';
import type { BiomeId } from '../gen/biomes';
import type { ResolvedPalette } from '../palette/reduce';

const DEG = Math.PI / 180;

/** Flat hex outline used for the "place a tile here" markers. */
function useHexPlate(R: number) {
  return useMemo(() => {
    const shape = new Shape();
    hexCorners(R * 0.94).forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    shape.closePath();
    const geometry = new ShapeGeometry(shape);
    return geometry;
  }, [R]);
}

function TileMeshes({
  placed,
  paletteFor,
  selected,
  onSelect,
}: {
  placed: PlacedTile;
  paletteFor: (biome: BiomeId) => ResolvedPalette;
  selected: boolean;
  onSelect: (coord: Axial) => void;
}) {
  const palette = paletteFor(placed.tile.biome);
  const groups = useMemo(() => {
    const merged = mergeSolidsBy(placed.tile.solids, (solid) =>
      palette.indexOfMaterial(solid.material),
    );
    return [...merged.entries()].sort((a, b) => a[0] - b[0]);
  }, [placed, palette]);

  useEffect(() => {
    return () => {
      for (const [, geometry] of groups) geometry.dispose();
    };
  }, [groups]);

  return (
    <group position={[placed.origin[0], placed.origin[1], 0]}>
      {groups.map(([index, geometry]) => (
        <mesh
          key={index}
          geometry={geometry}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(placed.tile.coord);
          }}
        >
          <meshLambertMaterial
            color={palette.colours[index]}
            flatShading
            emissive={selected ? '#2b3a2f' : '#000000'}
          />
        </mesh>
      ))}
    </group>
  );
}

function Opening({
  coord,
  R,
  geometry,
  onPlace,
}: {
  coord: Axial;
  R: number;
  geometry: ShapeGeometry;
  onPlace: (coord: Axial) => void;
}) {
  const [x, y] = axialToWorld(coord, R);
  return (
    <mesh
      geometry={geometry}
      position={[x, y, GRADE * 0.35]}
      onClick={(event) => {
        event.stopPropagation();
        onPlace(coord);
      }}
    >
      <meshBasicMaterial color="#8FA090" transparent opacity={0.16} side={DoubleSide} />
    </mesh>
  );
}

export function BoardView({
  board,
  paletteFor,
  R,
  selected,
  onSelect,
  onPlace,
}: {
  board: Board;
  paletteFor: (biome: BiomeId) => ResolvedPalette;
  R: number;
  selected: string | null;
  onSelect: (coord: Axial | null) => void;
  onPlace: (coord: Axial) => void;
}) {
  const plate = useHexPlate(R);
  useEffect(() => () => plate.dispose(), [plate]);

  // Frame the whole board, not just the first tile.
  const extent = useMemo(() => {
    let reach = R;
    for (const { origin } of board.tiles) reach = Math.max(reach, Math.hypot(...origin) + R);
    for (const coord of board.openings) {
      reach = Math.max(reach, Math.hypot(...axialToWorld(coord, R)) + R * 0.6);
    }
    return reach;
  }, [board, R]);

  const distance = extent * 3.1 + 80;

  return (
    <Canvas
      // Preserved so the drawing buffer is still there to read when a PNG is asked for.
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{
        fov: 30,
        near: 1,
        far: 8000,
        position: [
          distance * Math.sin(52 * DEG) * Math.sin(35 * DEG),
          distance * Math.cos(52 * DEG),
          distance * Math.sin(52 * DEG) * Math.cos(35 * DEG),
        ],
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = NoToneMapping;
      }}
      onPointerMissed={() => onSelect(null)}
    >
      <Capture />
      <Lighting />
      {/* Author space is Z-up millimetres; the viewport is the only place that rotates. */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -GRADE / 2, 0]}>
        {board.tiles.map((placed) => (
          <TileMeshes
            key={hexKey(placed.tile.coord)}
            placed={placed}
            paletteFor={paletteFor}
            selected={selected === hexKey(placed.tile.coord)}
            onSelect={onSelect}
          />
        ))}
        {board.openings.map((coord) => (
          <Opening
            key={hexKey(coord)}
            coord={coord}
            R={R}
            geometry={plate}
            onPlace={onPlace}
          />
        ))}
      </group>
      <OrbitControls
        enablePan
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={25 * DEG}
        maxPolarAngle={70 * DEG}
        minDistance={R * 2}
        maxDistance={extent * 9 + 200}
      />
    </Canvas>
  );
}
