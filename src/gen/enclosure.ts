// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Walls at the seams, for the biomes that are rooms rather than places.
 *
 * This is the one piece of tile geometry that comes from the edge contract rather than from
 * the surface. A dungeon is not a floor with stone scattered on it, it is a room: what makes
 * it read as one is a wall at every edge and a doorway where a corridor crosses. Since both
 * neighbours already agree on the type of the seam between them, they also agree on which of
 * them is a wall and which is a way through, and the two halves line up without either tile
 * knowing anything about the other.
 *
 * Walls stand just inside the boundary, so two tiles side by side read as one thick wall
 * with a seam down it. They start at the walkable surface and never touch the stone band, so
 * the dovetails underneath are unaffected.
 *
 * Nothing here overhangs. The doorway is a gap rather than an arch, the gate leaf is folded
 * flat against the wall the way a real one stands open, and the torch bracket and the chain
 * both rise at 45° or steeper off the face they are fixed to.
 */

import { edgeCorners, type Vec2 } from '../core/hex';
import type { Rng } from '../core/rng';
import { beam, lathe } from '../kit/primitives';
import { Frame } from '../kit/frame';
import { EMBED, GRADE, MeshBuilder, MIN_DURABLE, type Solid } from '../kit/solid';
import type { EdgeType } from './edges';
import { PATH_DROP } from './surface';

/** Thickness of a wall, in millimetres. Two of them back to back make the seam. */
const THICKNESS = 3.2;
/** Height above the walkable surface. */
const HEIGHT = 15;
/** How far the wall's centre line sits inside the tile boundary. */
const INSET = THICKNESS / 2 + 0.6;
/** Clear width of a doorway. Wide enough to see a corridor run through it. */
const DOOR = 17;

export interface EnclosureParams {
  rng: Rng;
  R: number;
  edges: readonly EdgeType[];
}

/**
 * A wall run per edge, with a doorway where the seam carries a corridor.
 *
 * The wall is built from the edge's own two corners rather than from an angle, so it meets
 * its neighbours at the hexagon's corners exactly and the six of them close a room.
 */
export function buildWalls(params: EnclosureParams): Solid[] {
  const { rng, R, edges } = params;

  // Everything starts below the corridor floor, not below the room floor. A doorway stands
  // where a path crosses, and a path is cut PATH_DROP into the surface: measured from the
  // room, the gate's bars and its rail begin a millimetre above the ground they are supposed
  // to be standing on. Sinking the lot deeper costs nothing, since what is below the floor
  // is inside the slab.
  const base = GRADE - PATH_DROP - EMBED;
  const solids: Solid[] = [];

  for (let direction = 0; direction < 6; direction++) {
    const [a, b] = edgeCorners(direction, R);
    // Pull the chord inward along its own normal, and shorten it a touch at each end so two
    // adjacent runs overlap at the corner rather than meeting on an exact edge, which would
    // weld into a non-manifold join.
    const inward = normal(a, b);
    // Inset from the edge, then trimmed at both ends. Inset alone is not enough: a wall is a
    // box, and at a 120° corner the box's outer corner swings back across the neighbouring
    // edge and out of the tile by about a millimetre. Trimming leaves the six runs just shy
    // of meeting, which is what a room built of six straight walls looks like anyway.
    const chord = distance(a, b);
    const trim = THICKNESS * 0.75;
    const start = shift(lerp(a, b, trim / chord), inward, INSET);
    const end = shift(lerp(b, a, trim / chord), inward, INSET);
    const length = distance(start, end);
    const frame = Frame.at([0, 0], base, 0, 1);

    if (edges[direction] === 'path') {
      // Two returns either side of the opening. Each is its own solid: they never touch.
      const jamb = (length - DOOR) / 2;
      if (jamb > THICKNESS) {
        for (const [index, from] of [start, end].entries()) {
          const towards = from === start ? end : start;
          const to = lerp(from, towards, jamb / length);
          solids.push(
            wall(frame, `tile.wall.${direction}.${index}`, from, to, HEIGHT * rng.range(0.9, 1)),
          );
        }
        solids.push(...doorway(frame, rng, direction, mid(start, end), inward));
      }
      continue;
    }

    const height = HEIGHT * rng.range(0.88, 1);
    solids.push(wall(frame, `tile.wall.${direction}`, start, end, height));
    solids.push(...fixtures(frame, rng, direction, start, end, inward, height));
  }

  return solids;
}

