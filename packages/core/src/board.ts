import {
  STANDARD_NUMBER_TOKENS,
  STANDARD_TERRAIN_DISTRIBUTION
} from './config';
import { shuffleWithPrng } from './prng';
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
  // Row r = -2 (3 hexes)
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  // Row r = -1 (4 hexes)
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  // Row r = 0 (5 hexes)
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  // Row r = 1 (4 hexes)
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  // Row r = 2 (3 hexes)
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 }
];

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

const BEGINNER_FIXED_LAYOUT: Array<{ terrain: TerrainType; token: number | null }> = [
  { terrain: 'mountains', token: 10 },
  { terrain: 'pasture', token: 2 },
  { terrain: 'forest', token: 9 },
  { terrain: 'fields', token: 12 },
  { terrain: 'hills', token: 6 },
  { terrain: 'pasture', token: 4 },
  { terrain: 'hills', token: 10 },
  { terrain: 'fields', token: 9 },
  { terrain: 'forest', token: 11 },
  { terrain: 'desert', token: null },
  { terrain: 'forest', token: 3 },
  { terrain: 'mountains', token: 8 },
  { terrain: 'forest', token: 8 },
  { terrain: 'mountains', token: 3 },
  { terrain: 'fields', token: 4 },
  { terrain: 'pasture', token: 5 },
  { terrain: 'hills', token: 5 },
  { terrain: 'fields', token: 6 },
  { terrain: 'pasture', token: 11 }
];

function hasAdjacentRedNumbers(
  coords: AxialCoord[],
  tokens: Array<number | null>
): boolean {
  const redIndices: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 6 || tokens[i] === 8) {
      redIndices.push(i);
    }
  }
  for (let i = 0; i < redIndices.length; i++) {
    for (let j = i + 1; j < redIndices.length; j++) {
      const c1 = coords[redIndices[i]!]!;
      const c2 = coords[redIndices[j]!]!;
      if (areHexesAdjacent(c1, c2)) {
        return true;
      }
    }
  }
  return false;
}

export function generateStandardBoard(
  prngState: number,
  layoutMode: GameRulesConfig['boardLayout'] = 'random_balanced'
): { board: BoardState; nextPrngState: number } {
  let state = prngState;

  let terrains: TerrainType[];
  let assignedTokens: Array<number | null> = [];

  if (layoutMode === 'beginner_fixed') {
    terrains = BEGINNER_FIXED_LAYOUT.map((item) => item.terrain);
    assignedTokens = BEGINNER_FIXED_LAYOUT.map((item) => item.token);
  } else {
    const shufTerrains = shuffleWithPrng(STANDARD_TERRAIN_DISTRIBUTION, state);
    terrains = shufTerrains.items;
    state = shufTerrains.nextState;

    // Assign tokens, retrying if random_balanced and 6/8 are adjacent
    let attempts = 0;
    const maxAttempts = layoutMode === 'random_balanced' ? 80 : 1;
    do {
      const shufTokens = shuffleWithPrng(STANDARD_NUMBER_TOKENS, state);
      state = shufTokens.nextState;
      const tokensQueue = [...shufTokens.items];
      assignedTokens = terrains.map((t) => (t === 'desert' ? null : tokensQueue.shift() ?? null));
      attempts++;
    } while (
      layoutMode === 'random_balanced' &&
      attempts < maxAttempts &&
      hasAdjacentRedNumbers(STANDARD_HEX_COORDS, assignedTokens)
    );
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

  // Place 9 harbors around the 30 coastal edges so no two harbors share a vertex
  let harborTypes = [...STANDARD_HARBOR_TYPES];
  if (layoutMode !== 'beginner_fixed') {
    const shufHarbors = shuffleWithPrng(harborTypes, state);
    harborTypes = shufHarbors.items;
    state = shufHarbors.nextState;
  }

  const harbors: Harbor[] = [];
  const usedHarborVertices = new Set<string>();
  const step = coastalEdges.length / 9; // 30 / 9 = 3.333

  for (let i = 0; i < 9; i++) {
    let candidateIdx = Math.floor(i * step) % coastalEdges.length;
    // Ensure we don't overlap a vertex already assigned to another harbor
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
    // Position harbor icon slightly outward from the edge midpoint away from the hex center
    const dx = chosen.mx - hex.x;
    const dy = chosen.my - hex.y;
    const len = Math.hypot(dx, dy) || 1;
    const hx = Number((chosen.mx + (dx / len) * 38).toFixed(3));
    const hy = Number((chosen.my + (dy / len) * 38).toFixed(3));

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
