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

// 5-6 Player Expansion board: 30 hexes in an elongated hexagon (row lengths 4,5,6,6,5,4 —
// the real expansion board's shape, noticeably wider/flatter than the classic board's
// perfect hexagon). Unlike STANDARD_HEX_COORDS there's no official fixed spiral/letter
// sequence for this board — the expansion rulebook just says to place tiles and tokens
// randomly — so generateStandardBoard always uses plain shuffling for this scenario,
// regardless of the classic board's boardLayout setting.
export const EXPANSION_HEX_COORDS: AxialCoord[] = [
  // Row r = -3 (4 hexes)
  { q: -2, r: -3 }, { q: -1, r: -3 }, { q: 0, r: -3 }, { q: 1, r: -3 },
  // Row r = -2 (5 hexes)
  { q: -2, r: -2 }, { q: -1, r: -2 }, { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 },
  // Row r = -1 (6 hexes)
  { q: -3, r: -1 }, { q: -2, r: -1 }, { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 },
  // Row r = 0 (6 hexes)
  { q: -3, r: 0 }, { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
  // Row r = 1 (5 hexes)
  { q: -3, r: 1 }, { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 },
  // Row r = 2 (4 hexes)
  { q: -3, r: 2 }, { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 }
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
 * gameplay effect either way. The two `layoutMode` values differ in step 3, how the number
 * tokens are assigned:
 * - 'random_balanced' (default): the official rulebook algorithm — walk the SAME spiral
 *   order and place the 18 alphabetical tokens (A -> R) in sequence, skipping the Desert.
 *   This is the standard board setup and (as a property of that fixed sequence) never puts
 *   a 6 and an 8 on adjacent hexes.
 * - 'random_pure': tokens are independently shuffled and dropped onto the non-Desert hexes
 *   in that random order, with no spiral/adjacency constraint — a different, more chaotic
 *   table every game, closer to a "house rule" free setup than the rulebook procedure.
 */
export function generateStandardBoard(
  prngState: number,
  layoutMode: GameRulesConfig['boardLayout'] = 'random_balanced',
  scenario: GameRulesConfig['boardScenario'] = 'classic'
): { board: BoardState; nextPrngState: number } {
  let state = prngState;
  const isExpansion = scenario === 'expansion';
  const hexCoords = isExpansion ? EXPANSION_HEX_COORDS : STANDARD_HEX_COORDS;
  const terrainDistribution = isExpansion ? EXPANSION_TERRAIN_DISTRIBUTION : STANDARD_TERRAIN_DISTRIBUTION;
  const hexCount = hexCoords.length;

  // 1. Shuffle terrain cards
  const shufTerrains = shuffleWithPrng(terrainDistribution, state);
  const shuffledTerrains = shufTerrains.items;
  state = shufTerrains.nextState;

  // 2. Classic board: choose a starting corner and build the official clockwise inward
  //    spiral walk order. Expansion board: no official spiral is defined for its shape, so
  //    terrains/tokens are placed in plain array order (already fully randomized by the
  //    shuffle above / token shuffle below — the order itself carries no meaning here).
  let placementOrder: number[];
  if (isExpansion) {
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

  for (let step = 0; step < placementOrder.length; step++) {
    const hexIdx = placementOrder[step]!;
    terrains[hexIdx] = shuffledTerrains[step]!;
  }

  const nonDesertHexIndices = placementOrder.filter((idx) => terrains[idx] !== 'desert');

  if (isExpansion || layoutMode === 'random_pure') {
    const tokenPool = isExpansion ? EXPANSION_NUMBER_TOKENS : STANDARD_NUMBER_TOKENS;
    const shufTokens = shuffleWithPrng(tokenPool, state);
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
    const { x: cx, y: cy } = axialToPixel(coord.q, coord.r, HEX_RADIUS);
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

  // Re-center the whole board around (0,0): the classic board's coordinates are already
  // symmetric by construction, but the expansion board's elongated, non-hexagonal shape is
  // not — and BoardSvg's viewBox/pan/zoom math assumes the board is centered at the origin.
  // Shifting everything by the hex centroid here keeps that assumption true for any shape,
  // without needing to touch the rendering layer's coordinate system at all.
  const hexList = Object.values(hexes);
  const centroidX = hexList.reduce((s, h) => s + h.x, 0) / hexList.length;
  const centroidY = hexList.reduce((s, h) => s + h.y, 0) / hexList.length;
  if (Math.abs(centroidX) > 0.001 || Math.abs(centroidY) > 0.001) {
    for (const hex of hexList) {
      hex.x = Number((hex.x - centroidX).toFixed(3));
      hex.y = Number((hex.y - centroidY).toFixed(3));
    }
    for (const vertex of Object.values(vertices)) {
      vertex.x = Number((vertex.x - centroidX).toFixed(3));
      vertex.y = Number((vertex.y - centroidY).toFixed(3));
    }
    for (const edge of Object.values(edges)) {
      edge.x1 = Number((edge.x1 - centroidX).toFixed(3));
      edge.y1 = Number((edge.y1 - centroidY).toFixed(3));
      edge.x2 = Number((edge.x2 - centroidX).toFixed(3));
      edge.y2 = Number((edge.y2 - centroidY).toFixed(3));
    }
    for (const harbor of harbors) {
      harbor.x = Number((harbor.x - centroidX).toFixed(3));
      harbor.y = Number((harbor.y - centroidY).toFixed(3));
    }
  }

  return {
    board: {
      hexes,
      vertices,
      edges,
      harbors,
      buildings: {},
      roads: {},
      robberHexId
    },
    nextPrngState: state
  };
}
