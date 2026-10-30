import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  BoardState,
  HEX_RADIUS,
  HarborType,
  PlayerColor,
  TerrainType,
  axialToPixel
} from '@catan/core';
import { Locale, RESOURCE_ICONS } from '../i18n';

export interface BoardSvgProps {
  board: BoardState;
  playerColors: Record<string, PlayerColor>;
  locale: Locale;
  highlightedVertices?: Set<string>;
  highlightedEdges?: Set<string>;
  highlightedHexes?: Set<string>;
  onSelectVertex?: (vertexId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
  onSelectHex?: (hexId: string) => void;
  interactiveAll?: boolean;
  /** Read-only "this is where that alternative action targets" marker for the AI Decision
   * Inspector - visually distinct (violet, dashed, pulsing, 💡) from the cyan "you can click
   * here" legal-move highlight above so the two are never confused. Never wired to onSelect*. */
  ghostVertexId?: string;
  ghostEdgeId?: string;
  ghostHexId?: string;
}

const TERRAIN_FALLBACK_FILL: Record<TerrainType, string> = {
  forest: '#166534',
  hills: '#b45309',
  pasture: '#4d7c0f',
  fields: '#ca8a04',
  mountains: '#475569',
  desert: '#d6bc8b',
  gold_field: '#eab308',
  sea: '#0284c7',
  fog: '#38bdf8'
};

// Per-terrain hex art variants (for visual variety across same-terrain hexes), cropped from
// the higher-resolution original tile sheets: lemn-oaie.jpg (forest/pasture),
// oaie-spic.jpg (pasture/fields) and caramida_piatra.jpg (hills/mountains). Desert has no
// higher-res source, so it keeps its single tile cropped from the original terrains_hexes.png.
const TERRAIN_IMAGES: Record<TerrainType, string[]> = {
  forest: ['/terrain_forest_1.png', '/terrain_forest_2.png', '/terrain_forest_3.png', '/terrain_forest_4.png'],
  pasture: ['/terrain_pasture_1.png', '/terrain_pasture_2.png', '/terrain_pasture_3.png', '/terrain_pasture_4.png'],
  fields: ['/terrain_fields_1.png', '/terrain_fields_2.png', '/terrain_fields_3.png', '/terrain_fields_4.png'],
  hills: ['/terrain_hills_1.png', '/terrain_hills_2.png', '/terrain_hills_3.png'],
  mountains: ['/terrain_mountains_1.png', '/terrain_mountains_2.png', '/terrain_mountains_3.png'],
  desert: ['/terrain_desert_1.png'],
  gold_field: ['/terrain_gold_field_1.png', '/terrain_gold_field_2.png'],
  sea: ['/terrain_sea_1.png'],
  fog: ['/terrain_fog_1.png']
};

// Original hex-tile artwork, cropped from /porturi-2.jpg (2:1 harbors) and /porturi-3.jpg
// (3:1 harbors + the blank open-sea tile) into one file per hex so each can be placed and
// rotated independently.
const PORT_HARBOR_IMAGE: Record<HarborType, string> = {
  brick: '/harbor_brick.png',
  wood: '/harbor_wood.png',
  sheep: '/harbor_sheep.png',
  wheat: '/harbor_wheat.png',
  ore: '/harbor_ore.png',
  generic: '/harbor_generic.png'
};
const SEA_TILE_IMAGE = '/sea_tile.png';
// Marker color for each harbor type's 2 trade-bonus vertices — matches the resource's
// usual palette elsewhere in the UI; generic (3:1) gets a neutral gold.
const HARBOR_VERTEX_COLOR: Record<HarborType, string> = {
  brick: '#b45309',
  wood: '#166534',
  sheep: '#65a30d',
  wheat: '#ca8a04',
  ore: '#64748b',
  generic: '#eab308'
};
// The baked-in dock/sand in the original tile art points toward this angle by default
// (0° = east, 90° = south, screen-space degrees); each harbor hex is rotated from this
// to the angle that points back toward the island so the pier faces the coast.
// Measured directly off the pier/dock structure's own pixels in each of the 6 cropped tiles
// (58.6-61.3°, averaging 60.2°) rather than the broader sand-colored area, which was a looser
// proxy and left a small but visible aiming error.
const PORT_ART_DEFAULT_ANGLE_DEG = 60.2;

// 'white' and 'brown' (only used by the 5-6 Player Expansion board) have no dedicated
// sprite art, so they reuse the closest existing color's set with a filter
// (PIECE_COLOR_FILTER below): 'white' desaturates and brightens the blue set toward an
// ivory/white tone (matching the real expansion's own white player color — an earlier gold
// attempt reused a genuinely gold-colored asset, but that read too close to 'orange'
// in-game), 'brown' desaturates and darkens the orange set toward brown.
const SETTLEMENT_SVG_BY_COLOR: Record<PlayerColor, string> = {
  red: '/settlement_red.22949197b57f9cfd968b.svg',
  blue: '/settlement_blue.bad4cdb43d65c329deda.svg',
  orange: '/settlement_orange.774ddafc8cc0595acdb7.svg',
  green: '/settlement_green.1b78c696cd137be02fae.svg',
  white: '/settlement_blue.bad4cdb43d65c329deda.svg',
  brown: '/settlement_orange.774ddafc8cc0595acdb7.svg'
};

const CITY_SVG_BY_COLOR: Record<PlayerColor, string> = {
  red: '/city_red.svg',
  blue: '/city_blue.svg',
  orange: '/city_orange.svg',
  green: '/city_green.svg',
  white: '/city_blue.svg',
  brown: '/city_orange.svg'
};

const ROAD_SVG_BY_COLOR: Record<PlayerColor, string> = {
  red: '/road_red.41c6cbd9278108542715.svg',
  blue: '/road_blue.3301e2eed15cae5a6a05.svg',
  orange: '/road_orange.07bb26b8c1e63dd438c7.svg',
  green: '/road_green.d206aed3747b3687bc40.svg',
  white: '/road_blue.3301e2eed15cae5a6a05.svg',
  brown: '/road_orange.07bb26b8c1e63dd438c7.svg'
};

const SHIP_SVG_BY_COLOR: Record<PlayerColor, string> = {
  red: '/ship_red.svg',
  blue: '/ship_blue.svg',
  orange: '/ship_orange.svg',
  green: '/ship_green.svg',
  white: '/ship_white.svg',
  brown: '/ship_brown.svg'
};

// Extra CSS filter applied before the drop-shadow chain below, only for colors reusing
// another asset's art (see comment above) — empty for every color with real dedicated art.
const PIECE_COLOR_FILTER: Record<PlayerColor, string> = {
  red: '',
  blue: '',
  orange: '',
  green: '',
  white: 'grayscale(1) brightness(2.1) contrast(0.85) ',
  brown: 'hue-rotate(-18deg) saturate(0.6) brightness(0.72) '
};
// Native proportions of the road SVG art (a vertical plank, long axis = road length).
const ROAD_ART_WIDTH = 40;
const ROAD_ART_HEIGHT = 194;

const NUMBER_TOKEN_PIPS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1
};

