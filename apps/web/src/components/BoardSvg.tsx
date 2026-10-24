import React, { useState, useRef } from 'react';
import {
  BoardState,
  DICE_PIPS,
  HEX_RADIUS,
  PlayerColor,
  TerrainType
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

const TERRAIN_FILL: Record<TerrainType, string> = {
  forest: '#166534',
  hills: '#b45309',
  pasture: '#4d7c0f',
  fields: '#ca8a04',
  mountains: '#475569',
  desert: '#d6bc8b'
};

const TERRAIN_ICON: Record<TerrainType, string> = {
  forest: '🌲',
  hills: '🧱',
  pasture: '🐑',
  fields: '🌾',
  mountains: '⛰️',
  desert: '🏜️'
};

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
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0
  });

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((prev) => Math.min(2.6, Math.max(0.55, Number((prev * factor).toFixed(2)))));
  };

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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', flex: 1, display: 'flex' }}>
      <div className="zoom-controls" style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 12 }}>
        <button
          type="button"
          className="btn"
          onClick={() => setZoom((z) => Math.min(2.6, Number((z + 0.2).toFixed(2))))}
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
        viewBox="-560 -520 1120 1040"
        style={{
          width: '100%',
          height: '100%',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none'
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Outer Island Coastline Glow */}
          <circle cx={0} cy={0} r={475} fill="#0ea5e9" fillOpacity={0.12} />

          {/* 1. Render Harbors & Docks */}
          {board.harbors.map((harbor) => {
            const v1 = board.vertices[harbor.vertexIds[0]];
            const v2 = board.vertices[harbor.vertexIds[1]];
            if (!v1 || !v2) return null;
            const label =
              harbor.type === 'generic'
                ? '3:1'
                : `2:1 ${RESOURCE_ICONS[harbor.type]}`;
            return (
              <g key={harbor.id}>
                <line
                  x1={harbor.x}
                  y1={harbor.y}
                  x2={v1.x}
                  y2={v1.y}
                  stroke="#fde68a"
                  strokeWidth={4}
                  strokeDasharray="5,4"
                />
                <line
                  x1={harbor.x}
                  y1={harbor.y}
                  x2={v2.x}
                  y2={v2.y}
                  stroke="#fde68a"
                  strokeWidth={4}
                  strokeDasharray="5,4"
                />
                <circle
                  cx={harbor.x}
                  cy={harbor.y}
                  r={24}
                  fill="#0f172a"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                />
                <text
                  x={harbor.x}
                  y={harbor.y + 4}
                  textAnchor="middle"
                  fill="#fef3c7"
                  fontSize="11"
                  fontWeight="700"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* 2. Render 19 Hex Tiles */}
          {Object.values(board.hexes).map((hex) => {
            const isHighlighted = highlightedHexes?.has(hex.id) ?? false;
            const hasRobber = board.robberHexId === hex.id;
            const pips = hex.numberToken ? DICE_PIPS[hex.numberToken] ?? 0 : 0;
            const isRed = hex.numberToken === 6 || hex.numberToken === 8;

            return (
              <g
                key={hex.id}
                onClick={() => {
                  if (isHighlighted && onSelectHex) {
                    onSelectHex(hex.id);
                  }
                }}
                style={{ cursor: isHighlighted ? 'pointer' : ' inherit' }}
              >
                <polygon
                  data-interactive={isHighlighted ? 'true' : undefined}
                  points={getHexPolygonPoints(hex.x, hex.y, HEX_RADIUS - 2)}
                  fill={TERRAIN_FILL[hex.terrain]}
                  stroke={isHighlighted ? '#38bdf8' : '#e2e8f0'}
                  strokeWidth={isHighlighted ? 5 : 2.5}
                  strokeOpacity={isHighlighted ? 1 : 0.45}
                />

                {/* Terrain icon & Hex ID */}
                <text
                  x={hex.x}
                  y={hex.y - 38}
                  textAnchor="middle"
                  fontSize="22"
                  style={{ pointerEvents: 'none' }}
                >
                  {TERRAIN_ICON[hex.terrain]}
                </text>
                <text
                  x={hex.x}
                  y={hex.y + 56}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(255,255,255,0.65)"
                  fontWeight="600"
                  style={{ pointerEvents: 'none' }}
                >
                  {hex.id}
                </text>

                {/* Number Token */}
                {hex.numberToken !== null && (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle
                      cx={hex.x}
                      cy={hex.y + 4}
                      r={24}
                      fill="#fef3c7"
                      stroke="#78350f"
                      strokeWidth={2}
                    />
                    <text
                      x={hex.x}
                      y={hex.y + 9}
                      textAnchor="middle"
                      fontSize="19"
                      fontWeight="800"
                      fill={isRed ? '#dc2626' : '#1e293b'}
                    >
                      {hex.numberToken}
                    </text>
                    <text
                      x={hex.x}
                      y={hex.y + 21}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="800"
                      fill={isRed ? '#dc2626' : '#475569'}
                    >
                      {'•'.repeat(pips)}
                    </text>
                  </g>
                )}

                {/* Robber Token */}
                {hasRobber && (
                  <g
                    transform={`translate(${hex.x + 28}, ${hex.y - 22})`}
                    style={{ pointerEvents: 'none' }}
                  >
                    <circle cx={0} cy={0} r={17} fill="#111827" stroke="#facc15" strokeWidth={2.5} />
                    <text x={0} y={6} textAnchor="middle" fontSize="16">
                      🥷
                    </text>
                  </g>
                )}

                {/* Highlight ring when moving robber */}
                {isHighlighted && (
                  <circle
                    data-interactive="true"
                    cx={hex.x}
                    cy={hex.y + 4}
                    r={34}
                    fill="rgba(56, 189, 248, 0.22)"
                    stroke="#38bdf8"
                    strokeWidth={3}
                    strokeDasharray="6,3"
                  />
                )}
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
                      strokeWidth={13}
                      strokeLinecap="round"
                    />
                    <line
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke={ownerColor}
                      strokeWidth={9}
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
                      strokeWidth={14}
                      strokeOpacity={0.75}
                      strokeLinecap="round"
                    />
                    <circle
                      data-interactive="true"
                      cx={(edge.x1 + edge.x2) / 2}
                      cy={(edge.y1 + edge.y2) / 2}
                      r={10}
                      fill="#38bdf8"
                      stroke="#0f172a"
                      strokeWidth={2}
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* 4. Render Vertices (Built Settlements, Cities & Highlighted Legal Vertices) */}
          {Object.values(board.vertices).map((vertex) => {
            const building = board.buildings[vertex.id];
            const isHighlighted = highlightedVertices?.has(vertex.id) ?? false;
            if (!building && !isHighlighted) return null;

            const pColor: PlayerColor = building
              ? playerColors[building.ownerId] ?? 'red'
              : 'red';
            const fillHex = PLAYER_COLOR_HEX[pColor];

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
                  <g>
                    <circle cx={0} cy={0} r={17} fill={fillHex} stroke="#fff" strokeWidth={2.5} />
                    <image
                      href={SETTLEMENT_SVG_BY_COLOR[pColor]}
                      x={-13}
                      y={-13}
                      width={26}
                      height={26}
                    />
                  </g>
                )}

                {building && building.type === 'city' && (
                  <g>
                    <circle cx={0} cy={0} r={22} fill={fillHex} stroke="#facc15" strokeWidth={3.5} />
                    <image
                      href="/city_gold.ae8ea43a6dc22d3aace7.svg"
                      x={-15}
                      y={-15}
                      width={30}
                      height={30}
                    />
                  </g>
                )}

                {isHighlighted && (
                  <circle
                    data-interactive="true"
                    cx={0}
                    cy={0}
                    r={building ? 24 : 15}
                    fill="rgba(56, 189, 248, 0.45)"
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
