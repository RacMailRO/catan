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
}

const TERRAIN_FALLBACK_FILL: Record<TerrainType, string> = {
  forest: '#166534',
  hills: '#b45309',
  pasture: '#4d7c0f',
  fields: '#ca8a04',
  mountains: '#475569',
  desert: '#d6bc8b'
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
  desert: ['/terrain_desert_1.png']
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

const SETTLEMENT_SVG_BY_COLOR: Record<PlayerColor, string> = {
  red: '/settlement_red.22949197b57f9cfd968b.svg',
  blue: '/settlement_blue.bad4cdb43d65c329deda.svg',
  orange: '/settlement_orange.774ddafc8cc0595acdb7.svg',
  green: '/settlement_green.1b78c696cd137be02fae.svg'
};

const CITY_SVG_BY_COLOR: Record<PlayerColor, string> = {
  red: '/city_red.svg',
  blue: '/city_blue.svg',
  orange: '/city_orange.svg',
  green: '/city_green.svg'
};

const ROAD_SVG_BY_COLOR: Record<PlayerColor, string> = {
  red: '/road_red.41c6cbd9278108542715.svg',
  blue: '/road_blue.3301e2eed15cae5a6a05.svg',
  orange: '/road_orange.07bb26b8c1e63dd438c7.svg',
  green: '/road_green.d206aed3747b3687bc40.svg'
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

interface OuterSeaHex {
  id: string;
  x: number;
  y: number;
  q: number;
  r: number;
}

// Rings 4-6 beyond the island's immediate ring-3 sea border exist so a portrait phone has
// real sea tiles to show instead of empty background when the viewBox below stretches
// taller to fit the screen — not just decoration.
const OUTER_SEA_MAX_RING = 6;

function generateOuterSeaRing(): OuterSeaHex[] {
  const ring: OuterSeaHex[] = [];
  for (let q = -OUTER_SEA_MAX_RING; q <= OUTER_SEA_MAX_RING; q++) {
    for (let r = -OUTER_SEA_MAX_RING; r <= OUTER_SEA_MAX_RING; r++) {
      const s = -q - r;
      const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (dist >= 3 && dist <= OUTER_SEA_MAX_RING) {
        const { x, y } = axialToPixel(q, r, HEX_RADIUS);
        ring.push({ id: `sea_${q}_${r}`, x, y, q, r });
      }
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

// Angle from this outer sea hex to the midpoint of its harbor's two coastal vertices —
// the exact direction the dock needs to face. (The island center is NOT a safe stand-in:
// a harbor's coastal edge is often tangentially offset from the pure hex-to-center
// radial, which visibly misaimed the dock art.)
function harborFacingAngleDeg(
  sea: OuterSeaHex,
  harbor: BoardState['harbors'][number],
  vertices: BoardState['vertices']
): number {
  const v1 = vertices[harbor.vertexIds[0]];
  const v2 = vertices[harbor.vertexIds[1]];
  const tx = v1 && v2 ? (v1.x + v2.x) / 2 : sea.x;
  const ty = v1 && v2 ? (v1.y + v2.y) / 2 : sea.y;
  return (Math.atan2(ty - sea.y, tx - sea.x) * 180) / Math.PI;
}

export const BoardSvg: React.FC<BoardSvgProps> = ({
  board,
  playerColors,
  highlightedVertices,
  highlightedEdges,
  highlightedHexes,
  onSelectVertex,
  onSelectEdge,
  onSelectHex
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // The island + its immediate ring-3 sea border needs at least this much space (half-extents)
  // to render fully — this is the board's natural, landscape-ish footprint (aspect ~1.1).
  // On a narrower/taller container (a phone in portrait), fitting that fixed footprint by
  // width used to leave most of the height as empty background. Rings 4-6 (see
  // generateOuterSeaRing) exist so there's real sea to show when we stretch the viewBox
  // taller to use more of a portrait screen — capped at MIN_ASPECT so we never stretch past
  // what that extra sea ring can actually cover with tiles.
  const BOARD_HALF_W = 640;
  const BOARD_HALF_H = 580;
  const BOARD_MAX_HALF_W = 1120;
  const BOARD_MAX_HALF_H = 995;
  const BOARD_MIN_ASPECT = 0.65;
  const [viewBoxHalfExtent, setViewBoxHalfExtent] = useState({ w: BOARD_HALF_W, h: BOARD_HALF_H });

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const container = svgEl.parentElement;
    if (!container) return;

    const applySize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const containerAspect = width / height;
      const contentAspect = BOARD_HALF_W / BOARD_HALF_H;
      if (containerAspect >= contentAspect) {
        // Wide/landscape container: stretch width to match, height stays at its natural size.
        setViewBoxHalfExtent({
          w: Math.min(BOARD_MAX_HALF_W, BOARD_HALF_H * containerAspect),
          h: BOARD_HALF_H
        });
      } else {
        // Portrait container: stretch height, but never past MIN_ASPECT (beyond that, the
        // extra sea ring runs out and we'd just be showing empty background instead of tiles).
        const targetAspect = Math.max(containerAspect, BOARD_MIN_ASPECT);
        setViewBoxHalfExtent({
          w: BOARD_HALF_W,
          h: Math.min(BOARD_MAX_HALF_H, BOARD_HALF_W / targetAspect)
        });
      }
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applySize(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(container);
    applySize(container.clientWidth, container.clientHeight);

    return () => ro.disconnect();
  }, []);
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

  // Touch/mouse drag deltas arrive in CSS pixels, but `pan` is in viewBox units — and on a
  // phone the viewBox (1280-2240 units) is rendered into a much smaller CSS width (e.g.
  // ~380px), so adding raw pixel deltas to pan moved the board at a fraction of finger speed.
  // Convert each delta through the current viewBox-units-per-CSS-pixel ratio so a drag tracks
  // the finger 1:1 regardless of zoom or screen size.
  const getDragScale = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return { x: 1, y: 1 };
    const rect = svgEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 1, y: 1 };
    return {
      x: (viewBoxHalfExtent.w * 2) / rect.width,
      y: (viewBoxHalfExtent.h * 2) / rect.height
    };
  };

  const outerSeaRing = useMemo(() => generateOuterSeaRing(), []);

  // Each harbor sits on whichever outer sea hex is nearest to its dock position.
  const harborBySeaHexId = useMemo(() => {
    const map = new Map<string, (typeof board.harbors)[number]>();
    for (const harbor of board.harbors) {
      let nearest: OuterSeaHex | undefined;
      let nearestDist = Infinity;
      for (const sea of outerSeaRing) {
        const dist = Math.hypot(sea.x - harbor.x, sea.y - harbor.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = sea;
        }
      }
      if (nearest) map.set(nearest.id, harbor);
    }
    return map;
  }, [board.harbors, outerSeaRing]);

  // The true island outline, walked from the coastal edges (the same ones board.ts uses to
  // place harbors) rather than drawn as 19 separate per-hex halos. Those separate halos
  // overlapped inconsistently at corners where hexes meet, leaving small gaps/overlaps in the
  // sandy border; one continuous loop with round joins reads as a single clean coastline.
  const coastlineLoopPoints = useMemo(() => {
    const coastalEdges = Object.values(board.edges).filter((e) => e.adjacentHexIds.length === 1);
    if (coastalEdges.length === 0) return '';

    const edgesByVertex = new Map<string, typeof coastalEdges>();
    for (const e of coastalEdges) {
      for (const vId of [e.v1, e.v2]) {
        const list = edgesByVertex.get(vId);
        if (list) list.push(e);
        else edgesByVertex.set(vId, [e]);
      }
    }

    const visited = new Set<string>();
    const firstEdge = coastalEdges[0]!;
    const path: string[] = [];
    let currentVertexId = firstEdge.v1;
    let currentEdge: (typeof coastalEdges)[number] | undefined = firstEdge;

    while (currentEdge && !visited.has(currentEdge.id)) {
      visited.add(currentEdge.id);
      const v = board.vertices[currentVertexId];
      if (v) path.push(`${v.x},${v.y}`);
      const nextVertexId: string = currentEdge.v1 === currentVertexId ? currentEdge.v2 : currentEdge.v1;
      currentVertexId = nextVertexId;
      currentEdge = (edgesByVertex.get(nextVertexId) ?? []).find((e) => !visited.has(e.id));
    }

    return path.join(' ');
  }, [board.edges, board.vertices]);

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
      const target = e.target as HTMLElement;
      if (target && target.dataset && target.dataset.interactive === 'true') {
        return;
      }
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
        e.preventDefault();
        const t = e.touches[0]!;
        const dx = t.clientX - touchStateRef.current.startX;
        const dy = t.clientY - touchStateRef.current.startY;
        const scale = getDragScale();
        setPan({
          x: touchStateRef.current.startPanX + dx * scale.x,
          y: touchStateRef.current.startPanY + dy * scale.y
        });
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
    const target = e.target as HTMLElement;
    if (target.dataset.interactive === 'true') return;
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
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 0A. Render 18 Outer Sea Hexes using the original port-tile artwork: the 9 hexes
              with a harbor get that harbor's 2:1/3:1 tile (cropped from /porturi-2.jpg or
              /porturi-3.jpg), rotated to face the island; the rest get the plain open-sea
              tile cropped from /porturi-3.jpg, for a consistent look across the sea ring. */}
          {outerSeaRing.map((sea) => {
            const harbor = harborBySeaHexId.get(sea.id);
            const href = harbor ? PORT_HARBOR_IMAGE[harbor.type] : SEA_TILE_IMAGE;
            const rotationDeg = harbor
              ? harborFacingAngleDeg(sea, harbor, board.vertices) - PORT_ART_DEFAULT_ANGLE_DEG
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

          {/* 0B. Sandy fill behind the 19 Island Hexes — keeps the thin seams between adjacent
              tiles sand-colored rather than showing the sea through them. */}
          {Object.values(board.hexes).map((hex) => (
            <polygon
              key={`sand-${hex.id}`}
              points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS + 7)}
              fill="#fde68a"
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {/* 0C. One continuous coastline stroke along the island's true outer boundary
              (walked from its coastal edges), drawn over the per-hex fill above so the
              border reads as a single smooth shoreline instead of 19 separate hex outlines
              whose corners don't quite line up. */}
          {coastlineLoopPoints && (
            <polygon
              points={coastlineLoopPoints}
              fill="none"
              stroke="#d97706"
              strokeWidth={6}
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* 1. Render 19 Island Hex Tiles using the per-terrain tile art & /numbers.png */}
          {Object.values(board.hexes).map((hex, hexIdx) => {
            const isHighlighted = highlightedHexes?.has(hex.id) ?? false;
            const hasRobber = board.robberHexId === hex.id;
            const terrainVariants = TERRAIN_IMAGES[hex.terrain];
            const terrainHref = terrainVariants[hexIdx % terrainVariants.length]!;

            return (
              <g
                key={hex.id}
                data-hex-id={hex.id}
                onClick={() => {
                  if (isHighlighted && onSelectHex) {
                    onSelectHex(hex.id);
                  }
                }}
                style={{ cursor: isHighlighted ? 'pointer' : 'inherit' }}
              >
                {/* Fallback polygon + interactive hit target */}
                <polygon
                  data-interactive={isHighlighted ? 'true' : undefined}
                  points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS - 1)}
                  fill={TERRAIN_FALLBACK_FILL[hex.terrain]}
                />

                {/* Clipped Terrain Artwork */}
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

                {/* Sandy Hexagon Border (or glowing blue if selectable for Robber) */}
                <polygon
                  data-interactive={isHighlighted ? 'true' : undefined}
                  points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS - 1.5)}
                  fill={isHighlighted ? 'rgba(56, 189, 248, 0.2)' : 'none'}
                  stroke={isHighlighted ? '#38bdf8' : '#fde68a'}
                  strokeWidth={isHighlighted ? 5.5 : 3.2}
                  strokeOpacity={isHighlighted ? 1 : 0.82}
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

                {/* Robber Pawn */}
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

                {/* Highlight ring when moving robber */}
                {isHighlighted && (
                  <circle
                    data-interactive="true"
                    cx={hex.x}
                    cy={hex.y + 2}
                    r={42}
                    fill="rgba(56, 189, 248, 0.3)"
                    stroke="#38bdf8"
                    strokeWidth={4}
                    strokeDasharray="6,3"
                  />
                )}
              </g>
            );
          })}

          {/* 2. Colored markers on each harbor's 2 trade-bonus vertices — a settlement on
              either one gets that harbor's rate. The dock/ratio art itself is baked into
              the sea hex's tile (rendered above); this just marks which 2 spots benefit. */}
          {board.harbors.map((harbor) => {
            const v1 = board.vertices[harbor.vertexIds[0]];
            const v2 = board.vertices[harbor.vertexIds[1]];
            if (!v1 || !v2) return null;
            const color = HARBOR_VERTEX_COLOR[harbor.type];

            return (
              <g key={harbor.id} style={{ pointerEvents: 'none' }}>
                {[v1, v2].map((v, idx) => (
                  <g key={idx} transform={`translate(${v.x}, ${v.y})`}>
                    <circle r={11} fill={color} fillOpacity={0.92} stroke="#fef3c7" strokeWidth={2} />
                    <text textAnchor="middle" y={4} fontSize="11">
                      {harbor.type === 'generic' ? '⚓' : RESOURCE_ICONS[harbor.type]}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}

          {/* 3. Render Edges (Built Roads & Highlighted Legal Road Edges with Large Touch Hit Targets) */}
          {Object.values(board.edges).map((edge) => {
            const builtRoad = board.roads[edge.id];
            const isHighlighted = highlightedEdges?.has(edge.id) ?? false;
            if (!builtRoad && !isHighlighted) return null;

            const ownerPColor: PlayerColor = builtRoad
              ? playerColors[builtRoad.ownerId] ?? 'red'
              : 'red';

            let roadTransform = '';
            let roadDisplayWidth = 0;
            let roadDisplayHeight = 0;
            if (builtRoad) {
              const dx = edge.x2 - edge.x1;
              const dy = edge.y2 - edge.y1;
              const length = Math.hypot(dx, dy);
              const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
              const midX = (edge.x1 + edge.x2) / 2;
              const midY = (edge.y1 + edge.y2) / 2;
              roadDisplayHeight = length;
              roadDisplayWidth = length * (ROAD_ART_WIDTH / ROAD_ART_HEIGHT);
              roadTransform = `translate(${midX}, ${midY}) rotate(${angleDeg})`;
            }

            return (
              <g
                key={edge.id}
                onClick={() => {
                  if (isHighlighted && onSelectEdge) {
                    onSelectEdge(edge.id);
                  }
                }}
                style={{ cursor: isHighlighted ? 'pointer' : 'default' }}
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
                      style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' }}
                    />
                  </g>
                )}

                {isHighlighted && (
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
                )}
              </g>
            );
          })}

          {/* 4. Render Vertices (Settlements, Cities, and Highlighted Legal Vertices with Large Touch Hit Targets) */}
          {Object.values(board.vertices).map((vertex) => {
            const building = board.buildings[vertex.id];
            const isHighlighted = highlightedVertices?.has(vertex.id) ?? false;
            if (!building && !isHighlighted) return null;

            const pColor: PlayerColor = building
              ? playerColors[building.ownerId] ?? 'red'
              : 'red';

            return (
              <g
                key={vertex.id}
                transform={`translate(${vertex.x}, ${vertex.y})`}
                onClick={() => {
                  if (isHighlighted && onSelectVertex) {
                    onSelectVertex(vertex.id);
                  }
                }}
                style={{ cursor: isHighlighted ? 'pointer' : 'default' }}
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
                      filter:
                        'drop-shadow(0 2px 4px rgba(0,0,0,0.85)) drop-shadow(0 0 2px rgba(255,255,255,0.75))'
                    }}
                  />
                )}

                {building && building.type === 'city' && (
                  <image
                    href={CITY_SVG_BY_COLOR[pColor]}
                    x={-28}
                    y={-32}
                    width={56}
                    height={56}
                    style={{
                      pointerEvents: 'none',
                      filter:
                        'drop-shadow(0 3px 5px rgba(0,0,0,0.9)) drop-shadow(0 0 2px rgba(255,255,255,0.8))'
                    }}
                  />
                )}

                {isHighlighted && (
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
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
