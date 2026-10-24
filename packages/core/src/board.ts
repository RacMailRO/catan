import {
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

export const STANDARD_HARBOR_TYPES: HarborType[] = [
  'generic',
  'wood',
  'brick',
  'generic',
  'sheep',
  'generic',
  'wheat',
  'ore',
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
 * Official Catan board generator:
 * 1. Shuffles the 19 terrain hex cards.
 * 2. Picks a starting corner on the outer ring (0..5) and places the 19 hexes in a clockwise inward spiral.
 * 3. Starting from the exact same outer corner and walking clockwise along the same spiral,
 *    places the 18 alphabetical number tokens (A -> R), skipping only the Desert hex.
 */
export function generateStandardBoard(
  prngState: number,
  _layoutMode: GameRulesConfig['boardLayout'] = 'random_balanced'
): { board: BoardState; nextPrngState: number } {
  let state = prngState;

  // 1. Shuffle terrain cards
  const shufTerrains = shuffleWithPrng(STANDARD_TERRAIN_DISTRIBUTION, state);
  const shuffledTerrains = shufTerrains.items;
  state = shufTerrains.nextState;

  // 2. Choose starting corner on the outer edge (0..5) and build the clockwise inward spiral
  const cornerPick = nextPrngInt(state, 0, 5);
  state = cornerPick.nextState;
  const spiralIndices = getClockwiseSpiralHexIndices(cornerPick.value);

  // 3. Place terrains along the spiral and place A->R tokens in the same clockwise spiral order (skipping desert)
  const terrains = new Array<TerrainType>(19);
  const assignedTokens = new Array<number | null>(19).fill(null);
  let tokenCursor = 0;

  for (let step = 0; step < spiralIndices.length; step++) {
    const hexIdx = spiralIndices[step]!;
    const terrain = shuffledTerrains[step]!;
    terrains[hexIdx] = terrain;
    if (terrain === 'desert') {
      assignedTokens[hexIdx] = null;
    } else {
      assignedTokens[hexIdx] = OFFICIAL_ALPHABETICAL_TOKENS[tokenCursor] ?? null;
      tokenCursor++;
    }
  }

  const hexes: Record<string, HexTile> = {};
  let robberHexId = 'H9';

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

  STANDARD_HEX_COORDS.forEach((coord, index) => {
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
      numberToken
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

  // Shuffle the 9 harbors deterministically
  const shufHarbors = shuffleWithPrng([...STANDARD_HARBOR_TYPES], state);
  const harborTypes = shufHarbors.items;
  state = shufHarbors.nextState;

  const harbors: Harbor[] = [];
  const usedHarborVertices = new Set<string>();
  const step = coastalEdges.length / 9;

  for (let i = 0; i < 9; i++) {
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
      robberHexId
    },
    nextPrngState: state
  };
}
