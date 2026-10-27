import {
  EXPANSION_NUMBER_TOKENS,
  EXPANSION_TERRAIN_DISTRIBUTION,
  STANDARD_NUMBER_TOKENS,
  STANDARD_TERRAIN_DISTRIBUTION
} from './config';
import { nextPrngInt, shuffleWithPrng } from './prng';
import {
  BoardState,
  Edge,
  GameRulesConfig,
  Harbor,
  HarborType,
  HexTile,
  TerrainType,
  Vertex
} from './types';

export const HEX_RADIUS = 100;
const SQRT3 = Math.sqrt(3);

export interface AxialCoord {
  q: number;
  r: number;
}

export const STANDARD_HEX_COORDS: AxialCoord[] = [
  // Row r = -2 (3 hexes: 0, 1, 2)
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  // Row r = -1 (4 hexes: 3, 4, 5, 6)
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  // Row r = 0 (5 hexes: 7, 8, 9, 10, 11)
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  // Row r = 1 (4 hexes: 12, 13, 14, 15)
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  // Row r = 2 (3 hexes: 16, 17, 18)
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 }
];

// 5-6 Player Expansion board: 30 hexes in a (near-)hexagonal shape — row lengths
// 3,4,5,6,5,4,3, verified by directly counting the hex tiles in the official rulebook's
// own assembly diagram (Catan 5-6 Player Extension, "Illustration B"), not guessed. Unlike
// STANDARD_HEX_COORDS there's no official fixed spiral/letter->value token mapping sourced
// for this board (see generateStandardBoard's doc comment), so number tokens are placed via
// a balanced shuffle instead of literally replaying the unknown official sequence.
// Each row's q-range is chosen so that avg(q) + r/2 is the SAME constant (0.5) for every
// row — that's what a hex row's true horizontal center is in pixel space (axialToPixel's
// x = sqrt3*(q + r/2)), so picking q-ranges without checking this consistently is exactly
// what produces a sheared/skewed silhouette instead of a clean hexagon (caught by visually
// comparing a rendered game to the rulebook: the first version here had centers that
// drifted per row instead of lining up). Board generation also re-centers the whole board
// around (0,0) afterward (see generateStandardBoard), so the absolute offset (0.5 here)
// doesn't matter — only that every row shares the same one.
export const EXPANSION_HEX_COORDS: AxialCoord[] = [
  // Row r = -3 (3 hexes)
  { q: 1, r: -3 }, { q: 2, r: -3 }, { q: 3, r: -3 },
  // Row r = -2 (4 hexes)
  { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 }, { q: 3, r: -2 },
  // Row r = -1 (5 hexes)
  { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 }, { q: 3, r: -1 },
  // Row r = 0 (6 hexes)
  { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 },
  // Row r = 1 (5 hexes)
  { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 1 },
  // Row r = 2 (4 hexes)
  { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 }, { q: 1, r: 2 },
  // Row r = 3 (3 hexes)
  { q: -2, r: 3 }, { q: -1, r: 3 }, { q: 0, r: 3 }
];

// Expansion harbor frame — 11 harbors (vs the classic board's 9): 6 generic (3:1) + the same
// 5 resource-specific (2:1) ones, reflecting the bigger board's longer coastline.
export const EXPANSION_HARBOR_TYPES: HarborType[] = [
  'sheep', 'generic', 'wheat', 'generic', 'ore', 'generic',
  'wood', 'generic', 'generic', 'brick', 'generic'
];

/**
 * Clockwise outer ring of 12 hex indices in STANDARD_HEX_COORDS.
 * Even indices (0, 2, 4, 6, 8, 10) are the 6 outer corners of the island.
 */
const OUTER_RING_CW_INDICES = [0, 1, 2, 6, 11, 15, 18, 17, 16, 12, 7, 3];

/**
 * Clockwise inner ring of 6 hex indices in STANDARD_HEX_COORDS,
 * aligned so INNER_RING_CW_INDICES[cornerIdx] steps directly inward after completing the outer ring.
 */
const INNER_RING_CW_INDICES = [4, 5, 10, 14, 13, 8];

/**
 * Center hex index (0, 0) in STANDARD_HEX_COORDS.
 */
const CENTER_HEX_INDEX = 9;

/**
 * Official Catan alphabetical token sequence A -> R:
 * A=5, B=2, C=6, D=3, E=8, F=10, G=9, H=12, I=11,
 * J=4, K=8, L=10, M=9, N=4, O=5, P=6, Q=3, R=11
 */
export const OFFICIAL_ALPHABETICAL_TOKENS: number[] = [
  5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11
];

/**
 * Builds the 19-hex clockwise inward spiral order starting from one of the 6 outer corners (0..5).
 */
