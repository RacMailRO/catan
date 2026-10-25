import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  BoardState,
  HEX_RADIUS,
  HarborType,
  PlayerColor,
  TerrainType,
  axialToPixel
} from '@catan/core';
import { Locale } from '../i18n';

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

const TERRAIN_SPRITE_COL: Record<TerrainType, number> = {
  desert: 1,
  forest: 2,
  hills: 3,
  pasture: 4,
  mountains: 5,
  fields: 6
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
// The baked-in dock/sand in the original tile art points toward this angle by default
// (0° = east, 90° = south, screen-space degrees); each harbor hex is rotated from this
// to the angle that points back toward the island so the pier faces the coast.
const PORT_ART_DEFAULT_ANGLE_DEG = 62.5;

const NUMBER_TOKEN_ORDER = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

const PLAYER_COLOR_HEX: Record<PlayerColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  orange: '#f97316',
  green: '#22c55e'
};

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
}

function generateOuterSeaRing(): OuterSeaHex[] {
  const ring: OuterSeaHex[] = [];
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === 3) {
        const { x, y } = axialToPixel(q, r, HEX_RADIUS);
        ring.push({ id: `sea_${q}_${r}`, x, y });
      }
    }
  }
  return ring;
}

// Angle from this outer sea hex back toward the island center (0,0) — the coast lies in
// roughly this direction, so rotating a harbor tile's art to face this angle points its
// dock at the island rather than out to open sea.
function seaHexAngleToCenterDeg(sea: OuterSeaHex): number {
  return (Math.atan2(-sea.y, -sea.x) * 180) / Math.PI;
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
        setPan({
          x: touchStateRef.current.startPanX + dx,
          y: touchStateRef.current.startPanY + dy
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
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Bounding cell dimensions for pointy-top hex sprite from /terrains_hexes.png
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
        viewBox="-640 -580 1280 1160"
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

          {/* Clip paths for the 19 island terrain hexes and their number tokens */}
          {Object.values(board.hexes).map((hex) => (
            <React.Fragment key={`defs-${hex.id}`}>
              <clipPath id={`clip-hex-${hex.id}`}>
                <polygon points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS - 1.5)} />
              </clipPath>
              <clipPath id={`clip-token-${hex.id}`}>
                <circle cx={hex.x} cy={hex.y + 2} r={tokenRadius} />
              </clipPath>
            </React.Fragment>
          ))}

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
              ? seaHexAngleToCenterDeg(sea) - PORT_ART_DEFAULT_ANGLE_DEG
              : 0;
            // A rotated image must be oversized (a square at least as wide as the hex is
            // tall) so its corners still cover the hex's own corners at every angle —
            // the tightly-fit hexCellW x hexCellH box used for unrotated tiles would clip.
            const imgSize = harbor ? hexCellH * 1.1 : 0;

            return (
              <g key={sea.id}>
                <g
                  clipPath={`url(#clip-${sea.id})`}
                  transform={`rotate(${rotationDeg}, ${sea.x}, ${sea.y})`}
                >
                  {harbor ? (
                    <image
                      href={href}
                      x={sea.x - imgSize / 2}
                      y={sea.y - imgSize / 2}
                      width={imgSize}
                      height={imgSize}
                      preserveAspectRatio="none"
                    />
                  ) : (
                    <image
                      href={href}
                      x={sea.x - hexCellW / 2}
                      y={sea.y - hexCellH / 2}
                      width={hexCellW}
                      height={hexCellH}
                      preserveAspectRatio="none"
                    />
                  )}
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

          {/* 0B. Sandy Shoreline Halo behind the 19 Island Hexes */}
          {Object.values(board.hexes).map((hex) => (
            <polygon
              key={`sand-${hex.id}`}
              points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS + 7)}
              fill="#fde68a"
              stroke="#d97706"
              strokeWidth={3}
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {/* 1. Render 19 Island Hex Tiles using /terrains_hexes.png & /numbers.png */}
          {Object.values(board.hexes).map((hex, hexIdx) => {
            const isHighlighted = highlightedHexes?.has(hex.id) ?? false;
            const hasRobber = board.robberHexId === hex.id;
            const spriteCol = TERRAIN_SPRITE_COL[hex.terrain];
            const spriteRow = hex.terrain === 'desert' ? 0 : hexIdx % 4;
            const tokenCol =
              hex.numberToken !== null ? NUMBER_TOKEN_ORDER.indexOf(hex.numberToken) : -1;

            return (
              <g
                key={hex.id}
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

                {/* Clipped Terrain Artwork from /terrains_hexes.png */}
                <g clipPath={`url(#clip-hex-${hex.id})`} style={{ pointerEvents: 'none' }}>
                  <image
                    href="/terrains_hexes.png"
                    x={hex.x - hexCellW / 2 - spriteCol * hexCellW}
                    y={hex.y - hexCellH / 2 - spriteRow * hexCellH}
                    width={hexCellW * 7}
                    height={hexCellH * 4}
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

                {/* Number Token from /numbers.png */}
                {hex.numberToken !== null && tokenCol >= 0 && (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle
                      cx={hex.x}
                      cy={hex.y + 2}
                      r={tokenRadius + 2}
                      fill="#fef3c7"
                      stroke="#78350f"
                      strokeWidth={2.5}
                    />
                    <g clipPath={`url(#clip-token-${hex.id})`}>
                      <image
                        href="/numbers.png"
                        x={hex.x - tokenRadius - tokenCol * tokenSize}
                        y={hex.y + 2 - tokenRadius}
                        width={tokenSize * 10}
                        height={tokenSize}
                        preserveAspectRatio="none"
                      />
                    </g>

                    {/* Official Spiral Letter Badge (A..R) */}
                    {hex.tokenLetter && (
                      <g transform={`translate(${hex.x + 16}, ${hex.y - 12})`}>
                        <circle cx={0} cy={0} r={8.5} fill="#78350f" stroke="#fde68a" strokeWidth={1.5} />
                        <text
                          x={0}
                          y={3}
                          textAnchor="middle"
                          fill="#fef3c7"
                          fontSize="9.5"
                          fontWeight="bold"
                          fontFamily="Arial, sans-serif"
                        >
                          {hex.tokenLetter}
                        </text>
                      </g>
                    )}
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

          {/* 2. Wooden piers from each harbor's sea hex to its two coastal vertices — the
              dock and trade-ratio label themselves are now baked into the sea hex's own
              tile artwork (rendered above), so this just ties the art to the exact two
              vertices that get the trade bonus. */}
          {board.harbors.map((harbor) => {
            const v1 = board.vertices[harbor.vertexIds[0]];
            const v2 = board.vertices[harbor.vertexIds[1]];
            if (!v1 || !v2) return null;

            return (
              <g key={harbor.id} style={{ pointerEvents: 'none' }}>
                <line
                  x1={harbor.x}
                  y1={harbor.y}
                  x2={v1.x}
                  y2={v1.y}
                  stroke="#78350f"
                  strokeWidth={9}
                  strokeLinecap="round"
                />
                <line
                  x1={harbor.x}
                  y1={harbor.y}
                  x2={v1.x}
                  y2={v1.y}
                  stroke="#fde68a"
                  strokeWidth={4}
                  strokeDasharray="6,4"
                  strokeLinecap="round"
                />
                <line
                  x1={harbor.x}
                  y1={harbor.y}
                  x2={v2.x}
                  y2={v2.y}
                  stroke="#78350f"
                  strokeWidth={9}
                  strokeLinecap="round"
                />
                <line
                  x1={harbor.x}
                  y1={harbor.y}
                  x2={v2.x}
                  y2={v2.y}
                  stroke="#fde68a"
                  strokeWidth={4}
                  strokeDasharray="6,4"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* 3. Render Edges (Built Roads & Highlighted Legal Road Edges with Large Touch Hit Targets) */}
          {Object.values(board.edges).map((edge) => {
            const builtRoad = board.roads[edge.id];
            const isHighlighted = highlightedEdges?.has(edge.id) ?? false;
            if (!builtRoad && !isHighlighted) return null;

            const ownerColor = builtRoad
              ? PLAYER_COLOR_HEX[playerColors[builtRoad.ownerId] ?? 'red']
              : '#38bdf8';

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
                  <>
                    <line
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke="#0f172a"
                      strokeWidth={15}
                      strokeLinecap="round"
                    />
                    <line
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke={ownerColor}
                      strokeWidth={10}
                      strokeLinecap="round"
                    />
                  </>
                )}

                {isHighlighted && (
                  <g>
                    {/* Generous invisible touch target line (width 32) */}
                    <line
                      data-interactive="true"
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke="transparent"
                      strokeWidth={32}
                      strokeLinecap="round"
                    />
                    <line
                      data-interactive="true"
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke="#38bdf8"
                      strokeWidth={16}
                      strokeOpacity={0.85}
                      strokeLinecap="round"
                    />
                    <circle
                      data-interactive="true"
                      cx={(edge.x1 + edge.x2) / 2}
                      cy={(edge.y1 + edge.y2) / 2}
                      r={14}
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
                    x={-22}
                    y={-22}
                    width={44}
                    height={44}
                    style={{
                      filter:
                        'drop-shadow(0 2px 4px rgba(0,0,0,0.85)) drop-shadow(0 0 2px rgba(255,255,255,0.75))'
                    }}
                  />
                )}

                {building && building.type === 'city' && (
                  <image
                    href={CITY_SVG_BY_COLOR[pColor]}
                    x={-27}
                    y={-27}
                    width={54}
                    height={54}
                    style={{
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