function getHexPolygonPoints(cx: number, cy: number, radius = HEX_RADIUS): string {
  const pts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const angleRad = ((60 * k - 90) * Math.PI) / 180;
    const x = cx + radius * Math.cos(angleRad);
    const y = cy + radius * Math.sin(angleRad);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

// Andrew's monotone-chain convex hull — used to derive the board's outer hexagon mask from
// every outer-sea-hex corner, rather than hand-deriving the exact geometry for this hex
// grid's orientation (foolproof regardless of pointy-top vs flat-top conventions).
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

interface OuterSeaHex {
  id: string;
  x: number;
  y: number;
  q: number;
  r: number;
}

// One ring of open sea/harbor hexes around the land — matching the physical game's own
// footprint (and the reference box art), not padded out with extra rings of plain water.
// Computed from the board's ACTUAL land hexes (every axial neighbor of a land hex that
// isn't itself land) rather than a fixed cube-distance-from-origin radius, so this works
// for any board shape — the classic board's regular hexagon as well as the 5-6 Player
// Expansion's larger, non-hexagonal (elongated) footprint.
const AXIAL_NEIGHBOR_DELTAS: Array<[number, number]> = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]
];

function generateOuterSeaRing(board: BoardState): OuterSeaHex[] {
  const hexList = Object.values(board.hexes || {});
  // Complete boards (like authentic 97-hex Seafarers Fog Island) already include their own full perimeter sea frame
  if (hexList.length === 0 || hexList.length >= 70) return [];
  const sampleHex = hexList[0]!;
  const rawSample = axialToPixel(sampleHex.q, sampleHex.r, HEX_RADIUS);
  const centerOffsetX = rawSample.x - sampleHex.x;
  const centerOffsetY = rawSample.y - sampleHex.y;

  const landKeys = new Set(hexList.map((h) => `${h.q}_${h.r}`));
  const seaKeys = new Set<string>();
  const ring: OuterSeaHex[] = [];
  for (const hex of hexList) {
    for (const [dq, dr] of AXIAL_NEIGHBOR_DELTAS) {
      const nq = hex.q + dq;
      const nr = hex.r + dr;
      const key = `${nq}_${nr}`;
      if (landKeys.has(key) || seaKeys.has(key)) continue;
      seaKeys.add(key);
      const raw = axialToPixel(nq, nr, HEX_RADIUS);
      const x = Number((raw.x - centerOffsetX).toFixed(3));
      const y = Number((raw.y - centerOffsetY).toFixed(3));
      ring.push({ id: `sea_${nq}_${nr}`, x, y, q: nq, r: nr });
    }
  }
  return ring;
}

// Plain open-sea tiles were all rendered at a fixed 0° rotation, so the same wave-crest
// line in sea_tile.png lined up across every hex in the ring — reading as a repeating grid
// pattern instead of open water. This picks one of 6 rotations per tile, deterministically
// from its axial coordinates (stable across re-renders, no per-frame randomness).
const SEA_TILE_ROTATIONS = [0, 60, 120, 180, 240, 300];
function seaTileRotationDeg(q: number, r: number): number {
  const hash = Math.abs((q * 374761393 + r * 668265263) ^ (q * 2654435761));
  return SEA_TILE_ROTATIONS[hash % SEA_TILE_ROTATIONS.length]!;
}