export function getClockwiseSpiralHexIndices(startCornerIndex: number): number[] {
  const corner = ((startCornerIndex % 6) + 6) % 6;
  const spiral: number[] = [];

  for (let k = 0; k < 12; k++) {
    spiral.push(OUTER_RING_CW_INDICES[(corner * 2 + k) % 12]!);
  }
  for (let k = 0; k < 6; k++) {
    spiral.push(INNER_RING_CW_INDICES[(corner + k) % 6]!);
  }
  spiral.push(CENTER_HEX_INDEX);
  return spiral;
}

// Fixed official harbor frame, never reshuffled: the real Catan board's harbor pieces sit
// in one unchanging arrangement every game (only the terrain/number tiles inside are
// randomized). Index 2 here lands on the coastal-edge slot nearest the top of the board
// (see the `step`-based slot selection below), so going clockwise from there this reads
// ore, generic(3:1), wood, generic(3:1), generic(3:1), brick, generic(3:1), sheep, wheat —
// matching the standard board with the ore 2:1 harbor anchored at the top.
export const STANDARD_HARBOR_TYPES: HarborType[] = [
  'sheep',
  'wheat',
  'ore',
  'generic',
  'wood',
  'generic',
  'generic',
  'brick',
  'generic'
];

export function axialToPixel(q: number, r: number, radius = HEX_RADIUS): { x: number; y: number } {
  const x = radius * SQRT3 * (q + r / 2);
  const y = radius * (3 / 2) * r;
  return {
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3))
  };
}

