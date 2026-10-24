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

/**
 * Column mapping in /terrains_hexes.png (7 columns x 4 rows):
 * col 0 = water/sea, col 1 = desert, col 2 = forest, col 3 = hills,
 * col 4 = pasture, col 5 = mountains, col 6 = fields
 */
const TERRAIN_SPRITE_COL: Record<TerrainType, number> = {
  desert: 1,
  forest: 2,
  hills: 3,
  pasture: 4,
  mountains: 5,
  fields: 6
};

/**
 * Column mapping in /harbors.png (7 columns x 1 row):
 * col 0 = 2:1 sheep, col 1 = 2:1 wheat, col 2 = 2:1 brick,
 * col 3 = 2:1 wood, col 4 = 2:1 ore, col 5 = 3:1 generic
 */
const HARBOR_SPRITE_COL: Record<HarborType, number> = {
  sheep: 0,
  wheat: 1,
  brick: 2,
  wood: 3,
  ore: 4,
  generic: 5
};

/**
 * Column mapping in /numbers.png (10 columns x 1 row):
 * [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]
 */
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

  const outerSeaRing = useMemo(() => generateOuterSeaRing(), []);

  // Non-passive wheel listener to strictly prevent page scrolling while zooming the SVG board
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      setZoom((prev) => Math.min(2.8, Math.max(0.55, Number((prev * factor).toFixed(2)))));
    };

    svgEl.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      svgEl.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
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
    if (!isDragging) return;
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
  // Larger, high-visibility harbor badges (82x82 px)
  const harborBadgeSize = 82;
  const harborRadius = harborBadgeSize / 2;
  const tokenSize = 54;
  const tokenRadius = tokenSize / 2;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div className="zoom-controls" style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 12 }}>
        <button
          type="button"
          className="btn"
          onClick={() => setZoom((z) => Math.min(2.8, Number((z + 0.2).toFixed(2))))}
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
          onClick={() => setZoom((z) => Math.max(0.55, Number((z - 0.2).toFixed(2))))}
          title="Zoom Out"
        >
          －
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox="-640 -580 1280 1160"
        style={{
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

          {/* Clip paths for the 9 harbors */}
          {board.harbors.map((harbor) => (
            <clipPath key={`clip-harbor-${harbor.id}`} id={`clip-harbor-${harbor.id}`}>
              <circle cx={harbor.x} cy={harbor.y} r={harborRadius} />
            </clipPath>
          ))}
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 0A. Render 18 Outer Sea Hexes from /terrains_hexes.png (col 0, row 0) */}
          {outerSeaRing.map((sea) => (
            <g key={sea.id}>
              <g clipPath={`url(#clip-${sea.id})`}>
                <image
                  href="/terrains_hexes.png"
                  x={sea.x - hexCellW / 2}
                  y={sea.y - hexCellH / 2}
                  width={hexCellW * 7}
                  height={hexCellH * 4}
                  preserveAspectRatio="none"
                  opacity={0.94}
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
          ))}

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
                    r={38}
                    fill="rgba(56, 189, 248, 0.25)"
                    stroke="#38bdf8"
                    strokeWidth={3.5}
                    strokeDasharray="6,3"
                  />
                )}
              </g>
            );
          })}

          {/* 2. Render 9 Harbors & Docks on top of Sea & Coastline so they are large and clearly visible */}
          {board.harbors.map((harbor) => {
            const v1 = board.vertices[harbor.vertexIds[0]];
            const v2 = board.vertices[harbor.vertexIds[1]];
            if (!v1 || !v2) return null;
            const spriteCol = HARBOR_SPRITE_COL[harbor.type] ?? 5;
            const ratioText =
              harbor.type === 'generic' ? '3:1' : `2:1 ${RESOURCE_ICONS[harbor.type]}`;

            return (
              <g key={harbor.id} style={{ pointerEvents: 'none' }}>
                {/* Wooden Piers to coastal vertices */}
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

                {/* Large Harbor Ship Sprite from /harbors.png */}
                <circle
                  cx={harbor.x}
                  cy={harbor.y}
                  r={harborRadius + 3}
                  fill="#fef3c7"
                  stroke="#b45309"
                  strokeWidth={3.5}
                />
                <g clipPath={`url(#clip-harbor-${harbor.id})`}>
                  <image
                    href="/harbors.png"
                    x={harbor.x - harborRadius - spriteCol * harborBadgeSize}
                    y={harbor.y - harborRadius}
                    width={harborBadgeSize * 7}
                    height={harborBadgeSize}
                    preserveAspectRatio="none"
                  />
                </g>

                {/* Crisp Trade Ratio Pill Badge on the bottom rim of the Harbor */}
                <rect
                  x={harbor.x - 28}
                  y={harbor.y + harborRadius - 12}
                  width={56}
                  height={20}
                  rx={6}
                  fill="#0f172a"
                  stroke="#f59e0b"
                  strokeWidth={1.8}
                />
                <text
                  x={harbor.x}
                  y={harbor.y + harborRadius + 2}
                  textAnchor="middle"
                  fill="#fef3c7"
                  fontSize="11.5"
                  fontWeight="800"
                >
                  {ratioText}
                </text>
              </g>
            );
          })}

          {/* 3. Render Edges (Built Roads & Highlighted Legal Road Edges) */}
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
                    <line
                      data-interactive="true"
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke="#38bdf8"
                      strokeWidth={15}
                      strokeOpacity={0.8}
                      strokeLinecap="round"
                    />
                    <circle
                      data-interactive="true"
                      cx={(edge.x1 + edge.x2) / 2}
                      cy={(edge.y1 + edge.y2) / 2}
                      r={11}
                      fill="#38bdf8"
                      stroke="#0f172a"
                      strokeWidth={2}
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* 4. Render Vertices (Built Settlements, Cities WITHOUT circles, larger & colored per player) */}
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
                  <circle
                    data-interactive="true"
                    cx={0}
                    cy={0}
                    r={building ? 26 : 16}
                    fill="rgba(56, 189, 248, 0.5)"
                    stroke="#38bdf8"
                    strokeWidth={3.5}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
