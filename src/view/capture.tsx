// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Rendering the viewport to a PNG.
 *
 * The sidebar is outside the Canvas and the renderer lives inside it, so the two need a
 * meeting point. A module-level slot is enough: there is one canvas on screen at a time, and
 * routing a WebGL context through application state would put a thing that must not be
 * serialised somewhere everything else is.
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

type Capture = () => string | null;

let capture: Capture | null = null;

/** Renders the current view to a PNG data URL, or null when no canvas is mounted. */
export function captureViewport(): string | null {
  return capture?.() ?? null;
}

/** Mounted inside a Canvas: hands the sidebar a way to photograph it. */
export function Capture() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    capture = () => {
      // Draw first. The canvas is preserved between frames for this reason, but a fresh
      // render also means the picture is of the board as it is now, not as it was when the
      // last frame happened to be scheduled.
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    };
    return () => {
      capture = null;
    };
  }, [gl, scene, camera]);

  return null;
}