export function areHexesAdjacent(a: AxialCoord, b: AxialCoord): boolean {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r - (-b.q - b.r);
  return (
    (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2 === 1
  );
}

/**
 * Catan board generator. Terrain hexes are always placed in a shuffled clockwise inward
 * spiral (steps 1-2) — that part of the layout is purely cosmetic/positional and has no
 * gameplay effect either way. Number token assignment (step 3) depends on `scenario`:
 * - Classic board (default, 'random_balanced' `layoutMode`): the official rulebook
 *   algorithm — walk the SAME spiral order and place the 18 alphabetical tokens (A -> R) in
 *   sequence, skipping the Desert. This is the standard board setup and (as a property of
 *   that fixed sequence) never puts a 6 and an 8 on adjacent hexes. Not user-selectable —
 *   this is simply how the real board is always set up.
 * - Expansion board ('expansion' scenario): the real 5-6 Player Expansion also places its
 *   28 tokens in a fixed alphabetical sequence (A-Y, Za, Zb, Zc) along an outer-to-center
 *   spiral, for the same reason — but that exact letter->value mapping isn't published
 *   anywhere this could be sourced from, so this reproduces its actual *effect* instead:
 *   shuffle, then reject any arrangement with two 6s or two 8s adjacent, same as the real
 *   tokens guarantee.
 * - `layoutMode: 'random_pure'` (classic board only, not currently exposed in the UI):
 *   tokens independently shuffled with no adjacency constraint at all — kept as a tested,
 *   available building block, not offered as a player-facing choice since the real game
 *   doesn't have one here.
 */

export const SEAFARERS_SHORES_HEXES: { q: number; r: number; terrain: TerrainType; token: number | null }[] = [
  // North Islands (r = -3)
  { q: 0, r: -3, terrain: 'gold_field', token: 9 },
  { q: 1, r: -3, terrain: 'sea', token: null },
  { q: 3, r: -3, terrain: 'fields', token: 4 },
  { q: 4, r: -3, terrain: 'mountains', token: 10 },
  // Row r = -2
  { q: -1, r: -2, terrain: 'forest', token: 8 },
  { q: 0, r: -2, terrain: 'pasture', token: 5 },
  { q: 1, r: -2, terrain: 'sea', token: null },
  { q: 2, r: -2, terrain: 'sea', token: null },
  { q: 3, r: -2, terrain: 'gold_field', token: 6 },
  { q: 4, r: -2, terrain: 'sea', token: null },
  // Sea channel (r = -1)
  { q: -2, r: -1, terrain: 'sea', token: null },
  { q: -1, r: -1, terrain: 'sea', token: null },
  { q: 0, r: -1, terrain: 'sea', token: null },
  { q: 1, r: -1, terrain: 'sea', token: null },
  { q: 2, r: -1, terrain: 'sea', token: null },
  { q: 3, r: -1, terrain: 'sea', token: null },
  // Main Island North (r = 0)
  { q: -2, r: 0, terrain: 'hills', token: 5 },
  { q: -1, r: 0, terrain: 'forest', token: 3 },
  { q: 0, r: 0, terrain: 'fields', token: 11 },
  { q: 1, r: 0, terrain: 'pasture', token: 4 },
  { q: 2, r: 0, terrain: 'mountains', token: 8 },
  { q: 3, r: 0, terrain: 'hills', token: 10 },
  // Main Island Mid (r = 1)
  { q: -3, r: 1, terrain: 'pasture', token: 9 },
  { q: -2, r: 1, terrain: 'mountains', token: 6 },
  { q: -1, r: 1, terrain: 'desert', token: null },
  { q: 0, r: 1, terrain: 'forest', token: 2 },
  { q: 1, r: 1, terrain: 'fields', token: 5 },
  // Main Island South (r = 2)
  { q: -2, r: 2, terrain: 'forest', token: 10 },
  { q: -1, r: 2, terrain: 'pasture', token: 8 },
  { q: 0, r: 2, terrain: 'hills', token: 3 }
];

export const SEAFARERS_ISLANDS_HEXES: { q: number; r: number; terrain: TerrainType; token: number | null }[] = [
  // Top-West & Top-East Islands (r = -2)
  { q: -1, r: -2, terrain: 'forest', token: 9 },
  { q: 0, r: -2, terrain: 'pasture', token: 4 },
  { q: 1, r: -2, terrain: 'sea', token: null },
  { q: 3, r: -2, terrain: 'mountains', token: 6 },
  { q: 4, r: -2, terrain: 'fields', token: 10 },
  // Row r = -1
  { q: -3, r: -1, terrain: 'hills', token: 5 },
  { q: -2, r: -1, terrain: 'gold_field', token: 8 },
  { q: -1, r: -1, terrain: 'sea', token: null },
  { q: 0, r: -1, terrain: 'sea', token: null },
  { q: 1, r: -1, terrain: 'sea', token: null },
  { q: 2, r: -1, terrain: 'forest', token: 3 },
  { q: 3, r: -1, terrain: 'gold_field', token: 8 },
  // Sea channel (r = 0)
  { q: -3, r: 0, terrain: 'sea', token: null },
  { q: -2, r: 0, terrain: 'sea', token: null },
  { q: -1, r: 0, terrain: 'sea', token: null },
  { q: 0, r: 0, terrain: 'sea', token: null },
  { q: 1, r: 0, terrain: 'sea', token: null },
  { q: 2, r: 0, terrain: 'sea', token: null },
  { q: 3, r: 0, terrain: 'sea', token: null },
  // Bottom-West & Bottom-East Islands (r = 1)
  { q: -4, r: 1, terrain: 'mountains', token: 10 },
  { q: -3, r: 1, terrain: 'fields', token: 6 },
  { q: -2, r: 1, terrain: 'sea', token: null },
  { q: -1, r: 1, terrain: 'sea', token: null },
  { q: 0, r: 1, terrain: 'sea', token: null },
  { q: 1, r: 1, terrain: 'pasture', token: 5 },
  { q: 2, r: 1, terrain: 'hills', token: 9 },
  // Row r = 2
  { q: -3, r: 2, terrain: 'pasture', token: 3 },
  { q: -2, r: 2, terrain: 'forest', token: 11 },
  { q: -1, r: 2, terrain: 'sea', token: null },
  { q: 1, r: 2, terrain: 'gold_field', token: 4 },
  { q: 2, r: 2, terrain: 'fields', token: 2 }
];

// Authentic Seafarers: The Fog Island (Insula din Ceață) 5-6 player scenario (97 hexes, 9 rows)
export const SEAFARERS_FOG_HEXES: { q: number; r: number; terrain: TerrainType; token: number | null }[] = [
  { q: -2, r: -4, terrain: 'forest', token: 11 },
  { q: -1, r: -4, terrain: 'mountains', token: 8 },
  { q:  0, r: -4, terrain: 'sea', token: null },
  { q:  1, r: -4, terrain: 'fields', token: 3 },
  { q:  2, r: -4, terrain: 'hills', token: 8 },
  { q:  3, r: -4, terrain: 'mountains', token: 9 },
  { q:  4, r: -4, terrain: 'forest', token: 10 },
  { q:  5, r: -4, terrain: 'pasture', token: 4 },
  { q:  6, r: -4, terrain: 'sea', token: null },
  { q: -3, r: -3, terrain: 'hills', token: 6 },
  { q: -2, r: -3, terrain: 'hills', token: 9 },
  { q: -1, r: -3, terrain: 'fields', token: 10 },
  { q:  0, r: -3, terrain: 'sea', token: null },
  { q:  1, r: -3, terrain: 'pasture', token: 9 },
  { q:  2, r: -3, terrain: 'forest', token: 5 },
  { q:  3, r: -3, terrain: 'fields', token: 6 },
  { q:  4, r: -3, terrain: 'mountains', token: 3 },
  { q:  5, r: -3, terrain: 'hills', token: 11 },
  { q:  6, r: -3, terrain: 'sea', token: null },
  { q: -4, r: -2, terrain: 'fields', token: 5 },
  { q: -3, r: -2, terrain: 'pasture', token: 3 },
  { q: -2, r: -2, terrain: 'mountains', token: 4 },
  { q: -1, r: -2, terrain: 'sea', token: null },
  { q:  0, r: -2, terrain: 'sea', token: null },
  { q:  1, r: -2, terrain: 'sea', token: null },
  { q:  2, r: -2, terrain: 'sea', token: null },
  { q:  3, r: -2, terrain: 'sea', token: null },
  { q:  4, r: -2, terrain: 'sea', token: null },
  { q:  5, r: -2, terrain: 'fog', token: null },
  { q:  6, r: -2, terrain: 'sea', token: null },
  { q: -5, r: -1, terrain: 'forest', token: 9 },
  { q: -4, r: -1, terrain: 'sea', token: null },
  { q: -3, r: -1, terrain: 'sea', token: null },
  { q: -2, r: -1, terrain: 'sea', token: null },
  { q: -1, r: -1, terrain: 'sea', token: null },
  { q:  0, r: -1, terrain: 'fog', token: null },
  { q:  1, r: -1, terrain: 'fog', token: null },
  { q:  2, r: -1, terrain: 'fog', token: null },
  { q:  3, r: -1, terrain: 'sea', token: null },
  { q:  4, r: -1, terrain: 'fog', token: null },
  { q:  5, r: -1, terrain: 'fog', token: null },
  { q:  6, r: -1, terrain: 'sea', token: null },
  { q: -6, r:  0, terrain: 'sea', token: null },
  { q: -5, r:  0, terrain: 'sea', token: null },
  { q: -4, r:  0, terrain: 'fog', token: null },
  { q: -3, r:  0, terrain: 'fog', token: null },
  { q: -2, r:  0, terrain: 'sea', token: null },
  { q: -1, r:  0, terrain: 'fog', token: null },
  { q:  0, r:  0, terrain: 'sea', token: null },
  { q:  1, r:  0, terrain: 'fog', token: null },
  { q:  2, r:  0, terrain: 'sea', token: null },
  { q:  3, r:  0, terrain: 'sea', token: null },
  { q:  4, r:  0, terrain: 'sea', token: null },
  { q:  5, r:  0, terrain: 'sea', token: null },
  { q:  6, r:  0, terrain: 'sea', token: null },
  { q: -6, r:  1, terrain: 'mountains', token: 8 },
  { q: -5, r:  1, terrain: 'sea', token: null },
  { q: -4, r:  1, terrain: 'sea', token: null },
  { q: -3, r:  1, terrain: 'fog', token: null },
  { q: -2, r:  1, terrain: 'sea', token: null },
  { q: -1, r:  1, terrain: 'sea', token: null },
  { q:  0, r:  1, terrain: 'fog', token: null },
  { q:  1, r:  1, terrain: 'fog', token: null },
  { q:  2, r:  1, terrain: 'sea', token: null },
  { q:  3, r:  1, terrain: 'pasture', token: 5 },
  { q:  4, r:  1, terrain: 'mountains', token: 6 },
  { q:  5, r:  1, terrain: 'mountains', token: 10 },
  { q: -6, r:  2, terrain: 'forest', token: 4 },
  { q: -5, r:  2, terrain: 'sea', token: null },
  { q: -4, r:  2, terrain: 'sea', token: null },
  { q: -3, r:  2, terrain: 'pasture', token: 8 },
  { q: -2, r:  2, terrain: 'sea', token: null },
  { q: -1, r:  2, terrain: 'sea', token: null },
  { q:  0, r:  2, terrain: 'sea', token: null },
  { q:  1, r:  2, terrain: 'fields', token: 4 },
  { q:  2, r:  2, terrain: 'hills', token: 9 },
  { q:  3, r:  2, terrain: 'fields', token: 11 },
  { q:  4, r:  2, terrain: 'sea', token: null },
  { q: -6, r:  3, terrain: 'pasture', token: 9 },
  { q: -5, r:  3, terrain: 'sea', token: null },
  { q: -4, r:  3, terrain: 'hills', token: 11 },
  { q: -3, r:  3, terrain: 'forest', token: 5 },
  { q: -2, r:  3, terrain: 'hills', token: 4 },
  { q: -1, r:  3, terrain: 'sea', token: null },
  { q:  0, r:  3, terrain: 'sea', token: null },
  { q:  1, r:  3, terrain: 'pasture', token: 10 },
  { q:  2, r:  3, terrain: 'forest', token: 3 },
  { q:  3, r:  3, terrain: 'sea', token: null },
  { q: -6, r:  4, terrain: 'sea', token: null },
  { q: -5, r:  4, terrain: 'pasture', token: 12 },
  { q: -4, r:  4, terrain: 'mountains', token: 10 },
  { q: -3, r:  4, terrain: 'fields', token: 3 },
  { q: -2, r:  4, terrain: 'forest', token: 6 },
  { q: -1, r:  4, terrain: 'pasture', token: 5 },
  { q:  0, r:  4, terrain: 'sea', token: null },
  { q:  1, r:  4, terrain: 'fields', token: 8 },
  { q:  2, r:  4, terrain: 'sea', token: null },
];

export const WORLD_MAP_HEXES: { q: number; r: number; terrain: TerrainType; token: number | null }[] = [
  // Row -3: North America & Eurasia North
  { q: -1, r: -3, terrain: 'mountains', token: 8 },
  { q: 0, r: -3, terrain: 'forest', token: 4 },
  { q: 2, r: -3, terrain: 'sea', token: null },
  { q: 3, r: -3, terrain: 'forest', token: 5 },
  { q: 4, r: -3, terrain: 'mountains', token: 9 },
  { q: 5, r: -3, terrain: 'pasture', token: 10 },
  // Row -2: North America & Europe/Asia
  { q: -2, r: -2, terrain: 'hills', token: 6 },
  { q: -1, r: -2, terrain: 'gold_field', token: 9 },
  { q: 0, r: -2, terrain: 'sea', token: null },
  { q: 1, r: -2, terrain: 'hills', token: 3 },
  { q: 2, r: -2, terrain: 'fields', token: 6 },
  { q: 3, r: -2, terrain: 'forest', token: 8 },
  { q: 4, r: -2, terrain: 'fields', token: 11 },
  // Row -1: Central America, Atlantic, Med/Mid-East, Asia
  { q: -2, r: -1, terrain: 'pasture', token: 5 },
  { q: -1, r: -1, terrain: 'sea', token: null },
  { q: 0, r: -1, terrain: 'sea', token: null },
  { q: 1, r: -1, terrain: 'pasture', token: 2 },
  { q: 2, r: -1, terrain: 'desert', token: null },
  { q: 3, r: -1, terrain: 'mountains', token: 4 },
  { q: 4, r: -1, terrain: 'gold_field', token: 5 },
  // Row 0: South America, Atlantic, Africa, Indian Ocean, SE Asia
  { q: -3, r: 0, terrain: 'forest', token: 3 },
  { q: -2, r: 0, terrain: 'gold_field', token: 10 },
  { q: -1, r: 0, terrain: 'sea', token: null },
  { q: 0, r: 0, terrain: 'desert', token: null },
  { q: 1, r: 0, terrain: 'hills', token: 8 },
  { q: 2, r: 0, terrain: 'sea', token: null },
  { q: 3, r: 0, terrain: 'forest', token: 6 },
  // Row 1: South America South, South Atlantic, Africa South, Australia
  { q: -3, r: 1, terrain: 'fields', token: 8 },
  { q: -2, r: 1, terrain: 'sea', token: null },
  { q: -1, r: 1, terrain: 'pasture', token: 11 },
  { q: 0, r: 1, terrain: 'sea', token: null },
  { q: 1, r: 1, terrain: 'gold_field', token: 8 },
  { q: 2, r: 1, terrain: 'pasture', token: 4 },
  // Row 2: Southern Oceans & Australia
  { q: -2, r: 2, terrain: 'sea', token: null },
  { q: -1, r: 2, terrain: 'sea', token: null },
  { q: 0, r: 2, terrain: 'sea', token: null },
  { q: 1, r: 2, terrain: 'hills', token: 10 },
  { q: 2, r: 2, terrain: 'desert', token: null }
];

export function generateStandardBoard(
  prngState: number,
  layoutMode: GameRulesConfig['boardLayout'] = 'random_balanced',
  scenario: GameRulesConfig['boardScenario'] = 'classic'
): { board: BoardState; nextPrngState: number } {
  let state = prngState;
  const isCustomScenario =
    scenario === 'seafarers_shores' ||
    scenario === 'seafarers_islands' ||
    scenario === 'seafarers_fog' ||
    scenario === 'world_map';
  const isExpansion = scenario === 'expansion';

  let hexCoords: AxialCoord[];
  let terrainDistribution: TerrainType[];
  let customTerrains: TerrainType[] | null = null;
  let customTokens: (number | null)[] | null = null;

  if (scenario === 'seafarers_shores') {
    hexCoords = SEAFARERS_SHORES_HEXES.map((h) => ({ q: h.q, r: h.r }));
    customTerrains = SEAFARERS_SHORES_HEXES.map((h) => h.terrain);
    customTokens = SEAFARERS_SHORES_HEXES.map((h) => h.token);
    terrainDistribution = customTerrains;
  } else if (scenario === 'seafarers_islands') {
    hexCoords = SEAFARERS_ISLANDS_HEXES.map((h) => ({ q: h.q, r: h.r }));
    customTerrains = SEAFARERS_ISLANDS_HEXES.map((h) => h.terrain);
    customTokens = SEAFARERS_ISLANDS_HEXES.map((h) => h.token);
    terrainDistribution = customTerrains;
  } else if (scenario === 'seafarers_fog') {
    hexCoords = SEAFARERS_FOG_HEXES.map((h) => ({ q: h.q, r: h.r }));
    customTerrains = SEAFARERS_FOG_HEXES.map((h) => h.terrain);
    customTokens = SEAFARERS_FOG_HEXES.map((h) => h.token);
    terrainDistribution = customTerrains;
  } else if (scenario === 'world_map') {
    hexCoords = WORLD_MAP_HEXES.map((h) => ({ q: h.q, r: h.r }));
    customTerrains = WORLD_MAP_HEXES.map((h) => h.terrain);
    customTokens = WORLD_MAP_HEXES.map((h) => h.token);
    terrainDistribution = customTerrains;
  } else if (isExpansion) {
    hexCoords = EXPANSION_HEX_COORDS;
    terrainDistribution = EXPANSION_TERRAIN_DISTRIBUTION;
  } else {
    hexCoords = STANDARD_HEX_COORDS;
    terrainDistribution = STANDARD_TERRAIN_DISTRIBUTION;
  }

  const hexCount = hexCoords.length;

  // Re-center the board around (0,0) up front, before anything below computes an angle
  // relative to the origin (the harbor-placement coastal-edge sort does exactly that) — the
  // classic board's STANDARD_HEX_COORDS is already centered by construction, but
  // EXPANSION_HEX_COORDS isn't, and centering it only AFTER harbor placement (as this used
  // to do) meant that angle-sort ran around the wrong point, scattering harbors unevenly
  // around the coastline instead of spacing them out properly.
  const rawCentroid = hexCoords.reduce(
    (acc, c) => {
      const { x, y } = axialToPixel(c.q, c.r, HEX_RADIUS);
      return { x: acc.x + x, y: acc.y + y };
    },
    { x: 0, y: 0 }
  );
  const centerOffsetX = rawCentroid.x / hexCoords.length;
  const centerOffsetY = rawCentroid.y / hexCoords.length;

  // 1. Shuffle terrain cards
  const shufTerrains = shuffleWithPrng(terrainDistribution, state);
  const shuffledTerrains = shufTerrains.items;
  state = shufTerrains.nextState;

  // 2. Classic board: choose a starting corner and build the official clockwise inward
  //    spiral walk order. Expansion board: no official spiral is defined for its shape, so
  //    terrains/tokens are placed in plain array order (already fully randomized by the
  //    shuffle above / token shuffle below — the order itself carries no meaning here).
  let placementOrder: number[];
  if (isCustomScenario) {
    placementOrder = hexCoords.map((_, idx) => idx);
  } else if (isExpansion) {
    placementOrder = hexCoords.map((_, idx) => idx);
  } else {
    const cornerPick = nextPrngInt(state, 0, 5);
    state = cornerPick.nextState;
    placementOrder = getClockwiseSpiralHexIndices(cornerPick.value);
  }

  // 3. Place terrains along placementOrder, then assign number tokens (skipping desert).
  const terrains = new Array<TerrainType>(hexCount);
  const assignedTokens = new Array<number | null>(hexCount).fill(null);
  const assignedLetters = new Array<string | null>(hexCount).fill(null);

  if (isCustomScenario && customTerrains && customTokens) {
    for (let i = 0; i < hexCount; i++) {
      terrains[i] = customTerrains[i]!;
      assignedTokens[i] = customTokens[i] ?? null;
    }
  } else {
    for (let step = 0; step < placementOrder.length; step++) {
      const hexIdx = placementOrder[step]!;
      terrains[hexIdx] = shuffledTerrains[step]!;
    }
  }

  const nonDesertHexIndices = placementOrder.filter((idx) => terrains[idx] !== 'desert');

  if (isCustomScenario) {

    // Custom scenarios have their balanced token assignments pre-defined

  } else if (isExpansion) {
    // The real 5-6 Player Expansion's 28 number tokens are pre-printed (lettered A-Y, Za,
    // Zb, Zc) and placed in that fixed alphabetical order along the same kind of
    // outer-ring-to-center spiral the classic board uses — which is precisely what gives the
    // classic board its "6 and 8 are never adjacent" guarantee. The exact letter->value
    // mapping isn't published anywhere we could source, but the actual *goal* it exists for
    // is reproducible directly: shuffle, then reject any arrangement that puts two 6s or two
    // 8s (the two highest-probability rolls) next to each other, same as the real tokens do.
    const maxAttempts = 300;
    let bestTokens: number[] = [];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const shufTokens = shuffleWithPrng(EXPANSION_NUMBER_TOKENS, state);
      state = shufTokens.nextState;
      const candidate = shufTokens.items;
      let hasHotAdjacency = false;
      for (let i = 0; i < nonDesertHexIndices.length && !hasHotAdjacency; i++) {
        const tokenI = candidate[i]!;
        if (tokenI !== 6 && tokenI !== 8) continue;
        const coordI = hexCoords[nonDesertHexIndices[i]!]!;
        for (let j = i + 1; j < nonDesertHexIndices.length; j++) {
          const tokenJ = candidate[j]!;
          if (tokenJ !== 6 && tokenJ !== 8) continue;
          const coordJ = hexCoords[nonDesertHexIndices[j]!]!;
          if (areHexesAdjacent(coordI, coordJ)) {
            hasHotAdjacency = true;
            break;
          }
        }
      }
      bestTokens = candidate;
      if (!hasHotAdjacency) break;
    }
    nonDesertHexIndices.forEach((hexIdx, i) => {
      assignedTokens[hexIdx] = bestTokens[i] ?? null;
    });
  } else if (layoutMode === 'random_pure') {
    const shufTokens = shuffleWithPrng(STANDARD_NUMBER_TOKENS, state);
    state = shufTokens.nextState;
    nonDesertHexIndices.forEach((hexIdx, i) => {
      assignedTokens[hexIdx] = shufTokens.items[i] ?? null;
    });
  } else {
    nonDesertHexIndices.forEach((hexIdx, i) => {
      assignedTokens[hexIdx] = OFFICIAL_ALPHABETICAL_TOKENS[i] ?? null;
      assignedLetters[hexIdx] = String.fromCharCode(65 + i); // A, B, C ... R
    });
  }

  const hexes: Record<string, HexTile> = {};
  let robberHexId = `H${Math.floor(hexCount / 2)}`;

  // Map spatial key -> vertex accumulator
  const vertexByPosKey = new Map<
    string,
    {
      x: number;
      y: number;
      adjacentHexIds: Set<string>;
    }
  >();

  // For each hex, store its 6 corner position keys in clockwise order
  const hexCornerKeys = new Map<string, string[]>();

  hexCoords.forEach((coord, index) => {
    const id = `H${index}`;
    const raw = axialToPixel(coord.q, coord.r, HEX_RADIUS);
    const cx = Number((raw.x - centerOffsetX).toFixed(3));
    const cy = Number((raw.y - centerOffsetY).toFixed(3));
    const terrain = terrains[index]!;
    const numberToken = assignedTokens[index] ?? null;

    if (terrain === 'desert') {
      robberHexId = id;
    }

    hexes[id] = {
      id,
      q: coord.q,
      r: coord.r,
      x: cx,
      y: cy,
      terrain,
      numberToken,
      tokenLetter: assignedLetters[index] ?? null
    };

    const cornerKeys: string[] = [];
    for (let k = 0; k < 6; k++) {
      const angleRad = ((60 * k - 90) * Math.PI) / 180;
      const vx = Number((cx + HEX_RADIUS * Math.cos(angleRad)).toFixed(3));
      const vy = Number((cy + HEX_RADIUS * Math.sin(angleRad)).toFixed(3));
      const posKey = `${Math.round(vx * 10)}_${Math.round(vy * 10)}`;
      cornerKeys.push(posKey);

      const existing = vertexByPosKey.get(posKey);
      if (existing) {
        existing.adjacentHexIds.add(id);
      } else {
        vertexByPosKey.set(posKey, {
          x: vx,
          y: vy,
          adjacentHexIds: new Set([id])
        });
      }
    }
    hexCornerKeys.set(id, cornerKeys);
  });

  // Sort vertices deterministically by y then x so V0..V53 are always identical
  const sortedPosEntries = Array.from(vertexByPosKey.entries()).sort((a, b) => {
    const dy = a[1].y - b[1].y;
    if (Math.abs(dy) > 0.5) return dy;
    return a[1].x - b[1].x;
  });

  const posKeyToVertexId = new Map<string, string>();
  const vertices: Record<string, Vertex> = {};

  sortedPosEntries.forEach(([posKey, data], idx) => {
    const vId = `V${idx}`;
    posKeyToVertexId.set(posKey, vId);
    vertices[vId] = {
      id: vId,
      x: data.x,
      y: data.y,
      adjacentHexIds: Array.from(data.adjacentHexIds),
      adjacentVertexIds: [],
      adjacentEdgeIds: []
    };
  });

  // Build unique edges from hex sides
  const edgeByPairKey = new Map<
    string,
    {
      v1: string;
      v2: string;
      adjacentHexIds: Set<string>;
    }
  >();

  for (const [hexId, cornerKeys] of hexCornerKeys.entries()) {
    for (let k = 0; k < 6; k++) {
      const pk1 = cornerKeys[k]!;
      const pk2 = cornerKeys[(k + 1) % 6]!;
      const v1 = posKeyToVertexId.get(pk1)!;
      const v2 = posKeyToVertexId.get(pk2)!;
      const [minV, maxV] = v1.localeCompare(v2, undefined, { numeric: true }) < 0 ? [v1, v2] : [v2, v1];
      const pairKey = `${minV}_${maxV}`;
      const existing = edgeByPairKey.get(pairKey);
      if (existing) {
        existing.adjacentHexIds.add(hexId);
      } else {
        edgeByPairKey.set(pairKey, {
          v1: minV,
          v2: maxV,
          adjacentHexIds: new Set([hexId])
        });
      }
    }
  }

  // Sort edges deterministically
  const sortedEdgeEntries = Array.from(edgeByPairKey.values()).sort((a, b) => {
    const cmp1 = a.v1.localeCompare(b.v1, undefined, { numeric: true });
    if (cmp1 !== 0) return cmp1;
    return a.v2.localeCompare(b.v2, undefined, { numeric: true });
  });

  const edges: Record<string, Edge> = {};
  sortedEdgeEntries.forEach((edgeData, idx) => {
    const eId = `E${idx}`;
    const vert1 = vertices[edgeData.v1]!;
    const vert2 = vertices[edgeData.v2]!;

    edges[eId] = {
      id: eId,
      v1: edgeData.v1,
      v2: edgeData.v2,
      x1: vert1.x,
      y1: vert1.y,
      x2: vert2.x,
      y2: vert2.y,
      adjacentHexIds: Array.from(edgeData.adjacentHexIds)
    };

    if (!vert1.adjacentVertexIds.includes(edgeData.v2)) {
      vert1.adjacentVertexIds.push(edgeData.v2);
    }
    if (!vert2.adjacentVertexIds.includes(edgeData.v1)) {
      vert2.adjacentVertexIds.push(edgeData.v1);
    }
    vert1.adjacentEdgeIds.push(eId);
    vert2.adjacentEdgeIds.push(eId);
  });

  // Identify coastal edges (adjacentHexIds.length === 1), ordered clockwise around center (0,0)
  const coastalEdges = Object.values(edges)
    .filter((e) => e.adjacentHexIds.length === 1)
    .map((e) => {
      const mx = (e.x1 + e.x2) / 2;
      const my = (e.y1 + e.y2) / 2;
      const angle = Math.atan2(my, mx);
      return { edge: e, mx, my, angle };
    })
    .sort((a, b) => a.angle - b.angle);

  // The harbor frame is fixed (see STANDARD_HARBOR_TYPES / EXPANSION_HARBOR_TYPES) — never
  // shuffled, unlike the terrain/number tiles above.
  const harborTypes = isExpansion ? EXPANSION_HARBOR_TYPES : STANDARD_HARBOR_TYPES;
  const harborCount = harborTypes.length;

  const harbors: Harbor[] = [];
  const usedHarborVertices = new Set<string>();
  const step = coastalEdges.length / harborCount;

  for (let i = 0; i < harborCount; i++) {
    let candidateIdx = Math.floor(i * step) % coastalEdges.length;
    for (let offset = 0; offset < coastalEdges.length; offset++) {
      const probe = coastalEdges[(candidateIdx + offset) % coastalEdges.length]!;
      if (
        !usedHarborVertices.has(probe.edge.v1) &&
        !usedHarborVertices.has(probe.edge.v2)
      ) {
        candidateIdx = (candidateIdx + offset) % coastalEdges.length;
        break;
      }
    }

    const chosen = coastalEdges[candidateIdx]!;
    const hType = harborTypes[i]!;
    const hexId = chosen.edge.adjacentHexIds[0]!;
    const hex = hexes[hexId]!;
    // Position harbor icon outward from the coastal edge midpoint away from the hex center
    const dx = chosen.mx - hex.x;
    const dy = chosen.my - hex.y;
    const len = Math.hypot(dx, dy) || 1;
    const hx = Number((chosen.mx + (dx / len) * 48).toFixed(3));
    const hy = Number((chosen.my + (dy / len) * 48).toFixed(3));

    harbors.push({
      id: `P${i}`,
      type: hType,
      edgeId: chosen.edge.id,
      vertexIds: [chosen.edge.v1, chosen.edge.v2],
      hexId,
      x: hx,
      y: hy
    });

    usedHarborVertices.add(chosen.edge.v1);
    usedHarborVertices.add(chosen.edge.v2);
    vertices[chosen.edge.v1]!.harbor = hType;
    vertices[chosen.edge.v2]!.harbor = hType;
  }

  return {
    board: {
      hexes,
      vertices,
      edges,
      harbors,
      buildings: {},
      roads: {},
      ships: {},
      robberHexId
    },
    nextPrngState: state
  };
}
