import React, { useState, useMemo, useCallback } from 'react';
import {
  BoardState,
  BoardScenario,
  PlayerColor,
  TerrainType,
  generateStandardBoard,
  calculatePlayerLongestRoad,
  isVertexAvailableForSettlement,
  isVertexConnectedToPlayerRoad,
  isEdgeLegalForPlayerRoad,
  isEdgeLegalForPlayerShip,
  PLAYER_COLORS
} from '@catan/core';
import { BoardSvg } from './BoardSvg';
import { Locale } from '../i18n';

export type SandboxTool = 'settlement' | 'city' | 'road' | 'ship' | 'robber' | 'eraser';
export type SandboxPlacementMode = 'rules' | 'free';

export interface SandboxModeProps {
  locale: Locale;
  onExit?: () => void;
}

const SCENARIO_LABELS: Record<BoardScenario, { ro: string; en: string }> = {
  classic: {
    ro: 'Harta Clasică (19 hexuri, 3-4 jucători)',
    en: 'Classic Map (19 hexes, 3-4 players)'
  },
  expansion: {
    ro: 'Extensie 5-6 Jucători (30 hexuri)',
    en: '5-6 Player Expansion (30 hexes)'
  },
  seafarers_shores: {
    ro: 'Navigatori: Țărmuri Noi (30 hexuri)',
    en: 'Seafarers: Heading for New Shores (30 hexes)'
  },
  seafarers_islands: {
    ro: 'Navigatori: Cele 4 Insule (31 hexuri)',
    en: 'Seafarers: The Four Islands (31 hexes)'
  },
  seafarers_fog: {
    ro: 'Navigatori: Insula din Ceață (Oficial 5-6 Jucători / 97 hexuri)',
    en: 'Seafarers: The Fog Island (Official 5-6 Players / 97 hexes)'
  },
  world_map: {
    ro: 'Navigatori: Harta Lumii (38 hexuri)',
    en: 'Seafarers: World Map (38 hexes)'
  }
};

const COLOR_NAMES: Record<PlayerColor, { ro: string; en: string; hex: string }> = {
  red: { ro: 'Roșu', en: 'Red', hex: '#ef4444' },
  blue: { ro: 'Albastru', en: 'Blue', hex: '#3b82f6' },
  orange: { ro: 'Portocaliu', en: 'Orange', hex: '#f97316' },
  green: { ro: 'Verde', en: 'Green', hex: '#22c55e' },
  white: { ro: 'Alb', en: 'White', hex: '#f8fafc' },
  brown: { ro: 'Maro', en: 'Brown', hex: '#92400e' }
};

const TERRAIN_NAMES: Record<TerrainType, { ro: string; en: string; emoji: string }> = {
  forest: { ro: 'Pădure (Lemn)', en: 'Forest (Wood)', emoji: '🌲' },
  hills: { ro: 'Dealuri (Cărămidă)', en: 'Hills (Brick)', emoji: '🧱' },
  pasture: { ro: 'Pășune (Oaie)', en: 'Pasture (Sheep)', emoji: '🐑' },
  fields: { ro: 'Câmpuri (Grâu)', en: 'Fields (Wheat)', emoji: '🌾' },
  mountains: { ro: 'Munți (Minereu)', en: 'Mountains (Ore)', emoji: '⛰️' },
  desert: { ro: 'Deșert', en: 'Desert', emoji: '🏜️' },
  gold_field: { ro: 'Câmp de Aur', en: 'Gold Field', emoji: '⭐' },
  sea: { ro: 'Mare / Apă', en: 'Sea / Water', emoji: '🌊' },
  fog: { ro: 'Ceață Misterioasă', en: 'Fog Island', emoji: '🌫️' }
};

const PLAYER_COLORS_MAP: Record<string, PlayerColor> = {
  red: 'red',
  blue: 'blue',
  orange: 'orange',
  green: 'green',
  white: 'white',
  brown: 'brown',
  player_red: 'red',
  player_blue: 'blue',
  player_orange: 'orange',
  player_green: 'green',
  player_white: 'white',
  player_brown: 'brown'
};

