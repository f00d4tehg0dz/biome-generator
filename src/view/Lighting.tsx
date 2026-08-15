// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Deliberately flat lighting. The references have almost no cast shadow; objects read by
 * their own facet shading only. See docs/art-direction.md §3.
 *
 * Intensities are in three.js r155+ physical units, which are roughly π× the classic
 * values the art direction quotes. They are tuned so an up-facing surface renders close to
 * its raw palette colour, with side faces stepping down by about 25%.
 */
export function Lighting() {
  return (
    <>
      <hemisphereLight args={['#C6D2C4', '#A8AE96', 2.7]} />
      <directionalLight color="#FFF6E4" intensity={1.6} position={[-40, 60, 35]} />
      <ambientLight intensity={0.4} />
    </>
  );
}