/** One straight run, sitting on the surface and sunk into it by a nozzle width. */
function wall(frame: Frame, name: string, from: Vec2, to: Vec2, height: number): Solid {
  const b = new MeshBuilder();
  const along = distance(from, to);
  const centre = mid(from, to);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);

  beam(b, frame, {
    from: [centre[0] - (Math.cos(angle) * along) / 2, centre[1] - (Math.sin(angle) * along) / 2, height / 2],
    to: [centre[0] + (Math.cos(angle) * along) / 2, centre[1] + (Math.sin(angle) * along) / 2, height / 2],
    width: THICKNESS,
    height,
  });

  return b.build(name, 'stone');
}

/**
 * A barred gate standing open, and the posts it hangs on.
 *
 * Open is not a pose here, it is the only way the bars print without a lintel over them and
 * the only way the doorway stays passable on a board you actually push tiles around on. The
 * leaf folds back against the wall, which is where a gate that has been kicked open sits.
 */
function doorway(frame: Frame, rng: Rng, direction: number, centre: Vec2, inward: Vec2): Solid[] {
  const solids: Solid[] = [];
  const along: Vec2 = [-inward[1], inward[0]];
  const height = HEIGHT * 0.92;
  const posts = new MeshBuilder();

  // Set in from the wall line by their own half width. `beam` builds a vertical box aligned
  // to the world axes, not to the wall it stands in, so on a seam that runs at 60° a post
  // sitting exactly on the line puts a corner a millimetre outside the tile.
  for (const side of [-1, 1]) {
    const at = shift(shift(centre, along, (side * DOOR) / 2), inward, THICKNESS * 0.7);
    beam(posts, frame, {
      from: [at[0], at[1], 0],
      to: [at[0], at[1], height],
      width: THICKNESS + 0.4,
      height: THICKNESS + 0.4,
    });
  }
  solids.push(posts.build(`tile.door.${direction}.posts`, 'stone'));

  // The leaf: vertical bars tied at the floor, folded back against the wall.
  //
  // Tied at the *floor* rather than at the top, which is where a gate's rail belongs and is
  // also the only place it can go. A top rail crosses the gaps between the bars with nothing
  // under it, and tile geometry gets no bridge allowance: props declare `bridges` and are
  // measured for it, a wall does not. On the floor the rail is supported along its whole
  // length and the bars stand in it.
  const swing = rng.chance(0.5) ? 1 : -1;
  const hinge = shift(centre, along, (swing * DOOR) / 2);
  const bars = new MeshBuilder();
  const count = 4;
  const leaf = DOOR * 0.62;

  // Folded *into* the room. Folded the other way it swings out past the tile boundary and
  // over the neighbour, which is both wrong and invisible: the tests that would have caught
  // it all built tiles with default edges, and a tile with no corridor has no gate.
  for (let i = 0; i < count; i++) {
    const at = shift(hinge, inward, 1.6 + (i * leaf) / (count - 1));
    beam(bars, frame, {
      from: [at[0], at[1], 0],
      to: [at[0], at[1], height * 0.86],
      width: MIN_DURABLE + 0.2,
      height: MIN_DURABLE + 0.2,
    });
  }
  solids.push(bars.build(`tile.door.${direction}.bars`, 'rock'));

  // Its own solid, so the bars bury their feet in it and it buries its ends in them. Inside
  // one solid neither would count as buried, because the enclosure test excludes the solid a
  // face belongs to.
  const rail = new MeshBuilder();
  const railFrom = shift(hinge, inward, 1.2);
  const railTo = shift(hinge, inward, 2.0 + leaf);
  beam(rail, frame, {
    from: [railFrom[0], railFrom[1], 0.9],
    to: [railTo[0], railTo[1], 0.9],
    width: 2.6,
    height: 1.8,
  });
  solids.push(rail.build(`tile.door.${direction}.rail`, 'rock'));

  return solids;
}