export const SandboxMode: React.FC<SandboxModeProps> = ({ locale, onExit }) => {
  const isRo = locale === 'ro';

  const [scenario, setScenario] = useState<BoardScenario>('classic');
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<'random_balanced' | 'official_beginner' | 'pure_random'>('random_balanced');
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000000));
  const [selectedColor, setSelectedColor] = useState<PlayerColor>('red');
  const [selectedTool, setSelectedTool] = useState<SandboxTool>('settlement');
  const [placementMode, setPlacementMode] = useState<SandboxPlacementMode>('free');

  const [board, setBoard] = useState<BoardState>(() =>
    generateStandardBoard(seed, layoutAlgorithm, scenario).board
  );

  const activePlayerId = `player_${selectedColor}`;

  // Regenerate board with new or existing seed
  const handleRegenerate = useCallback((newSeed?: number) => {
    const s = newSeed ?? Math.floor(Math.random() * 1000000);
    setSeed(s);
    setBoard(generateStandardBoard(s, layoutAlgorithm, scenario).board);
  }, [layoutAlgorithm, scenario]);

  // When scenario or layout changes, re-generate
  const handleScenarioChange = (newScenario: BoardScenario) => {
    setScenario(newScenario);
    setBoard(generateStandardBoard(seed, layoutAlgorithm, newScenario).board);
  };

  const handleLayoutChange = (newLayout: 'random_balanced' | 'official_beginner' | 'pure_random') => {
    setLayoutAlgorithm(newLayout);
    setBoard(generateStandardBoard(seed, newLayout, scenario).board);
  };

  // Clear all pieces from board
  const handleClearPieces = () => {
    setBoard((prev) => ({
      ...prev,
      buildings: {},
      roads: {},
      ships: {}
    }));
  };

  // Compute highlighted spots based on selected tool and placement mode
  const { highlightedVertices, highlightedEdges, highlightedHexes } = useMemo(() => {
    const vSet = new Set<string>();
    const eSet = new Set<string>();
    const hSet = new Set<string>();

    if (!board || !board.hexes) {
      return { highlightedVertices: vSet, highlightedEdges: eSet, highlightedHexes: hSet };
    }

    if (placementMode === 'free') {
      if (selectedTool === 'robber') {
        for (const hexId of Object.keys(board?.hexes || {})) {
          if (hexId !== board?.robberHexId) hSet.add(hexId);
        }
      }
      return { highlightedVertices: vSet, highlightedEdges: eSet, highlightedHexes: hSet };
    }

    // Rules mode
    if (selectedTool === 'settlement') {
      const playerBuildings = Object.values(board?.buildings || {}).filter((b) => b.ownerId === activePlayerId);
      const hasPlayerBuildings = playerBuildings.length > 0;

      for (const [vId] of Object.entries(board?.vertices || {})) {
        if (isVertexAvailableForSettlement(board, vId)) {
          if (!hasPlayerBuildings || isVertexConnectedToPlayerRoad(board, vId, activePlayerId)) {
            vSet.add(vId);
          }
        }
      }
    } else if (selectedTool === 'city') {
      for (const [vId, b] of Object.entries(board?.buildings || {})) {
        if (b.ownerId === activePlayerId && b.type === 'settlement') {
          vSet.add(vId);
        }
      }
    } else if (selectedTool === 'road') {
      for (const eId of Object.keys(board?.edges || {})) {
        if (isEdgeLegalForPlayerRoad(board, eId, activePlayerId)) {
          eSet.add(eId);
        }
      }
    } else if (selectedTool === 'ship') {
      for (const eId of Object.keys(board?.edges || {})) {
        if (isEdgeLegalForPlayerShip(board, eId, activePlayerId)) {
          eSet.add(eId);
        }
      }
    } else if (selectedTool === 'robber') {
      for (const [hexId, hex] of Object.entries(board?.hexes || {})) {
        if (hexId !== board?.robberHexId && hex.terrain !== 'sea' && hex.terrain !== 'fog') {
          hSet.add(hexId);
        }
      }
    } else if (selectedTool === 'eraser') {
      for (const vId of Object.keys(board?.buildings || {})) {
        vSet.add(vId);
      }
      for (const eId of Object.keys(board?.roads || {})) {
        eSet.add(eId);
      }
      if (board?.ships) {
        for (const eId of Object.keys(board.ships)) {
          eSet.add(eId);
        }
      }
    }

    return { highlightedVertices: vSet, highlightedEdges: eSet, highlightedHexes: hSet };
  }, [board, selectedTool, placementMode, activePlayerId]);

  // Click handlers
  const handleSelectVertex = (vertexId: string) => {
    setBoard((prev) => {
      const nextBuildings = { ...prev.buildings };
      if (selectedTool === 'eraser') {
        delete nextBuildings[vertexId];
        return { ...prev, buildings: nextBuildings };
      }

      if (selectedTool === 'settlement') {
        const existing = nextBuildings[vertexId];
        if (existing && existing.ownerId === activePlayerId && existing.type === 'settlement') {
          // Toggle or upgrade to city if clicked again
          nextBuildings[vertexId] = { type: 'city', ownerId: activePlayerId };
        } else {
          nextBuildings[vertexId] = { type: 'settlement', ownerId: activePlayerId };
        }
        return { ...prev, buildings: nextBuildings };
      }

      if (selectedTool === 'city') {
        nextBuildings[vertexId] = { type: 'city', ownerId: activePlayerId };
        return { ...prev, buildings: nextBuildings };
      }

      return prev;
    });
  };

  const handleSelectEdge = (edgeId: string) => {
    setBoard((prev) => {
      const nextRoads = { ...prev.roads };
      const nextShips = { ...(prev.ships || {}) };

      if (selectedTool === 'eraser') {
        delete nextRoads[edgeId];
        delete nextShips[edgeId];
        return { ...prev, roads: nextRoads, ships: nextShips };
      }

      if (selectedTool === 'road') {
        delete nextShips[edgeId];
        nextRoads[edgeId] = { edgeId, ownerId: activePlayerId };
        return { ...prev, roads: nextRoads, ships: nextShips };
      }

      if (selectedTool === 'ship') {
        delete nextRoads[edgeId];
        nextShips[edgeId] = { edgeId, ownerId: activePlayerId };
        return { ...prev, roads: nextRoads, ships: nextShips };
      }

      return prev;
    });
  };

  const handleSelectHex = (hexId: string) => {
    setBoard((prev) => ({
      ...prev,
      robberHexId: hexId
    }));
  };

  // Live Statistics
  const activeStats = useMemo(() => {
    let settlements = 0;
    let cities = 0;
    const buildingsList = board?.buildings ? Object.values(board.buildings) : [];
    for (const b of buildingsList) {
      if (b && b.ownerId === activePlayerId) {
        if (b.type === 'settlement') settlements++;
        else if (b.type === 'city') cities++;
      }
    }

    const roads = board?.roads ? Object.values(board.roads).filter((r) => r?.ownerId === activePlayerId).length : 0;
    const ships = board?.ships ? Object.values(board.ships).filter((s) => s?.ownerId === activePlayerId).length : 0;
    const longestRoad = board ? calculatePlayerLongestRoad(board, activePlayerId) : 0;
    const victoryPoints = settlements * 1 + cities * 2 + (longestRoad >= 5 ? 2 : 0);

    return { settlements, cities, roads, ships, longestRoad, victoryPoints };
  }, [board, activePlayerId]);

  // Board terrain distribution
  const terrainCounts = useMemo(() => {
    const counts: Partial<Record<TerrainType, number>> = {};
    const hexesList = board?.hexes ? Object.values(board.hexes) : [];
    for (const h of hexesList) {
      if (h?.terrain) {
        counts[h.terrain] = (counts[h.terrain] || 0) + 1;
      }
    }
    return counts;
  }, [board?.hexes]);

  return (
    <div className="sandbox-container">
      {/* Top Controls Toolbar */}
      <div className="sandbox-toolbar">
        {/* Scenarios */}
        <div className="sandbox-toolbar-group">
          <span className="sandbox-toolbar-label">{isRo ? 'Scenariu:' : 'Scenario:'}</span>
          <select
            className="input-select"
            value={scenario}
            onChange={(e) => handleScenarioChange(e.target.value as BoardScenario)}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
          >
            {(Object.keys(SCENARIO_LABELS) as BoardScenario[]).map((sc) => (
              <option key={sc} value={sc}>
                {SCENARIO_LABELS[sc][locale]}
              </option>
            ))}
          </select>
        </div>

        {/* Layout Algorithm */}
        <div className="sandbox-toolbar-group">
          <span className="sandbox-toolbar-label">{isRo ? 'Generare:' : 'Layout:'}</span>
          <select
            className="input-select"
            value={layoutAlgorithm}
            onChange={(e) => handleLayoutChange(e.target.value as any)}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
          >
            <option value="random_balanced">{isRo ? 'Echilibrat' : 'Balanced'}</option>
            <option value="official_beginner">{isRo ? 'Începători' : 'Beginner'}</option>
            <option value="pure_random">{isRo ? 'Pur Aleatoriu' : 'Pure Random'}</option>
          </select>
        </div>

        {/* Regenerate Button */}
        <button
          type="button"
          className="sandbox-btn"
          onClick={() => handleRegenerate()}
          title={isRo ? 'Generează o hartă nouă cu seed aleatoriu' : 'Generate new map with random seed'}
        >
          🔄 {isRo ? 'Regenerează Hartă' : 'Regenerate Map'}
        </button>

        {/* Color Picker */}
        <div className="sandbox-toolbar-group">
          <span className="sandbox-toolbar-label">{isRo ? 'Culoare:' : 'Color:'}</span>
          {PLAYER_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              className={`sandbox-color-btn ${selectedColor === col ? 'active' : ''}`}
              style={{ backgroundColor: COLOR_NAMES[col].hex }}
              title={COLOR_NAMES[col][locale]}
              onClick={() => setSelectedColor(col)}
            />
          ))}
        </div>

        {/* Tool Selector */}
        <div className="sandbox-toolbar-group">
          <span className="sandbox-toolbar-label">{isRo ? 'Unealtă:' : 'Tool:'}</span>
          <button
            type="button"
            className={`sandbox-btn ${selectedTool === 'settlement' ? 'active' : ''}`}
            onClick={() => setSelectedTool('settlement')}
            title={isRo ? 'Plasează o așezare pe un nod' : 'Place settlement on vertex'}
          >
            🏠 {isRo ? 'Așezare' : 'Settlement'}
          </button>
          <button
            type="button"
            className={`sandbox-btn ${selectedTool === 'city' ? 'active' : ''}`}
            onClick={() => setSelectedTool('city')}
            title={isRo ? 'Plasează sau modernizează un oraș' : 'Place or upgrade to city'}
          >
            🏰 {isRo ? 'Oraș' : 'City'}
          </button>
          <button
            type="button"
            className={`sandbox-btn ${selectedTool === 'road' ? 'active' : ''}`}
            onClick={() => setSelectedTool('road')}
            title={isRo ? 'Plasează un drum pe o muchie de uscat' : 'Place road on land edge'}
          >
            🛣️ {isRo ? 'Drum' : 'Road'}
          </button>
          <button
            type="button"
            className={`sandbox-btn ${selectedTool === 'ship' ? 'active' : ''}`}
            onClick={() => setSelectedTool('ship')}
            title={isRo ? 'Plasează o corabie pe o muchie maritimă/coastă' : 'Place ship on coastal/sea edge'}
          >
            ⛵ {isRo ? 'Corabie' : 'Ship'}
          </button>
          <button
            type="button"
            className={`sandbox-btn ${selectedTool === 'robber' ? 'active' : ''}`}
            onClick={() => setSelectedTool('robber')}
            title={isRo ? 'Mută hoțul pe un alt hex' : 'Move robber to another hex'}
          >
            🦹 {isRo ? 'Hoț' : 'Robber'}
          </button>
          <button
            type="button"
            className={`sandbox-btn ${selectedTool === 'eraser' ? 'active' : ''}`}
            onClick={() => setSelectedTool('eraser')}
            title={isRo ? 'Șterge o piesă de pe tablă' : 'Remove piece from board'}
          >
            🗑️ {isRo ? 'Șterge' : 'Eraser'}
          </button>
        </div>

        {/* Mode Toggle: Rules vs Free */}
        <div className="sandbox-toolbar-group">
          <span className="sandbox-toolbar-label">{isRo ? 'Validare:' : 'Validation:'}</span>
          <button
            type="button"
            className={`sandbox-btn ${placementMode === 'rules' ? 'active' : ''}`}
            onClick={() => setPlacementMode('rules')}
            title={isRo ? 'Permite plasarea doar conform regulilor de joc Catan' : 'Allow placement only according to Catan rules'}
          >
            📏 {isRo ? 'Reguli Catan' : 'Rules'}
          </button>
          <button
            type="button"
            className={`sandbox-btn ${placementMode === 'free' ? 'active' : ''}`}
            onClick={() => setPlacementMode('free')}
            title={isRo ? 'Permite plasare liberă oriunde pe tablă pentru testare rapidă' : 'Allow free placement anywhere on board'}
          >
            ✨ {isRo ? 'Plasare Liberă' : 'Free Mode'}
          </button>
        </div>

        {/* Clear All Pieces */}
        <button
          type="button"
          className="sandbox-btn"
          style={{ background: 'rgba(185, 28, 28, 0.7)', borderColor: 'rgba(239, 68, 68, 0.5)' }}
          onClick={handleClearPieces}
          title={isRo ? 'Șterge toate piesele plasate' : 'Clear all placed pieces'}
        >
          🧹 {isRo ? 'Curăță Piese' : 'Clear Pieces'}
        </button>

        {onExit && (
          <button
            type="button"
            className="sandbox-btn"
            onClick={onExit}
            style={{ marginLeft: 'auto' }}
          >
            ✕ {isRo ? 'Ieșire' : 'Exit'}
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="sandbox-content">
        {/* Board Viewport */}
        <div className="sandbox-board-wrapper">
          <BoardSvg
            board={board}
            playerColors={PLAYER_COLORS_MAP}
            locale={locale}
            highlightedVertices={highlightedVertices}
            highlightedEdges={highlightedEdges}
            highlightedHexes={highlightedHexes}
            onSelectVertex={handleSelectVertex}
            onSelectEdge={handleSelectEdge}
            onSelectHex={handleSelectHex}
            interactiveAll={true}
          />
        </div>

        {/* Side Panel: Diagnostics & Stats */}
        <div className="sandbox-sidepanel">
          {/* Active Player Piece Counts */}
          <div className="sandbox-stat-card">
            <h4>
              <span
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: COLOR_NAMES[selectedColor].hex,
                  marginRight: 6
                }}
              />
              {isRo ? `Jucător: ${COLOR_NAMES[selectedColor].ro}` : `Player: ${COLOR_NAMES[selectedColor].en}`}
            </h4>
            <div className="sandbox-stat-grid">
              <div className="sandbox-stat-row">
                <span>🏠 {isRo ? 'Așezări' : 'Settlements'}</span>
                <strong>{activeStats.settlements} / 5</strong>
              </div>
              <div className="sandbox-stat-row">
                <span>🏰 {isRo ? 'Orașe' : 'Cities'}</span>
                <strong>{activeStats.cities} / 4</strong>
              </div>
              <div className="sandbox-stat-row">
                <span>🛣️ {isRo ? 'Drumuri' : 'Roads'}</span>
                <strong>{activeStats.roads} / 15</strong>
              </div>
              <div className="sandbox-stat-row">
                <span>⛵ {isRo ? 'Corăbii' : 'Ships'}</span>
                <strong>{activeStats.ships} / 15</strong>
              </div>
              <div className="sandbox-stat-row">
                <span>📏 {isRo ? 'Traseu Maxim' : 'Longest Route'}</span>
                <strong style={{ color: activeStats.longestRoad >= 5 ? '#eab308' : '#ffffff' }}>
                  {activeStats.longestRoad} {activeStats.longestRoad >= 5 ? '🏆' : ''}
                </strong>
              </div>
              <div className="sandbox-stat-row">
                <span>⭐ {isRo ? 'Puncte Victorie' : 'Victory Points'}</span>
                <strong style={{ color: '#38bdf8' }}>{activeStats.victoryPoints} VP</strong>
              </div>
            </div>
          </div>

          {/* Map Info */}
          <div className="sandbox-stat-card">
            <h4>🗺️ {isRo ? 'Informații Hartă' : 'Map Info'}</h4>
            <div className="sandbox-stat-row">
              <span>{isRo ? 'Seed curent' : 'Current seed'}</span>
              <code>{seed}</code>
            </div>
            <div className="sandbox-stat-row">
              <span>{isRo ? 'Hexuri totale' : 'Total hexes'}</span>
              <strong>{board?.hexes ? Object.keys(board.hexes).length : 0}</strong>
            </div>
            <div className="sandbox-stat-row">
              <span>{isRo ? 'Muchii (Edges)' : 'Total edges'}</span>
              <strong>{board?.edges ? Object.keys(board.edges).length : 0}</strong>
            </div>
            <div className="sandbox-stat-row">
              <span>{isRo ? 'Noduri (Vertices)' : 'Total vertices'}</span>
              <strong>{board?.vertices ? Object.keys(board.vertices).length : 0}</strong>
            </div>
            <div className="sandbox-stat-row">
              <span>{isRo ? 'Porturi maritime' : 'Harbors'}</span>
              <strong>{board?.harbors ? board.harbors.length : 0}</strong>
            </div>
          </div>

          {/* Terrain Distribution */}
          <div className="sandbox-stat-card">
            <h4>🌿 {isRo ? 'Distribuție Terenuri' : 'Terrain Distribution'}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {(Object.keys(terrainCounts) as TerrainType[]).map((tType) => {
                const count = terrainCounts[tType] || 0;
                const info = TERRAIN_NAMES[tType];
                const isGold = tType === 'gold_field';
                return (
                  <div
                    key={tType}
                    className="sandbox-stat-row"
                    style={isGold ? { background: 'rgba(234, 179, 8, 0.15)', padding: '0.2rem 0.4rem', borderRadius: 4 } : {}}
                  >
                    <span>
                      {info.emoji} {info[locale]}
                    </span>
                    <strong style={isGold ? { color: '#facc15' } : {}}>{count}</strong>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Instructions Guide */}
          <div className="sandbox-stat-card" style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
            <h4>💡 {isRo ? 'Ghid de Utilizare' : 'Quick Guide'}</h4>
            <p style={{ margin: '0 0 0.35rem 0' }}>
              {isRo
                ? '• Selectează o unealtă și fă click direct pe tablă pentru a plasa sau testa piese.'
                : '• Select a tool and click directly on the board to place or test assets.'}
            </p>
            <p style={{ margin: '0 0 0.35rem 0' }}>
              {isRo
                ? '• Modul „Plasare Liberă” permite poziționarea fără restricții oriunde pe hartă.'
                : '• "Free Mode" allows unrestricted piece placement anywhere on the map.'}
            </p>
            <p style={{ margin: 0 }}>
              {isRo
                ? '• Modul „Reguli Catan” evidențiază doar pozițiile valide conform regulamentului oficial.'
                : '• "Rules" mode highlights only legally valid positions per Catan rules.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