export const BoardSvg: React.FC<BoardSvgProps> = ({
  board,
  playerColors,
  highlightedVertices,
  highlightedEdges,
  highlightedHexes,
  onSelectVertex,
  onSelectEdge,
  onSelectHex,
  interactiveAll = false,
  ghostVertexId,
  ghostEdgeId,
  ghostHexId
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const hasMovedRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0
  });

  const touchStateRef = useRef<{
    mode: 'none' | 'drag' | 'pinch';
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    startDist: number;
    startZoom: number;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    startDist: 0,
    startZoom: 1
  });

  // Touch/mouse drag deltas arrive in CSS pixels, but `pan` is in viewBox units. The fixed
  // viewBox is scaled to fit the SVG element via the default "xMidYMid meet" behavior, which
  // scales both axes by the SAME factor (whichever axis is tighter) and letterboxes the other
  // — so both x and y here must use that one uniform factor, not independent per-axis ratios
  // (which would only be correct if the viewBox were stretched to exactly fill the element,
  // which it no longer is).
  const getDragScale = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return { x: 1, y: 1 };
    const rect = svgEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 1, y: 1 };
    const viewBoxW = viewBoxHalfExtent.w * 2;
    const viewBoxH = viewBoxHalfExtent.h * 2;
    const renderScale = Math.min(rect.width / viewBoxW, rect.height / viewBoxH);
    const unitsPerPx = renderScale > 0 ? 1 / renderScale : 1;
    return { x: unitsPerPx, y: unitsPerPx };
  };

  const outerSeaRing = useMemo(() => generateOuterSeaRing(board), [board]);

  // viewBox sized to the land + its one ring of sea/harbor hexes (the board's natural
  // footprint), computed from the actual sea-ring extent rather than a fixed constant —
  // the classic board's radius-2 hexagon and the (bigger, non-hexagonal) 5-6 Player
  // Expansion board both need to fit without clipping or excess empty margin. The outer hex
  // clip-path (see outerHexMaskPoints) keeps this a clean silhouette regardless of shape;
  // the SVG's own default preserveAspectRatio ("xMidYMid meet") scales it to fit any
  // container — letterboxed on the non-matching axis — so it's always as large as the
  // container allows without distortion, with no resize-tracking JS needed. Board
  // generation always centers the board at (0,0) (see board.ts), so a symmetric half-extent
  // around the origin is safe for any board shape.
  const viewBoxHalfExtent = useMemo(() => {
    const margin = HEX_RADIUS + 20;
    const sourceHexes = outerSeaRing.length > 0 ? outerSeaRing : Object.values(board.hexes);
    if (sourceHexes.length === 0) return { w: 640, h: 580 };
    let maxAbsX = 0;
    let maxAbsY = 0;
    for (const h of sourceHexes) {
      maxAbsX = Math.max(maxAbsX, Math.abs(h.x));
      maxAbsY = Math.max(maxAbsY, Math.abs(h.y));
    }
    return { w: maxAbsX + margin, h: maxAbsY + margin };
  }, [outerSeaRing, board.hexes]);

  // Outer hexagon mask: the convex hull of every outer-sea-hex corner, pushed out a couple px
  // so the clip edge sits just past the tile art (no hairline gap at the border). Everything
  // outside this hexagon — any surplus from the viewBox below not matching the content's own
  // aspect ratio — is clipped to transparent instead of showing a hard rectangular cutoff.
  const outerHexMaskPoints = useMemo(() => {
    const corners: { x: number; y: number }[] = [];
    const sourceHexes = outerSeaRing.length > 0 ? outerSeaRing : Object.values(board.hexes);
    for (const h of sourceHexes) {
      for (let k = 0; k < 6; k++) {
        const angleRad = ((60 * k - 90) * Math.PI) / 180;
        corners.push({
          x: h.x + HEX_RADIUS * Math.cos(angleRad),
          y: h.y + HEX_RADIUS * Math.sin(angleRad)
        });
      }
    }
    const hull = convexHull(corners);
    if (hull.length === 0) return '';
    const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
    const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
    const pad = 3;
    return hull
      .map((p) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        return `${(p.x + (dx / len) * pad).toFixed(2)},${(p.y + (dy / len) * pad).toFixed(2)}`;
      })
      .join(' ');
  }, [outerSeaRing, board.hexes]);

  // Unified Harbor Assignment & Orientation:
  // Maps each harbor to its EXACT adjacent sea hex (whether in board.hexes or outerSeaRing).
  // Computes the rotation so that the dock artwork points directly toward the coastal edge midpoint.
  const harborAssignmentByHexId = useMemo(() => {
    const map = new Map<string, { harbor: (typeof board.harbors)[number]; rotationDeg: number }>();
    if (!board?.harbors || board.harbors.length === 0) return map;

    const hexList = Object.values(board.hexes || {});

    for (const harbor of board.harbors) {
      const landHex = board.hexes?.[harbor.hexId];
      const v1 = board.vertices?.[harbor.vertexIds[0]];
      const v2 = board.vertices?.[harbor.vertexIds[1]];
      if (!v1 || !v2 || !landHex) continue;

      // Midpoint of coastal edge
      const mx = (v1.x + v2.x) / 2;
      const my = (v1.y + v2.y) / 2;

      // Direction vector from land hex center to coastal edge midpoint
      const dx = mx - landHex.x;
      const dy = my - landHex.y;

      // Center of the adjacent sea hex across that edge
      const expectedSeaX = landHex.x + 2 * dx;
      const expectedSeaY = landHex.y + 2 * dy;

      let assignedHexId: string | null = null;
      let seaCenterX = expectedSeaX;
      let seaCenterY = expectedSeaY;

      // 1. Check if the adjacent sea hex is in board.hexes (e.g. Seafarers internal waters)
      const boardSeaHex = hexList.find(
        (h) => h.terrain === 'sea' && Math.hypot(h.x - expectedSeaX, h.y - expectedSeaY) < 25
      );

      if (boardSeaHex) {
        assignedHexId = boardSeaHex.id;
        seaCenterX = boardSeaHex.x;
        seaCenterY = boardSeaHex.y;
      } else {
        // 2. Check if the adjacent sea hex is in outerSeaRing (e.g. Classic / perimeter coast)
        const ringSeaHex = outerSeaRing.find(
          (s) => Math.hypot(s.x - expectedSeaX, s.y - expectedSeaY) < 25
        );
        if (ringSeaHex) {
          assignedHexId = ringSeaHex.id;
          seaCenterX = ringSeaHex.x;
          seaCenterY = ringSeaHex.y;
        } else {
          // Fallback: nearest sea hex in outerSeaRing or board.hexes
          let bestDist = Infinity;
          for (const s of outerSeaRing) {
            const d = Math.hypot(s.x - expectedSeaX, s.y - expectedSeaY);
            if (d < bestDist) {
              bestDist = d;
              assignedHexId = s.id;
              seaCenterX = s.x;
              seaCenterY = s.y;
            }
          }
          if (!assignedHexId) {
            for (const h of hexList) {
              if (h.terrain === 'sea') {
                const d = Math.hypot(h.x - expectedSeaX, h.y - expectedSeaY);
                if (d < bestDist) {
                  bestDist = d;
                  assignedHexId = h.id;
                  seaCenterX = h.x;
                  seaCenterY = h.y;
                }
              }
            }
          }
        }
      }

      if (assignedHexId) {
        // Angle from sea hex center to coastal edge midpoint
        const angleRad = Math.atan2(my - seaCenterY, mx - seaCenterX);
        const angleDeg = (angleRad * 180) / Math.PI;
        // Snap to nearest 60° multiple to ensure perfect hex alignment
        const snappedAngleDeg = Math.round(angleDeg / 60) * 60;
        // Tile art dock is on South-East edge (60°), so rotation is snappedAngleDeg - 60
        const rotationDeg = snappedAngleDeg - 60;

        map.set(assignedHexId, { harbor, rotationDeg });
      }
    }

    return map;
  }, [board?.harbors, board?.hexes, board?.vertices, outerSeaRing]);

  // The true island shoreline along the boundary between land and water.
  // Filters exclusively for edges that touch at least one land hex and face water.
  // This guarantees the coastline hugs the islands properly and never veers out into the ocean around sea hexes.
  const landCoastalEdges = useMemo(() => {
    return Object.values(board.edges || {}).filter((e) => {
      const hasLand = e.adjacentHexIds.some((hId) => {
        const t = board.hexes[hId]?.terrain;
        return t && t !== 'sea' && t !== 'fog';
      });
      if (!hasLand) return false;

      const facesWater =
        e.adjacentHexIds.length === 1 ||
        e.adjacentHexIds.some((hId) => board.hexes[hId]?.terrain === 'sea');
      return facesWater;
    });
  }, [board.edges, board.hexes]);

  // Native non-passive listeners for desktop mouse wheel AND mobile pinch-to-zoom + touch drag
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      setZoom((prev) => Math.min(3.2, Math.max(0.45, Number((prev * factor).toFixed(2)))));
    };

    const handleTouchStart = (e: TouchEvent) => {
      hasMovedRef.current = false;
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0]!;
        const t2 = e.touches[1]!;
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        touchStateRef.current = {
          mode: 'pinch',
          startX: (t1.clientX + t2.clientX) / 2,
          startY: (t1.clientY + t2.clientY) / 2,
          startPanX: pan.x,
          startPanY: pan.y,
          startDist: dist,
          startZoom: zoom
        };
      } else if (e.touches.length === 1) {
        const t = e.touches[0]!;
        touchStateRef.current = {
          mode: 'drag',
          startX: t.clientX,
          startY: t.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
          startDist: 0,
          startZoom: zoom
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStateRef.current.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0]!;
        const t2 = e.touches[1]!;
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (touchStateRef.current.startDist > 0) {
          const scale = dist / touchStateRef.current.startDist;
          const nextZoom = Math.min(
            3.2,
            Math.max(0.45, Number((touchStateRef.current.startZoom * scale).toFixed(2)))
          );
          setZoom(nextZoom);
        }
      } else if (touchStateRef.current.mode === 'drag' && e.touches.length === 1) {
        const t = e.touches[0]!;
        const dx = t.clientX - touchStateRef.current.startX;
        const dy = t.clientY - touchStateRef.current.startY;
        if (Math.hypot(dx, dy) > 5) {
          hasMovedRef.current = true;
          e.preventDefault();
          const scale = getDragScale();
          setPan({
            x: touchStateRef.current.startPanX + dx * scale.x,
            y: touchStateRef.current.startPanY + dy * scale.y
          });
        }
      }
    };

    const handleTouchEnd = () => {
      touchStateRef.current.mode = 'none';
    };

    svgEl.addEventListener('wheel', handleNativeWheel, { passive: false });
    svgEl.addEventListener('touchstart', handleTouchStart, { passive: false });
    svgEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    svgEl.addEventListener('touchend', handleTouchEnd);
    svgEl.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      svgEl.removeEventListener('wheel', handleNativeWheel);
      svgEl.removeEventListener('touchstart', handleTouchStart);
      svgEl.removeEventListener('touchmove', handleTouchMove);
      svgEl.removeEventListener('touchend', handleTouchEnd);
      svgEl.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [pan.x, pan.y, zoom]);

  // Desktop Mouse Drag Fallback
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') return;
    hasMovedRef.current = false;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch' || !isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) > 5) {
      hasMovedRef.current = true;
    }
    const scale = getDragScale();
    setPan({
      x: dragStartRef.current.panX + dx * scale.x,
      y: dragStartRef.current.panY + dy * scale.y
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Display size each hex tile image (terrain, sea, harbor) is stretched to fill
  const hexCellW = Math.sqrt(3) * HEX_RADIUS * 1.04;
  const hexCellH = 2 * HEX_RADIUS * 1.04;
  const tokenSize = 54;
  const tokenRadius = tokenSize / 2;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Desktop Zoom Controls (bottom-right on desktop) */}
      <div className="zoom-controls desktop-only">
        <button
          type="button"
          className="btn"
          onClick={() => setZoom((z) => Math.min(3.2, Number((z + 0.2).toFixed(2))))}
          title="Zoom In"
        >
          ＋
        </button>
        <button type="button" className="btn" onClick={resetView} title="Reset View">
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setZoom((z) => Math.max(0.45, Number((z - 0.2).toFixed(2))))}
          title="Zoom Out"
        >
          －
        </button>
      </div>

      {/* Discrete Mobile Reset Button in bottom-right */}
      <button
        type="button"
        className="btn mobile-only mobile-reset-zoom-btn"
        onClick={resetView}
        title="Recentrare Harta"
      >
        🎯 {Math.round(zoom * 100)}%
      </button>

      <svg
        ref={svgRef}
        viewBox={`${-viewBoxHalfExtent.w} ${-viewBoxHalfExtent.h} ${viewBoxHalfExtent.w * 2} ${viewBoxHalfExtent.h * 2}`}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          display: 'block'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          {/* Clip paths for the 18 outer sea ring hexes */}
          {outerSeaRing.map((sea) => (
            <clipPath key={`clip-${sea.id}`} id={`clip-${sea.id}`}>
              <polygon points={getHexPolygonPoints(sea.x, sea.y, HEX_RADIUS - 0.5)} />
            </clipPath>
          ))}

          {/* Clip paths for the 19 island terrain hexes */}
          {Object.values(board.hexes).map((hex) => (
            <clipPath key={`defs-${hex.id}`} id={`clip-hex-${hex.id}`}>
              <polygon points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS - 1.5)} />
            </clipPath>
          ))}

          {/* sea_tile.png (the plain open-sea hex) is a noticeably lighter, more saturated
              blue than the water painted into the harbor tiles cropped from porturi-2/3.jpg —
              sampling a pure-water patch from each gives sea_tile ~(63,119,180) vs harbor
              water ~(33,90,147), consistent across all 6 harbor crops. This per-channel scale
              brings sea_tile's water color in line with the harbor tiles it sits beside in the
              outer ring, without touching the source art file. */}
          <filter id="seaTileColorMatch" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.523 0 0 0 0  0 0.750 0 0 0  0 0 0.821 0 0  0 0 0 1 0"
            />
          </filter>

          {/* Beveled ivory face for number tokens */}
          <radialGradient id="tokenFaceGrad" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fffdf5" />
            <stop offset="65%" stopColor="#f5e7c4" />
            <stop offset="100%" stopColor="#dcc294" />
          </radialGradient>

          {/* Outer hexagon silhouette — see outerHexMaskPoints. Applied to the content group
              below (same space as pan/zoom) so it tracks the board, not the viewport. */}
          <clipPath id="board-outer-hex-mask">
            <polygon points={outerHexMaskPoints} />
          </clipPath>
        </defs>

        <g
          transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
          clipPath="url(#board-outer-hex-mask)"
        >
          {/* 0A. Render 18 Outer Sea Hexes using the original port-tile artwork: the 9 hexes
              with a harbor get that harbor's 2:1/3:1 tile (cropped from /porturi-2.jpg or
              /porturi-3.jpg), rotated to face the island; the rest get the plain open-sea
              tile cropped from /porturi-3.jpg, for a consistent look across the sea ring. */}
          {outerSeaRing.map((sea) => {
            const assignment = harborAssignmentByHexId.get(sea.id);
            const harbor = assignment?.harbor;
            const href = harbor ? PORT_HARBOR_IMAGE[harbor.type] : SEA_TILE_IMAGE;
            const rotationDeg = assignment
              ? assignment.rotationDeg
              : seaTileRotationDeg(sea.q, sea.r);
            // A rotated image must be oversized (a square at least as wide as the hex is
            // tall) so its corners still cover the hex's own corners at every angle —
            // the tightly-fit hexCellW x hexCellH box used for unrotated tiles would clip.
            // Plain sea tiles are rotated too now (see seaTileRotationDeg), so they need the
            // same oversized square as harbor tiles.
            const imgSize = hexCellH * 1.1;

            return (
              <g key={sea.id}>
                <g
                  clipPath={`url(#clip-${sea.id})`}
                  transform={`rotate(${rotationDeg}, ${sea.x}, ${sea.y})`}
                >
                  <image
                    href={href}
                    x={sea.x - imgSize / 2}
                    y={sea.y - imgSize / 2}
                    width={imgSize}
                    height={imgSize}
                    preserveAspectRatio="none"
                    filter={harbor ? undefined : 'url(#seaTileColorMatch)'}
                  />
                </g>
                <polygon
                  points={getHexPolygonPoints(sea.x, sea.y, HEX_RADIUS - 0.5)}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={1.2}
                  strokeOpacity={0.22}
                />
              </g>
            );
          })}

          {/* 0B. Sandy fill behind Island Land Hexes — keeps the thin seams between adjacent
              tiles sand-colored rather than showing the sea through them (skips sea & fog). */}
          {Object.values(board.hexes)
            .filter((hex) => hex.terrain !== 'sea' && hex.terrain !== 'fog')
            .map((hex) => (
              <polygon
                key={`sand-${hex.id}`}
                points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS + 7)}
                fill="#fde68a"
                style={{ pointerEvents: 'none' }}
              />
            ))}

          {/* 0C. Shoreline stroke along all land-water boundaries (strictly hugs the land, never encompasses sea hexes or ports) */}
          {landCoastalEdges.map((e) => (
            <line
              key={`coast-${e.id}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="#d97706"
              strokeWidth={5}
              strokeLinecap="round"
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {/* 1. Render 19 Island Hex Tiles using the per-terrain tile art & /numbers.png */}
          {Object.values(board.hexes).map((hex, hexIdx) => {
            const isHighlighted = highlightedHexes?.has(hex.id) ?? false;
            const hasRobber = board.robberHexId === hex.id;
            const hasPirate = board.pirateHexId === hex.id;
            const terrainVariants = TERRAIN_IMAGES[hex.terrain];
            const terrainHref = terrainVariants[hexIdx % terrainVariants.length]!;

            return (
              <g
                key={hex.id}
                data-hex-id={hex.id}
                onClick={() => {
                  if (hasMovedRef.current) return;
                  if ((isHighlighted || interactiveAll) && onSelectHex) {
                    onSelectHex(hex.id);
                  }
                }}
                style={{ cursor: (isHighlighted || (interactiveAll && onSelectHex)) ? 'pointer' : 'inherit' }}
              >
                {/* Fallback polygon + interactive hit target */}
                <polygon
                  
                  points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS - 1)}
                  fill={TERRAIN_FALLBACK_FILL[hex.terrain]}
                />

                {/* Clipped Terrain Artwork */}
                {(() => {
                  if (hex.terrain === 'sea') {
                    const assignment = harborAssignmentByHexId.get(hex.id);
                    const isHarbor = Boolean(assignment);
                    const href = isHarbor ? PORT_HARBOR_IMAGE[assignment!.harbor.type] : terrainHref;
                    const rotationDeg = isHarbor
                      ? assignment!.rotationDeg
                      : seaTileRotationDeg(hex.q, hex.r);
                    const imgSize = hexCellH * 1.1;

                    return (
                      <g
                        clipPath={`url(#clip-hex-${hex.id})`}
                        transform={`rotate(${rotationDeg}, ${hex.x}, ${hex.y})`}
                        style={{ pointerEvents: 'none' }}
                      >
                        <image
                          href={href}
                          x={hex.x - imgSize / 2}
                          y={hex.y - imgSize / 2}
                          width={imgSize}
                          height={imgSize}
                          preserveAspectRatio="none"
                          filter={isHarbor ? undefined : 'url(#seaTileColorMatch)'}
                        />
                      </g>
                    );
                  }

                  return (
                    <g clipPath={`url(#clip-hex-${hex.id})`} style={{ pointerEvents: 'none' }}>
                      <image
                        href={terrainHref}
                        x={hex.x - hexCellW / 2}
                        y={hex.y - hexCellH / 2}
                        width={hexCellW}
                        height={hexCellH}
                        preserveAspectRatio="none"
                      />
                    </g>
                  );
                })()}

                {/* Hexagon Border (or glowing blue if selectable for Robber) */}
                <polygon
                  points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS - 1.5)}
                  fill={isHighlighted ? 'rgba(56, 189, 248, 0.2)' : 'none'}
                  stroke={
                    isHighlighted
                      ? '#38bdf8'
                      : hex.terrain === 'sea'
                      ? 'rgba(56, 189, 248, 0.15)'
                      : hex.terrain === 'fog'
                      ? '#94a3b8'
                      : '#fde68a'
                  }
                  strokeWidth={isHighlighted ? 5.5 : hex.terrain === 'sea' ? 0.8 : 3.2}
                  strokeOpacity={isHighlighted ? 1 : hex.terrain === 'sea' ? 0.35 : 0.82}
                />

                {/* Number Token — vector disc with a beveled 3D face, drawn directly rather
                    than sliced from a sprite sheet */}
                {hex.numberToken !== null && (
                  <g
                    transform={`translate(${hex.x}, ${hex.y + 2})`}
                    style={{ pointerEvents: 'none', filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.55))' }}
                  >
                    <circle r={tokenRadius + 2} fill={`url(#tokenFaceGrad)`} stroke="#6b4a26" strokeWidth={1.5} />
                    <circle
                      r={tokenRadius + 2}
                      fill="none"
                      stroke="#fffaf0"
                      strokeWidth={1}
                      strokeOpacity={0.55}
                      transform="translate(-0.8, -0.8)"
                    />
                    {hex.tokenLetter && (
                      <text
                        y={-tokenRadius * 0.42}
                        textAnchor="middle"
                        fontSize={tokenRadius * 0.34}
                        fontWeight="700"
                        fill="#5a3f22"
                        fontFamily="var(--font-display, Georgia, serif)"
                      >
                        {hex.tokenLetter}
                      </text>
                    )}
                    <text
                      y={tokenRadius * 0.24}
                      textAnchor="middle"
                      fontSize={tokenRadius * 0.92}
                      fontWeight="700"
                      fill={hex.numberToken === 6 || hex.numberToken === 8 ? '#b5432f' : '#241a0c'}
                      fontFamily="var(--font-display, Georgia, serif)"
                    >
                      {hex.numberToken}
                    </text>
                    {(() => {
                      const pipCount = NUMBER_TOKEN_PIPS[hex.numberToken] ?? 0;
                      const pipColor = hex.numberToken === 6 || hex.numberToken === 8 ? '#b5432f' : '#241a0c';
                      const spacing = tokenRadius * 0.17;
                      return (
                        <g fill={pipColor}>
                          {Array.from({ length: pipCount }).map((_, i) => (
                            <circle
                              key={i}
                              cx={(i - (pipCount - 1) / 2) * spacing}
                              cy={tokenRadius * 0.56}
                              r={tokenRadius * 0.065}
                            />
                          ))}
                        </g>
                      );
                    })()}
                  </g>
                )}

                {/* Fog unexplored marker disc with clean ? */}
                {hex.terrain === 'fog' && hex.numberToken === null && (
                  <g
                    transform={`translate(${hex.x}, ${hex.y + 2})`}
                    style={{ pointerEvents: 'none', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.5))' }}
                  >
                    <circle r={tokenRadius} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} />
                    <text
                      y={tokenRadius * 0.35}
                      textAnchor="middle"
                      fontSize={tokenRadius * 1.05}
                      fontWeight="800"
                      fill="#475569"
                      fontFamily="var(--font-display, Georgia, serif)"
                    >
                      ?
                    </text>
                  </g>
                )}

                {/* Robber Pawn (Land) */}
                {hasRobber && (
                  <g
                    transform={`translate(${hex.x + 32}, ${hex.y - 24})`}
                    style={{ pointerEvents: 'none' }}
                  >
                    <circle cx={0} cy={0} r={20} fill="#111827" stroke="#facc15" strokeWidth={3} />
                    <text x={0} y={7} textAnchor="middle" fontSize="19">
                      🥷
                    </text>
                  </g>
                )}

                {/* Pirate Pawn (Sea) */}
                {hasPirate && (
                  <g
                    transform={`translate(${hex.x + 32}, ${hex.y - 24})`}
                    style={{ pointerEvents: 'none' }}
                  >
                    <circle cx={0} cy={0} r={20} fill="#0f172a" stroke="#ef4444" strokeWidth={3} />
                    <text x={0} y={7} textAnchor="middle" fontSize="19">
                      🏴‍☠️
                    </text>
                  </g>
                )}

                {/* Highlight ring when moving robber or pirate */}
                {isHighlighted && (
                  <circle
                    data-interactive="true"
                    cx={hex.x}
                    cy={hex.y + 2}
                    r={42}
                    fill={hex.terrain === 'sea' ? "rgba(239, 68, 68, 0.3)" : "rgba(56, 189, 248, 0.3)"}
                    stroke={hex.terrain === 'sea' ? "#ef4444" : "#38bdf8"}
                    strokeWidth={4}
                    strokeDasharray="6,3"
                  />
                )}

                {/* AI Decision Inspector: where an alternative robber/knight move would have
                    targeted - violet/dashed/pulsing so it's never mistaken for the cyan "you
                    can click here" legal-move ring above. */}
                {ghostHexId === hex.id && (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle cx={hex.x} cy={hex.y + 2} r={44} fill="rgba(167, 139, 250, 0.22)" stroke="#a78bfa" strokeWidth={4} strokeDasharray="4,5">
                      <animate attributeName="opacity" values="0.5;1;0.5" dur="1.4s" repeatCount="indefinite" />
                    </circle>
                    <text x={hex.x} y={hex.y - 34} textAnchor="middle" fontSize="18">💡</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 2. Harbor trade-bonus markers on each harbor's 2 coastal vertices */}
          {board.harbors.map((harbor) => {
            const v1 = board.vertices[harbor.vertexIds[0]];
            const v2 = board.vertices[harbor.vertexIds[1]];
            if (!v1 || !v2) return null;
            const color = HARBOR_VERTEX_COLOR[harbor.type];

            return (
              <g key={harbor.id} style={{ pointerEvents: 'none' }}>
                {[v1, v2].map((v, idx) => (
                  <g key={idx} transform={`translate(${v.x}, ${v.y})`}>
                    <circle r={10} fill={color} fillOpacity={0.92} stroke="#fef3c7" strokeWidth={2} />
                    <text textAnchor="middle" y={3.5} fontSize="9">
                      ⚓
                    </text>
                  </g>
                ))}
              </g>
            );
          })}

          {/* 3. Render Edges (Built Roads & Highlighted Legal Road Edges with Large Touch Hit Targets) */}
          {Object.values(board.edges).map((edge) => {
            const builtRoad = board.roads[edge.id];
            const builtShip = board.ships?.[edge.id];
            const isHighlighted = highlightedEdges?.has(edge.id) ?? false;
            const isGhost = ghostEdgeId === edge.id;
            if (!builtRoad && !builtShip && !isHighlighted && !interactiveAll && !isGhost) return null;

            const ownerPColor: PlayerColor = builtRoad
              ? playerColors[builtRoad.ownerId] ?? 'red'
              : builtShip
              ? playerColors[builtShip.ownerId] ?? 'blue'
              : 'red';

            const dx = edge.x2 - edge.x1;
            const dy = edge.y2 - edge.y1;
            const length = Math.hypot(dx, dy);
            const midX = (edge.x1 + edge.x2) / 2;
            const midY = (edge.y1 + edge.y2) / 2;

            let roadTransform = '';
            let roadDisplayWidth = 0;
            let roadDisplayHeight = 0;
            if (builtRoad) {
              const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
              roadDisplayHeight = length;
              roadDisplayWidth = length * (ROAD_ART_WIDTH / ROAD_ART_HEIGHT);
              roadTransform = `translate(${midX}, ${midY}) rotate(${angleDeg})`;
            }

            // Ship piece: rotated and aligned to edge, with hull facing water and sail facing land
            const shipSize = 58;
            let shipAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

            // Vector pointing from adjacent land hex center toward edge midpoint (direction of water)
            const landHexId = edge.adjacentHexIds.find((hId) => {
              const t = board.hexes[hId]?.terrain;
              return t && t !== 'sea' && t !== 'fog';
            });
            let vWaterX = 0;
            let vWaterY = 0;
            if (landHexId && board.hexes[landHexId]) {
              const landHex = board.hexes[landHexId]!;
              vWaterX = midX - landHex.x;
              vWaterY = midY - landHex.y;
            } else {
              vWaterX = midX;
              vWaterY = midY;
            }

            // In ship SVG: local +y is hull/base, local -y is sail/top.
            // A rotation of shipAngleDeg maps local +y to (-sin(rad), cos(rad)).
            // We orient so hull (+y) points toward water:
            const rad = (shipAngleDeg * Math.PI) / 180;
            const hullX = -Math.sin(rad);
            const hullY = Math.cos(rad);
            if (hullX * vWaterX + hullY * vWaterY < 0) {
              shipAngleDeg += 180;
            }

            const vWaterLen = Math.hypot(vWaterX, vWaterY) || 1;
            const shipMidX = midX + (vWaterX / vWaterLen) * 3;
            const shipMidY = midY + (vWaterY / vWaterLen) * 3;
            const shipTransform = `translate(${shipMidX}, ${shipMidY}) rotate(${shipAngleDeg})`;

            return (
              <g
                key={edge.id}
                onClick={() => {
                  if (hasMovedRef.current) return;
                  if ((isHighlighted || interactiveAll) && onSelectEdge) {
                    onSelectEdge(edge.id);
                  }
                }}
                style={{ cursor: (isHighlighted || (interactiveAll && onSelectEdge)) ? 'pointer' : 'default' }}
              >
                {builtRoad && (
                  <g transform={roadTransform} style={{ pointerEvents: 'none' }}>
                    <image
                      href={ROAD_SVG_BY_COLOR[ownerPColor]}
                      x={-roadDisplayWidth / 2}
                      y={-roadDisplayHeight / 2}
                      width={roadDisplayWidth}
                      height={roadDisplayHeight}
                      preserveAspectRatio="none"
                      style={{ filter: `${PIECE_COLOR_FILTER[ownerPColor]}drop-shadow(0 2px 2px rgba(0,0,0,0.5))` }}
                    />
                  </g>
                )}

                {builtShip && (
                  <g transform={shipTransform} style={{ pointerEvents: 'none' }}>
                    <image
                      href={SHIP_SVG_BY_COLOR[ownerPColor]}
                      x={-shipSize / 2}
                      y={-shipSize / 2}
                      width={shipSize}
                      height={shipSize}
                      preserveAspectRatio="xMidYMid meet"
                      style={{ filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.75)) drop-shadow(0 0 2px rgba(255,255,255,0.45))' }}
                    />
                  </g>
                )}

                {isHighlighted ? (
                  <g>
                    {/* Generous invisible touch target line (width 32) — flat (not round) caps,
                        so the hit area stays within the edge and doesn't bulge out over the
                        vertex at either end (that bulge used to look like a second, misplaced
                        marker sitting right next to the settlement/city there). */}
                    <line
                      data-interactive="true"
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke="transparent"
                      strokeWidth={32}
                      strokeLinecap="butt"
                    />
                    <line
                      data-interactive="true"
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke="#38bdf8"
                      strokeWidth={10}
                      strokeOpacity={0.75}
                      strokeLinecap="butt"
                    />
                    {/* The actual road marker: one clear dot at the edge's midpoint. */}
                    <circle
                      data-interactive="true"
                      cx={(edge.x1 + edge.x2) / 2}
                      cy={(edge.y1 + edge.y2) / 2}
                      r={16}
                      fill="#38bdf8"
                      stroke="#0f172a"
                      strokeWidth={2.5}
                    />
                  </g>
                ) : interactiveAll && onSelectEdge ? (
                  <line
                    data-interactive="true"
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke="transparent"
                    strokeWidth={28}
                    strokeLinecap="round"
                    className="sandbox-hit-edge"
                  />
                ) : null}

                {/* AI Decision Inspector ghost marker (see ghostHexId above) */}
                {isGhost && (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke="#a78bfa" strokeWidth={9} strokeOpacity={0.8} strokeLinecap="round" strokeDasharray="3,5">
                      <animate attributeName="stroke-opacity" values="0.4;0.95;0.4" dur="1.4s" repeatCount="indefinite" />
                    </line>
                    <text x={(edge.x1 + edge.x2) / 2} y={(edge.y1 + edge.y2) / 2 - 14} textAnchor="middle" fontSize="16">💡</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 4. Render Vertices (Settlements, Cities, and Highlighted Legal Vertices with Large Touch Hit Targets) */}
          {Object.values(board.vertices).map((vertex) => {
            const building = board.buildings[vertex.id];
            const isHighlighted = highlightedVertices?.has(vertex.id) ?? false;
            const isGhost = ghostVertexId === vertex.id;
            if (!building && !isHighlighted && !interactiveAll && !isGhost) return null;

            const pColor: PlayerColor = building
              ? playerColors[building.ownerId] ?? 'red'
              : 'red';

            return (
              <g
                key={vertex.id}
                transform={`translate(${vertex.x}, ${vertex.y})`}
                onClick={() => {
                  if (hasMovedRef.current) return;
                  if ((isHighlighted || interactiveAll) && onSelectVertex) {
                    onSelectVertex(vertex.id);
                  }
                }}
                style={{ cursor: (isHighlighted || (interactiveAll && onSelectVertex)) ? 'pointer' : 'default' }}
              >
                {building && building.type === 'settlement' && (
                  <image
                    href={SETTLEMENT_SVG_BY_COLOR[pColor]}
                    x={-33}
                    y={-33}
                    width={66}
                    height={66}
                    style={{
                      pointerEvents: 'none',
                      filter: `${PIECE_COLOR_FILTER[pColor]}drop-shadow(0 2px 4px rgba(0,0,0,0.85)) drop-shadow(0 0 2px rgba(255,255,255,0.75))`
                    }}
                  />
                )}

                {building && building.type === 'city' && (
                  <image
                    href={CITY_SVG_BY_COLOR[pColor]}
                    x={-37.5}
                    y={-42}
                    width={75}
                    height={75}
                    style={{
                      pointerEvents: 'none',
                      filter: `${PIECE_COLOR_FILTER[pColor]}drop-shadow(0 3px 5px rgba(0,0,0,0.9)) drop-shadow(0 0 2px rgba(255,255,255,0.8))`
                    }}
                  />
                )}

                {isHighlighted ? (
                  <g>
                    {/* Generous touch hit circle */}
                    <circle
                      data-interactive="true"
                      cx={0}
                      cy={0}
                      r={24}
                      fill="transparent"
                    />
                    <circle
                      data-interactive="true"
                      cx={0}
                      cy={0}
                      r={building ? 28 : 18}
                      fill="rgba(56, 189, 248, 0.55)"
                      stroke="#38bdf8"
                      strokeWidth={3.5}
                    />
                  </g>
                ) : interactiveAll && onSelectVertex ? (
                  <circle
                    data-interactive="true"
                    cx={0}
                    cy={0}
                    r={22}
                    fill="transparent"
                    className="sandbox-hit-vertex"
                  />
                ) : null}

                {/* AI Decision Inspector ghost marker (see ghostHexId above) */}
                {isGhost && (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle cx={0} cy={0} r={building ? 32 : 20} fill="rgba(167, 139, 250, 0.28)" stroke="#a78bfa" strokeWidth={3.5} strokeDasharray="4,4">
                      <animate attributeName="opacity" values="0.5;1;0.5" dur="1.4s" repeatCount="indefinite" />
                    </circle>
                    <text x={0} y={building ? -40 : -28} textAnchor="middle" fontSize="16">💡</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

      </svg>
    </div>
  );
};