/**
 * What hangs on a wall: a torch in a bracket, and a length of chain.
 *
 * Both are fixed to the inner face and both lean into it, so the wall carries them and
 * neither needs anything under it. The torch is the only warm thing in a grey room, which is
 * why it is worth the solids it costs.
 *
 * Named `fixture.` rather than `tile.` on purpose. Everything called `tile.` is a prism, and
 * a test holds it to that: the landform is self-supporting by construction rather than by
 * inspection, which is a stronger guarantee than measuring it afterwards. A torch is not a
 * prism and never will be, so it says what it is and gets checked the way a prop is.
 */
function fixtures(
  frame: Frame,
  rng: Rng,
  direction: number,
  from: Vec2,
  to: Vec2,
  inward: Vec2,
  height: number,
): Solid[] {
  const solids: Solid[] = [];
  const along = distance(from, to);
  if (along < 18) return solids;

  if (rng.chance(0.75)) {
    const at = lerp(from, to, rng.range(0.32, 0.68));
    const face = shift(at, inward, THICKNESS / 2 + 0.7);
    const post = new MeshBuilder();

    // Standing against the wall rather than jutting out of it. A true sconce is a bracket
    // cantilevered off the face, and every version of that leaves a downward face out in the
    // air: the bracket's own end cap tips 40° off horizontal, and a cup wide enough to bury
    // it has a wider underside of its own. A torch that reaches the floor has neither
    // problem, and from the one angle a tile is ever looked at, it reads the same.
    // One roll, used twice. Rolling the post's height here and assuming a fixed fraction for
    // the flame left the flame hanging above the post whenever the roll came in low.
    const top = height * rng.range(0.6, 0.72);
    beam(post, frame, {
      from: [face[0], face[1], 0],
      to: [face[0], face[1], top],
      width: MIN_DURABLE + 0.3,
      height: MIN_DURABLE + 0.3,
    });
    solids.push(post.build(`fixture.torch.${direction}.post`, 'wood'));

    // The flame starts narrower than the post it stands in, so its underside is buried, then
    // flares within MAX_FLARE before closing to a point.
    const flame = new MeshBuilder();
    lathe(flame, frame.translate(face[0], face[1], 0), {
      profile: [
        { r: 0.8, z: top - 0.8 },
        { r: 2.0, z: top + 1.4 },
        { r: 1.7, z: top + 2.6 },
        { r: 0, z: top + rng.range(4.2, 5.4) },
      ],
      sides: 6,
      phase: rng.range(0, Math.PI),
    });
    solids.push(flame.build(`fixture.torch.${direction}.flame`, 'blossom'));
  }

  if (rng.chance(0.45)) {
    const at = lerp(from, to, rng.range(0.15, 0.85));
    const face = shift(at, inward, THICKNESS / 2 - 0.5);
    const top = height * rng.range(0.6, 0.82);
    const STEP = 1.4;
    const LINK = 2.1;

    // Alternate links go in alternate solids, and that is not tidiness. A face buried inside
    // the *same* solid is not exempt from the overhang analysis, because the enclosure test
    // asks what a face is buried in and excludes the solid it belongs to. One chain built as
    // one solid therefore reports a ceiling at every link, all of them a millimetre across
    // and every one of them real if the links did not in fact overlap. Two interleaved
    // solids each bury their ends in the other, which is the same rule `Parts` exists for.
    const strands = [new MeshBuilder(), new MeshBuilder()];
    for (let i = 0; i * STEP < top; i++) {
      beam(strands[i % 2]!, frame, {
        from: [face[0], face[1], i * STEP],
        to: [face[0], face[1], Math.min(i * STEP + LINK, top)],
        width: MIN_DURABLE + 0.1,
        height: 1.8,
      });
    }
    for (const [index, strand] of strands.entries()) {
      if (!strand.isEmpty) solids.push(strand.build(`fixture.chain.${direction}.${index}`, 'rock'));
    }
  }


  return solids;
}

function normal(a: Vec2, b: Vec2): Vec2 {
  const centre = mid(a, b);
  const length = Math.hypot(centre[0], centre[1]) || 1;
  return [-centre[0] / length, -centre[1] / length];
}

function mid(a: Vec2, b: Vec2): Vec2 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function shift(p: Vec2, direction: Vec2, distance: number): Vec2 {
  return [p[0] + direction[0] * distance, p[1] + direction[1] * distance];
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
