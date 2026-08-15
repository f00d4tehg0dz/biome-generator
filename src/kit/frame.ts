// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Where a prop sits. Builders author geometry in convenient local coordinates and hand it
 * a Frame; the Frame bakes position, rotation and scale into every vertex, so nothing
 * survives to export as a transform (per the `3d-modeling` skill: apply transforms before
 * export, always).
 *
 * Scale is uniform by construction. A non-uniform scale would change the angle of every
 * sloped face, which would silently break the 45° self-support guarantee.
 */

import { Matrix4, Vector3 } from 'three';
import type { Vec2 } from '../core/hex';

const scratch = new Vector3();

export class Frame {
  private constructor(private readonly matrix: Matrix4) {}

  static origin(): Frame {
    return new Frame(new Matrix4());
  }

  /** A frame at a point on the tile surface, turned about Z and uniformly scaled. */
  static at(at: Vec2, z: number, rotation = 0, scale = 1): Frame {
    const m = new Matrix4().makeTranslation(at[0], at[1], z);
    if (rotation !== 0) m.multiply(new Matrix4().makeRotationZ(rotation));
    if (scale !== 1) m.multiply(new Matrix4().makeScale(scale, scale, scale));
    return new Frame(m);
  }

  translate(x: number, y: number, z: number): Frame {
    return this.compose(new Matrix4().makeTranslation(x, y, z));
  }

  rotateX(angle: number): Frame {
    return this.compose(new Matrix4().makeRotationX(angle));
  }

  rotateY(angle: number): Frame {
    return this.compose(new Matrix4().makeRotationY(angle));
  }

  rotateZ(angle: number): Frame {
    return this.compose(new Matrix4().makeRotationZ(angle));
  }

  /** Uniform only. See the note above. */
  scale(factor: number): Frame {
    return this.compose(new Matrix4().makeScale(factor, factor, factor));
  }

  /** Local millimetres to world millimetres. */
  p(x: number, y: number, z: number): [number, number, number] {
    scratch.set(x, y, z).applyMatrix4(this.matrix);
    return [scratch.x, scratch.y, scratch.z];
  }

  /** The uniform scale this frame applies, for feature-size checks. */
  get uniformScale(): number {
    return scratch.setFromMatrixColumn(this.matrix, 0).length();
  }

  private compose(local: Matrix4): Frame {
    return new Frame(this.matrix.clone().multiply(local));
  }
}
