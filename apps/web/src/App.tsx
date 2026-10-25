import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ALL_RESOURCES,
  AIDifficulty,
  AIStrategyStyle,
  BUILDING_COSTS,
  DevCardType,
  GameAction,
  GameRulesConfig,
  PLAYER_COLORS,
  ParticipantConfig,
  ParticipantType,
  PlayerColor,
  ReplayFile,
  ReplayRecorder,
  ResourceCount,
  ResourceType,
  canPlayDevCardType,
  createEmptyResources,
  createGame,
  createRulesConfig,
  getEligibleRobberTargetsOnHex,
  getLegalActions,
  getPlayerBankTradeRatio,
  getPlayerById,
  getPlayerView,
  hasResources,
  totalResourceCount
} from '@catan/core';
import {
  BenchmarkReport,
  chooseAIAction,
  runBenchmarkSuite,
  runSimulatedGame
} from '@catan/ai';
import { BoardSvg } from './components/BoardSvg';
import {
  AnimatedDiceWidget,
  DevCardSprite,
  ResourceCardSprite
} from './components/GameAssets';
import { ReplayAndAnalysisView } from './components/ReplayAndAnalysisView';
import { saveReplayToHistory } from './storage';
import {
  AI_DIFFICULTY_LABELS,
  AI_STYLE_LABELS,
  Locale,
  PARTICIPANT_TYPE_LABELS,
  PHASE_LABELS,
  RESOURCE_ICONS,
  RESOURCE_LABELS,
  TRANSLATIONS,
  formatActionDescription
} from './i18n';

type ActiveTab = 'lobby' | 'game' | 'replay' | 'benchmark';
type BuildSelectionMode = 'none' | 'road' | 'settlement' | 'city' | 'knight';
type GameModalType = 'none' | 'trade' | 'dev_cards' | 'event_log' | 'costs_help' | 'score_bank';

export const App: React.FC = () => {
  const [locale, setLocale] = useState<Locale>('ro');
  const [activeTab, setActiveTab] = useState<ActiveTab>('lobby');
  const t = TRANSLATIONS[locale];

  // Lobby Configuration State
  const [participants, setParticipants] = useState<ParticipantConfig[]>([
    { id: 'p1', name: 'Jucător 1 (Om)', type: 'human', color: 'red' },
    {
      id: 'p2',
      name: 'Adversar Tactic',
      type: 'ai',
      color: 'blue',
      aiDifficulty: 'advanced',
      aiStyle: 'expansion'
    },
    {
      id: 'p3',
      name: 'Adversar Comercial',
      type: 'ai',
      color: 'orange',
      aiDifficulty: 'medium',
      aiStyle: 'commercial'
    },
    {
      id: 'p4',
      name: 'Adversar Adaptiv',
      type: 'ai',
      color: 'green',
      aiDifficulty: 'expert',
      aiStyle: 'adaptive'
    }
  ]);

  const [rules, setRules] = useState<GameRulesConfig>(() => createRulesConfig());
  const [customSeed, setCustomSeed] = useState<string>('catan-2026');
  const [serverStatusMsg, setServerStatusMsg] = useState<string | null>(null);

  // Active Game & Replay Recorder State
  const [recorder, setRecorder] = useState<ReplayRecorder | null>(null);
  const [gameVersionTick, setGameVersionTick] = useState<number>(0);
  const [buildMode, setBuildMode] = useState<BuildSelectionMode>('none');
  const [activeModal, setActiveModal] = useState<GameModalType>('none');
  const [autoPlayAi, setAutoPlayAi] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mobileHudOpen, setMobileHudOpen] = useState<boolean>(false);
  const [mobileDockCollapsed, setMobileDockCollapsed] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };
  const [diceRollAnimKey, setDiceRollAnimKey] = useState<string>('init');
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [joinPlayerName, setJoinPlayerName] = useState<string>('Jucător 2');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState<boolean>(false);

  // Automatically detect ?join=XYZ or ?code=XYZ from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join') || params.get('code');
    if (code) {
      setJoinCodeInput(code.toUpperCase().trim());
      setActiveTab('lobby');
    }
  }, []);

  const handleShareInvite = async (codeToShare: string) => {
    const shareUrl = `${window.location.origin}/?join=${encodeURIComponent(codeToShare)}`;
    const shareData = {
      title: 'Hai la Catan v2!',
      text: `Te invit la o partidă de Catan v2! Codul partidei: ${codeToShare}`,
      url: shareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setServerStatusMsg(`Linkul partidei a fost copiat în clipboard! (${shareUrl})`);
    } catch {
      setServerStatusMsg(`Codul tău de invitație este: ${codeToShare} · Link: ${shareUrl}`);
    }
  };

  const handleJoinWithCode = async () => {
    if (!joinCodeInput.trim()) {
      setJoinError('Te rugăm să introduci codul de invitație.');
      return;
    }
    setJoinLoading(true);
    setJoinError(null);
    try {
      const res = await fetch('/api/lobbies/join-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: joinCodeInput.trim(),
          playerName: joinPlayerName.trim() || 'Jucător 2'
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error || 'Nu s-a putut realiza conectarea la partidă.');
        setJoinLoading(false);
        return;
      }

      setCreatedInviteCode(joinCodeInput.trim());
      setServerStatusMsg(`Te-ai alăturat cu succes ca ${data.playerId}!`);
      // Start/sync local state
      handleStartGame(true);
    } catch {
      setJoinError('Nu s-a putut contacta serverul. Verifică dacă este pornit.');
    } finally {
      setJoinLoading(false);
    }
  };
  const lastSavedGameIdRef = useRef<string | null>(null);

  // Dev card & trade sub-modals state
  const [yopResources, setYopResources] = useState<[ResourceType, ResourceType]>(['wheat', 'ore']);
  const [monopolyResource, setMonopolyResource] = useState<ResourceType>('wheat');
  const [bankGiveRes, setBankGiveRes] = useState<ResourceType>('wood');
  const [bankReceiveRes, setBankReceiveRes] = useState<ResourceType>('ore');
  const [p2pOffer, setP2pOffer] = useState<ResourceCount>(createEmptyResources());
  const [p2pRequest, setP2pRequest] = useState<ResourceCount>(createEmptyResources());
  const [discardSelection, setDiscardSelection] = useState<ResourceCount>(createEmptyResources());

  // Replay Viewer State
  const [activeReplay, setActiveReplay] = useState<ReplayFile | null>(null);

  // Benchmark Simulator State
  const [benchmarkGamesCount, setBenchmarkGamesCount] = useState<number>(8);
  const [benchmarkReport, setBenchmarkReport] = useState<BenchmarkReport | null>(null);

  const gameState = recorder ? recorder.getState() : null;

  // Automatically save finished games for later analysis
  useEffect(() => {
    if (!recorder || !gameState) return;
    if (gameState.phase === 'game_over' && gameState.winnerId) {
      if (lastSavedGameIdRef.current !== gameState.gameId) {
        lastSavedGameIdRef.current = gameState.gameId;
        const replayFile = recorder.toReplayFile();
        saveReplayToHistory(replayFile, true);
        setActiveReplay(replayFile);
      }
    }
  }, [recorder, gameState?.phase, gameState?.winnerId, gameVersionTick]);

  // Determine the current human viewer (or active player if spectating 4 AIs)
  const viewerId = useMemo(() => {
    if (!gameState) return 'p1';
    if (gameState.phase === 'discard_resources') {
      const pendingHuman = gameState.players.find(
        (p) => p.type === 'human' && (gameState.pendingDiscards[p.id] ?? 0) > 0
      );
      if (pendingHuman) return pendingHuman.id;
    }
    const activePlayer = getPlayerById(gameState, gameState.activePlayerId);
    if (activePlayer?.type === 'human') return activePlayer.id;
    const firstHuman = gameState.players.find((p) => p.type === 'human');
    return firstHuman ? firstHuman.id : gameState.activePlayerId;
  }, [gameState, gameVersionTick]);

  const playerView = useMemo(() => {
    if (!gameState) return null;
    return getPlayerView(gameState, viewerId);
  }, [gameState, viewerId, gameVersionTick]);

  const legalActionsForActive = useMemo(() => {
    if (!gameState) return [];
    let actorId = gameState.activePlayerId;
    if (gameState.phase === 'discard_resources') {
      actorId = Object.keys(gameState.pendingDiscards)[0] ?? actorId;
    }
    return getLegalActions(gameState, actorId);
  }, [gameState, gameVersionTick]);

  // Execute a single action (human or AI) and update recorder
  const executeAction = (playerId: string, action: GameAction) => {
    if (!recorder) return;
    try {
      setActionError(null);
      recorder.recordAndApply(playerId, action);
      if (action.type === 'roll_dice') {
        setDiceRollAnimKey(`roll-${Date.now()}-${Math.random()}`);
      }
      setBuildMode('none');
      setDiscardSelection(createEmptyResources());
      setGameVersionTick((v) => v + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Mutare invalidă.');
    }
  };

  // Step one AI move
  const executeOneAiStep = () => {
    if (!recorder) return;
    const st = recorder.getState();
    if (st.phase === 'game_over') return;

    let actorId = st.activePlayerId;
    if (st.phase === 'discard_resources') {
      const pendingBot = Object.keys(st.pendingDiscards).find((id) => {
        const p = getPlayerById(st, id);
        return p && p.type !== 'human';
      });
      if (!pendingBot) return;
      actorId = pendingBot;
    } else {
      const openOffer = st.activeTradeOffers.find((o) => o.status === 'open');
      if (openOffer) {
        const botResponder = st.players.find(
          (p) =>
            p.id !== openOffer.fromPlayerId &&
            p.type !== 'human' &&
            !openOffer.rejectedByPlayerIds.includes(p.id)
        );
        if (botResponder) {
          actorId = botResponder.id;
        }
      }
    }

    const actor = getPlayerById(st, actorId);
    if (!actor || actor.type === 'human') return;

    const decision = chooseAIAction(st, actorId);
    recorder.recordAndApply(actorId, decision.action, {
      aiDecision: decision.decisionRecord
    });
    if (decision.action.type === 'roll_dice') {
      setDiceRollAnimKey(`ai-roll-${Date.now()}-${Math.random()}`);
    }
    setGameVersionTick((v) => v + 1);
  };

  // Automatic AI turn progression when autoPlayAi is active
  useEffect(() => {
    if (!autoPlayAi || !recorder || activeTab !== 'game') return;
    const st = recorder.getState();
    if (st.phase === 'game_over') return;

    let needsBotMove = false;
    if (st.phase === 'discard_resources') {
      needsBotMove = Object.keys(st.pendingDiscards).some((id) => {
        const p = getPlayerById(st, id);
        return p && p.type !== 'human';
      });
    } else {
      const openOffer = st.activeTradeOffers.find((o) => o.status === 'open');
      if (openOffer) {
        needsBotMove = st.players.some(
          (p) =>
            p.id !== openOffer.fromPlayerId &&
            p.type !== 'human' &&
            !openOffer.rejectedByPlayerIds.includes(p.id)
        );
      }
      if (!needsBotMove) {
        const active = getPlayerById(st, st.activePlayerId);
        needsBotMove = Boolean(active && active.type !== 'human');
      }
    }

    if (!needsBotMove) return;

    const delayMs = st.phase === 'turn_start' ? 520 : 340;
    const timer = setTimeout(() => {
      executeOneAiStep();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [autoPlayAi, recorder, gameVersionTick, activeTab]);

  // Start Game from Lobby
  const handleStartGame = async (syncWithServer = false) => {
    const seed = customSeed.trim() || `catan-${Date.now()}`;
    const initial = createGame({
      gameId: `game_${Date.now()}`,
      seed,
      participants,
      rules
    });
    const rec = new ReplayRecorder(initial, 15);
    setRecorder(rec);
    setBuildMode('none');
    setActiveModal('none');
    setActionError(null);
    setDiceRollAnimKey(`start-${Date.now()}`);
    setGameVersionTick((v) => v + 1);
    setActiveTab('game');

    if (syncWithServer) {
      try {
        const res = await fetch('/api/lobbies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Partidă LAN/Online',
            hostName: participants[0]?.name ?? 'Gazdă',
            mode: 'lan',
            isPrivate: true,
            seed,
            rules,
            seats: participants.map((p, idx) => ({
              seatIndex: idx,
              name: p.name,
              type: p.type,
              color: p.color,
              aiDifficulty: p.aiDifficulty,
              aiStyle: p.aiStyle
            }))
          })
        });
        if (res.ok) {
          const data = (await res.json()) as {
            lobby: { lobbyId: string };
            inviteCode: string;
          };
          setServerStatusMsg(
            `Lobby sincronizat pe server (${data.lobby.lobbyId}) · Cod invitație: ${data.inviteCode}`
          );
          await fetch(`/api/lobbies/${data.lobby.lobbyId}/start`, { method: 'POST' });
        }
      } catch {
        setServerStatusMsg('Mod local în browser activ (serverul LAN nu este pornit pe :3001).');
      }
    }
  };

  // Run an instant full 4-AI simulated game, save it to history, and open it in Replay Viewer
  const handleQuick4AiSimulation = () => {
    const sim = runSimulatedGame({
      seed: `${customSeed || 'sim'}-${Date.now()}`,
      participants: [
        { id: 'p1', name: 'AI Expert Adaptiv', type: 'ai', color: 'red', aiDifficulty: 'expert', aiStyle: 'adaptive' },
        { id: 'p2', name: 'AI Avansat Dezvoltare', type: 'ai', color: 'blue', aiDifficulty: 'advanced', aiStyle: 'development' },
        { id: 'p3', name: 'AI Mediu Expansiune', type: 'ai', color: 'orange', aiDifficulty: 'medium', aiStyle: 'expansion' },
        { id: 'p4', name: 'AI Începător Comercial', type: 'ai', color: 'green', aiDifficulty: 'beginner', aiStyle: 'commercial' }
      ],
      rules,
      recordReplay: true
    });
    if (sim.replay) {
      saveReplayToHistory(sim.replay, true);
      setActiveReplay(sim.replay);
      setActiveTab('replay');
    }
  };

  // Compute highlighted board elements for interactive placement
  const { highlightedVertices, highlightedEdges, highlightedHexes } = useMemo(() => {
    const vSet = new Set<string>();
    const eSet = new Set<string>();
    const hSet = new Set<string>();

    if (!gameState) {
      return { highlightedVertices: vSet, highlightedEdges: eSet, highlightedHexes: hSet };
    }

    const activePlayer = getPlayerById(gameState, gameState.activePlayerId);
    if (!activePlayer || activePlayer.type !== 'human') {
      return { highlightedVertices: vSet, highlightedEdges: eSet, highlightedHexes: hSet };
    }

    for (const act of legalActionsForActive) {
      if (
        (gameState.phase === 'setup_settlement_1' || gameState.phase === 'setup_settlement_2') &&
        act.type === 'place_initial_settlement'
      ) {
        vSet.add(act.vertexId);
      } else if (
        (gameState.phase === 'setup_road_1' || gameState.phase === 'setup_road_2') &&
        act.type === 'place_initial_road'
      ) {
        eSet.add(act.edgeId);
      } else if (gameState.phase === 'road_building_card' && act.type === 'place_free_road') {
        eSet.add(act.edgeId);
      } else if (gameState.phase === 'move_robber' && act.type === 'move_robber') {
        hSet.add(act.hexId);
      } else if (buildMode === 'road' && act.type === 'build_road') {
        eSet.add(act.edgeId);
      } else if (buildMode === 'settlement' && act.type === 'build_settlement') {
        vSet.add(act.vertexId);
      } else if (buildMode === 'city' && act.type === 'build_city') {
        vSet.add(act.vertexId);
      } else if (buildMode === 'knight' && act.type === 'play_knight') {
        hSet.add(act.hexId);
      }
    }

    return { highlightedVertices: vSet, highlightedEdges: eSet, highlightedHexes: hSet };
  }, [gameState, legalActionsForActive, buildMode, gameVersionTick]);

  // Handlers for clicking on the interactive board
  const handleSelectVertex = (vertexId: string) => {
    if (!gameState) return;
    const pId = gameState.activePlayerId;
    if (gameState.phase === 'setup_settlement_1' || gameState.phase === 'setup_settlement_2') {
      executeAction(pId, { type: 'place_initial_settlement', vertexId });
    } else if (buildMode === 'settlement') {
      executeAction(pId, { type: 'build_settlement', vertexId });
    } else if (buildMode === 'city') {
      executeAction(pId, { type: 'build_city', vertexId });
    }
  };

  const handleSelectEdge = (edgeId: string) => {
    if (!gameState) return;
    const pId = gameState.activePlayerId;
    if (gameState.phase === 'setup_road_1' || gameState.phase === 'setup_road_2') {
      executeAction(pId, { type: 'place_initial_road', edgeId });
    } else if (gameState.phase === 'road_building_card') {
      executeAction(pId, { type: 'place_free_road', edgeId });
    } else if (buildMode === 'road') {
      executeAction(pId, { type: 'build_road', edgeId });
    }
  };

  const handleSelectHex = (hexId: string) => {
    if (!gameState) return;
    const pId = gameState.activePlayerId;
    const targets = getEligibleRobberTargetsOnHex(gameState, hexId, pId);
    const firstTarget = targets.length === 1 ? targets[0] : undefined;

    if (gameState.phase === 'move_robber') {
      executeAction(pId, { type: 'move_robber', hexId, targetPlayerId: firstTarget });
    } else if (buildMode === 'knight') {
      executeAction(pId, { type: 'play_knight', hexId, targetPlayerId: firstTarget });
    }
  };

  const handleRunBenchmark = () => {
    const rep = runBenchmarkSuite({
      baseSeed: customSeed || 'bench-2026',
      gamesCount: benchmarkGamesCount,
      participants: [
        { id: 'p1', name: 'Expert Adaptiv', type: 'ai', aiDifficulty: 'expert', aiStyle: 'adaptive' },
        { id: 'p2', name: 'Avansat Dezvoltare', type: 'ai', aiDifficulty: 'advanced', aiStyle: 'development' },
        { id: 'p3', name: 'Mediu Expansiune', type: 'ai', aiDifficulty: 'medium', aiStyle: 'expansion' },
        { id: 'p4', name: 'Începător Comercial', type: 'ai', aiDifficulty: 'beginner', aiStyle: 'commercial' }
      ],
      rules
    });
    setBenchmarkReport(rep);
  };

  const playerColorsMap: Record<string, PlayerColor> = {};
  if (gameState) {
    for (const p of gameState.players) {
      playerColorsMap[p.id] = p.color;
    }
  }

  const activePlayerObj = gameState ? getPlayerById(gameState, gameState.activePlayerId) : undefined;
  const viewerPlayerObj = gameState ? getPlayerById(gameState, viewerId) : undefined;
  const isHumanTurn = activePlayerObj?.type === 'human';

  // Count unplayed development cards by type for the viewer/active player
  const unplayedDevCards = (viewerPlayerObj ?? activePlayerObj)?.devCards.filter((c) => !c.played) ?? [];
  const devCardCountsByType: Record<DevCardType, number> = {
    knight: 0,
    road_building: 0,
    year_of_plenty: 0,
    monopoly: 0,
    victory_point: 0
  };
  for (const c of unplayedDevCards) {
    devCardCountsByType[c.type]++;
  }

  return (
    <div className="app-shell">
      {/* Top Navigation Header (Fixed 52px height) */}
      <header className="app-header">
        <div className="brand-title">
          <span>🏝️</span>
          <span className="desktop-only">{t.appTitle}</span>
          <span className="mobile-only">Catan</span>
        </div>

        {/* Live Turn & Phase Status placed neatly in the top header */}
        {activeTab === 'game' && gameState && (
          <div className="header-turn-status">
            <span
              className="color-dot"
              style={{ backgroundColor: activePlayerObj?.color, width: 10, height: 10, flexShrink: 0 }}
            />
            <span className="turn-label">
              T{gameState.turn} ({activePlayerObj?.name}):
            </span>
            <span className="phase-label">
              {PHASE_LABELS[locale][gameState.phase]}
            </span>
            {buildMode !== 'none' && (
              <span className="build-indicator">
                👉 {buildMode.toUpperCase()}
              </span>
            )}
          </div>
        )}

        <nav className="nav-tabs">
          <button
            type="button"
            className={`nav-btn ${activeTab === 'lobby' ? 'active' : ''}`}
            onClick={() => setActiveTab('lobby')}
          >
            ⚙️ <span className="desktop-only">{t.navLobby}</span><span className="mobile-only">Lobby</span>
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'game' ? 'active' : ''}`}
            onClick={() => {
              if (!recorder) {
                handleStartGame(false);
              } else {
                setActiveTab('game');
              }
            }}
          >
            🎲 <span className="desktop-only">{t.navGame}</span><span className="mobile-only">Joc</span>
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'replay' ? 'active' : ''}`}
            onClick={() => {
              if (recorder) {
                const rep = recorder.toReplayFile();
                saveReplayToHistory(rep, false);
                setActiveReplay(rep);
              }
              setActiveTab('replay');
            }}
          >
            🎬 <span className="desktop-only">{t.navReplay}</span><span className="mobile-only">Replay</span>
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
            onClick={() => setActiveTab('benchmark')}
          >
            📈 <span className="desktop-only">{t.navBenchmark}</span><span className="mobile-only">Teste</span>
          </button>
        </nav>

        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            onClick={() => setLocale((l) => (l === 'ro' ? 'en' : 'ro'))}
          >
            🌐 {t.langToggle}
          </button>
          <button
            type="button"
            className="btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Ieșire Ecran Complet' : 'Ecran Complet'}
          >
            {isFullscreen ? '🗗' : '⛶'}
          </button>
        </div>
      </header>

      {/* TAB 1: LOBBY & GAME CONFIGURATION (Fully Responsive, Vertical Scroll on Mobile) */}
      {activeTab === 'lobby' && (
        <main className="lobby-container">
          {/* Left Panel: 1-4 Configurable Participants & Join by Code */}
          <section className="panel">
            {/* Join by Code / Link Card */}
            <div className="join-game-box">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-gold)', fontSize: '0.86rem' }}>
                  🎮 Intră într-o partidă cu Cod de Invitație
                </span>
                {joinCodeInput && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                    Cod preluat din link!
                  </span>
                )}
              </div>
              <div className="join-form-row">
                <input
                  type="text"
                  placeholder="Cod (ex: CATAN-1234)"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  style={{ flex: 1, minWidth: 0, width: '100%', textTransform: 'uppercase', fontWeight: 700 }}
                />
                <input
                  type="text"
                  placeholder="Numele tău"
                  value={joinPlayerName}
                  onChange={(e) => setJoinPlayerName(e.target.value)}
                  style={{ flex: 1, minWidth: 0, width: '100%' }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleJoinWithCode}
                  disabled={joinLoading || !joinCodeInput.trim()}
                  style={{ minWidth: 0, width: '100%', justifyContent: 'center' }}
                >
                  {joinLoading ? 'Se conectează...' : '🎮 Intră în Joc'}
                </button>
              </div>
              {joinError && (
                <div style={{ color: '#f87171', fontSize: '0.78rem', marginTop: 4 }}>
                  ⚠️ {joinError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexShrink: 0 }}>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>👥 {t.participantsTitle}</h2>
              {participants.length < 4 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const nextIdx = participants.length + 1;
                    const usedColors = new Set(participants.map((p) => p.color));
                    const nextColor =
                      PLAYER_COLORS.find((c) => !usedColors.has(c)) ??
                      PLAYER_COLORS[(nextIdx - 1) % 4]!;
                    setParticipants([
                      ...participants,
                      {
                        id: `p${nextIdx}`,
                        name: `Participant ${nextIdx}`,
                        type: 'ai',
                        color: nextColor,
                        aiDifficulty: 'medium',
                        aiStyle: 'balanced'
                      }
                    ]);
                  }}
                >
                  {t.addParticipant}
                </button>
              )}
            </div>

            {participants.length < 3 && (
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.14)',
                  border: '1px solid var(--accent-blue)',
                  borderRadius: 8,
                  padding: '0.45rem 0.7rem',
                  marginBottom: '0.55rem',
                  fontSize: '0.78rem',
                  flexShrink: 0
                }}
              >
                ℹ️{' '}
                {locale === 'ro'
                  ? `Ai selectat ${participants.length} participant(i). Se vor adăuga automat boți neutri/pasivi până la 3 participanți pe tablă.`
                  : `You selected ${participants.length} participant(s). Neutral/passive bots will automatically be added up to 3 players.`}
              </div>
            )}

            <div className="panel-scroll">
              {participants.map((p, idx) => (
                <div key={p.id} className="seat-card">
                  {/* Row 1: Color dot + Name + Delete button */}
                  <div className="seat-row-main">
                    <span className="color-dot" style={{ backgroundColor: p.color ?? PLAYER_COLORS[idx] }} />
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => {
                        const next = [...participants];
                        next[idx] = { ...p, name: e.target.value };
                        setParticipants(next);
                      }}
                      style={{ flex: 1, minWidth: 0, width: '100%' }}
                    />
                    {participants.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '0.3rem 0.6rem' }}
                        onClick={() => setParticipants(participants.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Row 2: Type (Human/AI) + Color Selection */}
                  <div className="seat-row-options">
                    <select
                      value={p.type}
                      onChange={(e) => {
                        const newType = e.target.value as ParticipantType;
                        const next = [...participants];
                        next[idx] = {
                          ...p,
                          type: newType,
                          aiDifficulty: p.aiDifficulty ?? 'medium',
                          aiStyle: p.aiStyle ?? 'balanced'
                        };
                        setParticipants(next);
                      }}
                    >
                      {(['human', 'ai', 'llm', 'passive'] as ParticipantType[]).map((pt) => (
                        <option key={pt} value={pt}>
                          {PARTICIPANT_TYPE_LABELS[locale][pt]}
                        </option>
                      ))}
                    </select>

                    <select
                      value={p.color ?? PLAYER_COLORS[idx]}
                      onChange={(e) => {
                        const next = [...participants];
                        next[idx] = { ...p, color: e.target.value as PlayerColor };
                        setParticipants(next);
                      }}
                    >
                      {PLAYER_COLORS.map((c) => (
                        <option key={c} value={c}>
                          {c.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Row 3 (if AI): Difficulty & Strategy Style */}
                  {(p.type === 'ai' || p.type === 'llm') && (
                    <div className="seat-row-ai">
                      <div className="form-field">
                        <label>{locale === 'ro' ? 'Dificultate AI' : 'AI Difficulty'}</label>
                        <select
                          value={p.aiDifficulty ?? 'medium'}
                          onChange={(e) => {
                            const next = [...participants];
                            next[idx] = { ...p, aiDifficulty: e.target.value as AIDifficulty };
                            setParticipants(next);
                          }}
                        >
                          {(['beginner', 'medium', 'advanced', 'expert'] as AIDifficulty[]).map(
                            (diff) => (
                              <option key={diff} value={diff}>
                                {AI_DIFFICULTY_LABELS[locale][diff]}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <div className="form-field">
                        <label>{locale === 'ro' ? 'Stil Strategic AI' : 'AI Strategy Style'}</label>
                        <select
                          value={p.aiStyle ?? 'balanced'}
                          onChange={(e) => {
                            const next = [...participants];
                            next[idx] = { ...p, aiStyle: e.target.value as AIStrategyStyle };
                            setParticipants(next);
                          }}
                        >
                          {(
                            [
                              'balanced',
                              'expansion',
                              'development',
                              'commercial',
                              'competitive',
                              'adaptive'
                            ] as AIStrategyStyle[]
                          ).map((st) => (
                            <option key={st} value={st}>
                              {AI_STYLE_LABELS[locale][st]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Unified Start Buttons & Share Banner */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.65rem', flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-primary btn-start-match"
                onClick={() => handleStartGame(true)}
              >
                🚀 {t.startGame}
              </button>

              <button
                type="button"
                className="btn btn-quick-sim"
                onClick={handleQuick4AiSimulation}
              >
                ⚡ {t.quickAiMatch} & Analiză
              </button>

              {createdInviteCode && (
                <div className="invite-banner">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                    <span>
                      Cod Partidă: <strong style={{ color: 'var(--accent-gold)', fontSize: '0.95rem' }}>{createdInviteCode}</strong>
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => handleShareInvite(createdInviteCode)}
                    >
                      📲 Trimite Link / Invită Prieteni
                    </button>
                  </div>
                </div>
              )}

              {serverStatusMsg && (
                <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', marginTop: 2 }}>
                  {serverStatusMsg}
                </div>
              )}
            </div>
          </section>

          {/* Right Panel: Rules & Visual Card Preview */}
          <section className="panel">
            <h2>📜 {t.rulesTitle}</h2>
            <div className="panel-scroll">
              <div className="form-grid">
                <div className="form-field">
                  <label>{t.vpToWin}</label>
                  <select
                    value={rules.victoryPointsToWin}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        victoryPointsToWin: Number(e.target.value) as 10 | 12 | 14
                      })
                    }
                  >
                    <option value={10}>10 Puncte (Standard)</option>
                    <option value={12}>12 Puncte (Extins)</option>
                    <option value={14}>14 Puncte (Maraton)</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>{t.startingResources}</label>
                  <select
                    value={rules.startingResourcesRule}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        startingResourcesRule: e.target.value as GameRulesConfig['startingResourcesRule']
                      })
                    }
                  >
                    <option value="second_settlement">{t.startingSecondOnly}</option>
                    <option value="both_settlements">{t.startingBoth}</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>{t.knightRule}</label>
                  <select
                    value={rules.knightStealRule}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        knightStealRule: e.target.value as GameRulesConfig['knightStealRule']
                      })
                    }
                  >
                    <option value="single">{t.knightSingle}</option>
                    <option value="all_adjacent">{t.knightAll}</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>{t.devCardRule}</label>
                  <select
                    value={rules.devCardsPerTurnRule}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        devCardsPerTurnRule: e.target.value as GameRulesConfig['devCardsPerTurnRule']
                      })
                    }
                  >
                    <option value="one_total">{t.devOneTotal}</option>
                    <option value="one_per_type">{t.devOnePerType}</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>{t.boardLayout}</label>
                  <input
                    type="text"
                    readOnly
                    value={
                      locale === 'ro'
                        ? 'Spirala Oficială Regulament (A–R ceasornic)'
                        : 'Official Rulebook Spiral (A–R clockwise)'
                    }
                    style={{ color: 'var(--accent-gold)', fontWeight: 600 }}
                  />
                </div>

                <div className="form-field">
                  <label>{t.seedLabel}</label>
                  <input
                    type="text"
                    value={customSeed}
                    onChange={(e) => setCustomSeed(e.target.value)}
                    placeholder="ex: catan-2026"
                  />
                </div>
              </div>

              <div style={{ marginTop: '0.85rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.45rem', color: 'var(--accent-gold)' }}>
                  Cărți de Resurse & Dezvoltare (Asset-uri grafice din <code>poze/cards.jpg</code>):
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                  {ALL_RESOURCES.map((r) => (
                    <ResourceCardSprite key={r} resource={r} count={4} locale={locale} size="xs" />
                  ))}
                  <DevCardSprite type="knight" locale={locale} size="xs" />
                  <DevCardSprite type="road_building" locale={locale} size="xs" />
                  <DevCardSprite type="monopoly" locale={locale} size="xs" />
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* TAB 2: ACTIVE GAME SCREEN (Full-Window Zero-Scroll Layout + Modals) */}
      {activeTab === 'game' && gameState && playerView && (
        <main className="game-viewport">
          {/* Left HUD Column (345px wide): Compact Players, Single-Row Bank Stock & Modal Triggers */}
          {/* Backdrop for Mobile Slide-in Drawer */}
          {mobileHudOpen && (
            <div
              className="hud-backdrop mobile-only"
              onClick={() => setMobileHudOpen(false)}
            />
          )}

          {/* Left HUD Column: Slide-in Drawer on mobile, static 345px on desktop */}
          <aside className={`game-left-hud ${mobileHudOpen ? 'mobile-open' : ''}`}>
            <div className="mobile-hud-header mobile-only">
              <span style={{ fontWeight: 700, color: 'var(--accent-gold)' }}>
                👥 {locale === 'ro' ? 'Participanți & Bancă' : 'Players & Bank'}
              </span>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setMobileHudOpen(false)}
              >
                ✕ {locale === 'ro' ? 'Închide' : 'Close'}
              </button>
            </div>
            <div className="panel" style={{ flex: 1, minHeight: 0 }}>
              <h2>
                🏆 {locale === 'ro' ? 'Participanți' : 'Players'} (Țintă: {gameState.rules.victoryPointsToWin} VP)
              </h2>
              <div className="panel-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {playerView.players.map((p) => {
                  const isCurrent = playerView.activePlayerId === p.id;
                  const hasLongestRoad = playerView.longestRoadOwnerId === p.id;
                  const hasLargestArmy = playerView.largestArmyOwnerId === p.id;
                  return (
                    <div key={p.id} className={`player-card ${isCurrent ? 'active-turn' : ''}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem' }}>
                        <span>
                          <span
                            className="color-dot"
                            style={{ backgroundColor: p.color, marginRight: 5, verticalAlign: 'middle' }}
                          />
                          <strong>{p.name}</strong>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                            [{p.type.toUpperCase()}]
                          </span>
                        </span>
                        <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                          {p.totalScore !== undefined ? `${p.totalScore} VP` : `${p.publicScore} VP`}
                        </span>
                      </div>

                      {p.resources ? (
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          {ALL_RESOURCES.map((r) => (
                            <ResourceCardSprite
                              key={r}
                              resource={r}
                              count={p.resources![r]}
                              locale={locale}
                              size="xs"
                            />
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.76rem', marginTop: 3, color: 'var(--text-muted)' }}>
                          🎴 {p.resourceCount} resurse · 🃏 {p.devCardCount} dezvoltare
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', fontSize: '0.73rem', marginTop: '0.3rem', color: 'var(--text-muted)' }}>
                        <span>🛣️ Drum: {p.longestRoadLength}</span>
                        <span>⚔️ Cavaleri: {p.knightsPlayed}</span>
                        {hasLongestRoad && (
                          <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>🏅 +2 Drum</span>
                        )}
                        {hasLargestArmy && (
                          <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>🛡️ +2 Armată</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Single-Row Bank Stock & Spacious Control Buttons */}
            <div className="panel" style={{ flexShrink: 0, padding: '0.7rem' }}>
              <h2 style={{ marginBottom: '0.45rem', fontSize: '0.88rem' }}>
                🏦 Bancă & Control Partidă
              </h2>
              <div className="bank-single-row">
                {ALL_RESOURCES.map((r) => (
                  <span key={r} className="res-badge" title={RESOURCE_LABELS[locale][r]}>
                    {RESOURCE_ICONS[r]} {playerView.bank[r]}
                  </span>
                ))}
                <span className="res-badge" title="Cărți de dezvoltare în pachet">
                  🃏 {playerView.devCardDeckCount}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={executeOneAiStep}
                  disabled={gameState.phase === 'game_over' || isHumanTurn}
                >
                  ⏭ {t.stepAi}
                </button>
                <button
                  type="button"
                  className={`btn ${autoPlayAi ? 'btn-primary' : ''}`}
                  onClick={() => setAutoPlayAi((a) => !a)}
                >
                  {autoPlayAi ? `⏸ ${t.pauseAi}` : `▶ ${t.autoPlayAi}`}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setActiveModal('event_log')}
                >
                  📜 Jurnal ({recorder?.getEvents().length ?? 0})
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setActiveModal('costs_help')}
                >
                  📋 Tabel Costuri
                </button>
              </div>
            </div>
          </aside>

          {/* Center Interactive Map Stage */}
          <section className="board-stage">
            <div className="board-top-banner">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveModal('score_bank')}
                style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                👥 {locale === 'ro' ? 'Scor & Bancă' : 'Scores & Bank'}
              </button>

              {/* Animated Dice Roll Widget in Top-Right of the Board */}
              <AnimatedDiceWidget
                die1={gameState.lastDiceRoll?.die1}
                die2={gameState.lastDiceRoll?.die2}
                total={gameState.lastDiceRoll?.total}
                turn={gameState.turn}
                rollTriggerKey={diceRollAnimKey}
                canRoll={gameState.phase === 'turn_start' && isHumanTurn}
                onRollClick={() => {
                  if (activePlayerObj) {
                    executeAction(activePlayerObj.id, { type: 'roll_dice' });
                  }
                }}
                locale={locale}
              />
            </div>

            {actionError && (
              <div
                style={{
                  position: 'absolute',
                  top: 66,
                  left: 12,
                  zIndex: 14,
                  background: 'rgba(220, 38, 38, 0.92)',
                  border: '1px solid #fca5a5',
                  padding: '0.4rem 0.75rem',
                  borderRadius: 8,
                  fontSize: '0.8rem'
                }}
              >
                ⚠️ {actionError}
              </div>
            )}

            <BoardSvg
              board={gameState.board}
              playerColors={playerColorsMap}
              locale={locale}
              highlightedVertices={highlightedVertices}
              highlightedEdges={highlightedEdges}
              highlightedHexes={highlightedHexes}
              onSelectVertex={handleSelectVertex}
              onSelectEdge={handleSelectEdge}
              onSelectHex={handleSelectHex}
            />
          </section>

          {/* Bottom Dock: Visual Resource Hand + Dev Cards + Quick Action & Modal Triggers */}
          <footer className={`game-bottom-dock ${mobileDockCollapsed ? 'dock-collapsed' : ''}`}>
            {/* Header row: player name, card count, and mobile collapse toggle */}
            <div className="dock-title-bar">
              <div className="dock-player-name">
                <span>Cărțile lui</span> <strong>{(viewerPlayerObj ?? activePlayerObj)?.name}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({totalResourceCount((viewerPlayerObj ?? activePlayerObj)?.resources ?? createEmptyResources())} resurse)
                </span>
              </div>
              <button
                type="button"
                className="btn mobile-only"
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem' }}
                onClick={() => setMobileDockCollapsed((c) => !c)}
              >
                {mobileDockCollapsed ? '▲ Arată' : '▼ Ascunde'}
              </button>
            </div>

            {/* Cards Row: All 5 resources + dev card in ONE ROW, ZERO SCROLL */}
            <div className="dock-cards-row">
              {ALL_RESOURCES.map((r) => (
                <ResourceCardSprite
                  key={r}
                  resource={r}
                  count={(viewerPlayerObj ?? activePlayerObj)?.resources[r] ?? 0}
                  locale={locale}
                  size="xs"
                />
              ))}

              <div
                onClick={() => setActiveModal('dev_cards')}
                style={{ cursor: 'pointer' }}
                title={locale === 'ro' ? 'Deschide Cărțile de Dezvoltare' : 'Open Development Cards'}
              >
                <DevCardSprite
                  type="back"
                  locale={locale}
                  count={unplayedDevCards.length}
                  canPlay={unplayedDevCards.length > 0}
                  size="xs"
                />
              </div>
            </div>

            {/* Actions Row: Underneath the cards, ZERO SCROLL */}
            <div className="dock-actions-row">
              {gameState.phase === 'turn_start' && isHumanTurn && activePlayerObj && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => executeAction(activePlayerObj.id, { type: 'roll_dice' })}
                >
                  🎲 {t.rollDice}
                </button>
              )}

              {gameState.phase === 'main_actions' && isHumanTurn && activePlayerObj && (
                <>
                  <button
                    type="button"
                    className={`btn ${buildMode === 'road' ? 'btn-primary' : ''}`}
                    disabled={
                      !hasResources(activePlayerObj.resources, BUILDING_COSTS.road) ||
                      activePlayerObj.remainingPieces.roads <= 0
                    }
                    onClick={() => setBuildMode((m) => (m === 'road' ? 'none' : 'road'))}
                  >
                    🛣️ {t.buildRoad}
                  </button>

                  <button
                    type="button"
                    className={`btn ${buildMode === 'settlement' ? 'btn-primary' : ''}`}
                    disabled={
                      !hasResources(activePlayerObj.resources, BUILDING_COSTS.settlement) ||
                      activePlayerObj.remainingPieces.settlements <= 0
                    }
                    onClick={() => setBuildMode((m) => (m === 'settlement' ? 'none' : 'settlement'))}
                  >
                    🏠 {t.buildSettlement}
                  </button>

                  <button
                    type="button"
                    className={`btn ${buildMode === 'city' ? 'btn-primary' : ''}`}
                    disabled={
                      !hasResources(activePlayerObj.resources, BUILDING_COSTS.city) ||
                      activePlayerObj.remainingPieces.cities <= 0
                    }
                    onClick={() => setBuildMode((m) => (m === 'city' ? 'none' : 'city'))}
                  >
                    🏰 {t.buildCity}
                  </button>

                  <button
                    type="button"
                    className="btn"
                    disabled={
                      !hasResources(activePlayerObj.resources, BUILDING_COSTS.dev_card) ||
                      gameState.devCardDeck.length === 0
                    }
                    onClick={() => executeAction(activePlayerObj.id, { type: 'buy_dev_card' })}
                  >
                    🃏 +Dezvoltare
                  </button>

                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActiveModal('trade')}
                  >
                    ⚓ Comerț
                  </button>
                </>
              )}

              {gameState.phase === 'main_actions' && isHumanTurn && activePlayerObj && (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => executeAction(activePlayerObj.id, { type: 'end_turn' })}
                >
                  ⏭️ {t.endTurn}
                </button>
              )}
            </div>
          </footer>

          {/* MODAL: Responsive Score, Players & Bank Grid */}
      {activeModal === 'score_bank' && gameState && playerView && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div
            className="modal-dialog"
            style={{ maxWidth: 880 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>
                🏆 {locale === 'ro' ? 'Clasament, Participanți & Bancă' : 'Leaderboard, Players & Bank'} (Țintă: {gameState.rules.victoryPointsToWin} VP)
              </h3>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setActiveModal('none')}
              >
                ✕ {locale === 'ro' ? 'Închide' : 'Close'}
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {/* Responsive Grid of Players */}
              <div className="score-bank-grid">
                {playerView.players.map((p) => {
                  const isCurrent = playerView.activePlayerId === p.id;
                  const hasLongestRoad = playerView.longestRoadOwnerId === p.id;
                  const hasLargestArmy = playerView.largestArmyOwnerId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`player-grid-card ${isCurrent ? 'active-turn' : ''}`}
                    >
                      <div className="player-grid-header">
                        <div className="player-grid-title">
                          <span
                            className="color-dot"
                            style={{ backgroundColor: p.color, width: 12, height: 12 }}
                          />
                          <span>{p.name}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            [{p.type.toUpperCase()}]
                          </span>
                        </div>
                        <span className="player-grid-score">
                          {p.totalScore !== undefined ? `${p.totalScore} VP` : `${p.publicScore} VP`}
                        </span>
                      </div>

                      {p.resources ? (
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 2 }}>
                          {ALL_RESOURCES.map((r) => (
                            <ResourceCardSprite
                              key={r}
                              resource={r}
                              count={p.resources![r]}
                              locale={locale}
                              size="xs"
                            />
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.2rem 0' }}>
                          🎴 {p.resourceCount} resurse · 🃏 {p.devCardCount} dezvoltare
                        </div>
                      )}

                      <div className="player-grid-stats">
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>🛣️ Drum: {p.longestRoadLength}</span>
                          <span>⚔️ Cavaleri: {p.knightsPlayed}</span>
                        </div>
                        <div className="player-grid-badges">
                          {hasLongestRoad && (
                            <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                              🏅 +2 Drum
                            </span>
                          )}
                          {hasLargestArmy && (
                            <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                              🛡️ +2 Armată
                            </span>
                          )}
                          {isCurrent && (
                            <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                              ⚡ La rând
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bank Stock */}
              <div style={{ background: '#0d1a29', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '0.3rem' }}>
                  🏦 Stoc Bancă & Pachet Cărți
                </div>
                <div className="bank-single-row" style={{ margin: 0 }}>
                  {ALL_RESOURCES.map((r) => (
                    <span key={r} className="res-badge" title={RESOURCE_LABELS[locale][r]}>
                      {RESOURCE_ICONS[r]} {playerView.bank[r]}
                    </span>
                  ))}
                  <span className="res-badge" title="Cărți de dezvoltare în pachet">
                    🃏 {playerView.devCardDeckCount}
                  </span>
                </div>
              </div>

              {/* Match Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={executeOneAiStep}
                  disabled={gameState.phase === 'game_over' || isHumanTurn}
                >
                  ⏭ {t.stepAi}
                </button>
                <button
                  type="button"
                  className={`btn ${autoPlayAi ? 'btn-primary' : ''}`}
                  onClick={() => setAutoPlayAi((a) => !a)}
                >
                  {autoPlayAi ? `⏸ ${t.pauseAi}` : `▶ ${t.autoPlayAi}`}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setActiveModal('event_log')}
                >
                  📜 Jurnal ({recorder?.getEvents().length ?? 0})
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setActiveModal('costs_help')}
                >
                  📋 Tabel Costuri
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL A: DEVELOPMENT CARDS HAND & PLAY ACTIONS */}
          {activeModal === 'dev_cards' && activePlayerObj && (
            <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>
                    🃏 {t.devCardsTitle} — {(viewerPlayerObj ?? activePlayerObj).name} ({unplayedDevCards.length})
                  </h3>
                  <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                    ✕ Închide
                  </button>
                </div>
                <div className="modal-body">
                  {unplayedDevCards.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                      Nu ai cărți de dezvoltare nefolosite în mână. Poți cumpăra o carte de dezvoltare (1 Grâu + 1 Oaie + 1 Minereu) în timpul turei tale.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '1rem' }}>
                      {(
                        [
                          'knight',
                          'road_building',
                          'year_of_plenty',
                          'monopoly',
                          'victory_point'
                        ] as DevCardType[]
                      )
                        .filter((dt) => devCardCountsByType[dt] > 0)
                        .map((dt) => {
                          const canPlayThis =
                            isHumanTurn && canPlayDevCardType(gameState, activePlayerObj, dt);
                          const allBoughtThisTurn = unplayedDevCards
                            .filter((c) => c.type === dt)
                            .every((c) => c.boughtAtTurn === gameState.turn);
                          return (
                            <DevCardSprite
                              key={dt}
                              type={dt}
                              locale={locale}
                              count={devCardCountsByType[dt]}
                              isNew={allBoughtThisTurn && dt !== 'victory_point'}
                              canPlay={canPlayThis}
                              size="lg"
                              actionLabel={
                                dt === 'knight'
                                  ? '⚔️ Activează Cavaler'
                                  : dt === 'road_building'
                                  ? '🛣️ Joacă 2 Drumuri'
                                  : undefined
                              }
                              onPlay={
                                dt === 'knight'
                                  ? () => {
                                      setBuildMode('knight');
                                      setActiveModal('none');
                                    }
                                  : dt === 'road_building'
                                  ? () => {
                                      executeAction(activePlayerObj.id, {
                                        type: 'play_road_building'
                                      });
                                      setActiveModal('none');
                                    }
                                  : undefined
                              }
                            />
                          );
                        })}
                    </div>
                  )}

                  {isHumanTurn && canPlayDevCardType(gameState, activePlayerObj, 'year_of_plenty') && (
                    <div className="candidate-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong>🎁 Anul Abundenței (alege 2 resurse din bancă):</strong>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          value={yopResources[0]}
                          onChange={(e) =>
                            setYopResources([e.target.value as ResourceType, yopResources[1]])
                          }
                        >
                          {ALL_RESOURCES.map((r) => (
                            <option key={r} value={r}>
                              {RESOURCE_LABELS[locale][r]}
                            </option>
                          ))}
                        </select>
                        <select
                          value={yopResources[1]}
                          onChange={(e) =>
                            setYopResources([yopResources[0], e.target.value as ResourceType])
                          }
                        >
                          {ALL_RESOURCES.map((r) => (
                            <option key={r} value={r}>
                              {RESOURCE_LABELS[locale][r]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            executeAction(activePlayerObj.id, {
                              type: 'play_year_of_plenty',
                              resources: yopResources
                            });
                            setActiveModal('none');
                          }}
                        >
                          Joacă Anul Abundenței
                        </button>
                      </div>
                    </div>
                  )}

                  {isHumanTurn && canPlayDevCardType(gameState, activePlayerObj, 'monopoly') && (
                    <div className="candidate-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong>👑 Monopol (alege resursa confiscată de la toți adversarii):</strong>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          value={monopolyResource}
                          onChange={(e) => setMonopolyResource(e.target.value as ResourceType)}
                        >
                          {ALL_RESOURCES.map((r) => (
                            <option key={r} value={r}>
                              {RESOURCE_LABELS[locale][r]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            executeAction(activePlayerObj.id, {
                              type: 'play_monopoly',
                              resource: monopolyResource
                            });
                            setActiveModal('none');
                          }}
                        >
                          Joacă Monopol
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MODAL B: MARITIME / BANK TRADE & PLAYER-TO-PLAYER TRADE */}
          {activeModal === 'trade' && activePlayerObj && (
            <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>⚓ Comerț Maritim (Bancă / Porturi) & Schimb între Jucători</h3>
                  <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                    ✕ Închide
                  </button>
                </div>
                <div className="modal-body">
                  <div className="candidate-row" style={{ marginBottom: '0.9rem', padding: '0.75rem' }}>
                    <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>
                      1. {t.tradeBankTitle}
                    </h4>
                    {(() => {
                      const ratio = getPlayerBankTradeRatio(
                        gameState.board,
                        activePlayerObj.id,
                        bankGiveRes
                      );
                      const canAfford =
                        activePlayerObj.resources[bankGiveRes] >= ratio &&
                        bankGiveRes !== bankReceiveRes &&
                        gameState.bank[bankReceiveRes] >= 1;

                      return (
                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={bankGiveRes}
                            onChange={(e) => setBankGiveRes(e.target.value as ResourceType)}
                          >
                            {ALL_RESOURCES.map((r) => {
                              const rRatio = getPlayerBankTradeRatio(
                                gameState.board,
                                activePlayerObj.id,
                                r
                              );
                              return (
                                <option key={r} value={r}>
                                  Oferă {rRatio}x {RESOURCE_LABELS[locale][r]} (ai {activePlayerObj.resources[r]})
                                </option>
                              );
                            })}
                          </select>
                          <span>➔</span>
                          <select
                            value={bankReceiveRes}
                            onChange={(e) => setBankReceiveRes(e.target.value as ResourceType)}
                          >
                            {ALL_RESOURCES.map((r) => (
                              <option key={r} value={r}>
                                Primește 1x {RESOURCE_LABELS[locale][r]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!canAfford}
                            onClick={() => {
                              executeAction(activePlayerObj.id, {
                                type: 'trade_bank',
                                give: bankGiveRes,
                                giveAmount: ratio,
                                receive: bankReceiveRes
                              });
                            }}
                          >
                            Schimbă cu Banca ({ratio}:1)
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="candidate-row" style={{ padding: '0.75rem' }}>
                    <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.4rem' }}>
                      2. 🤝 {t.tradeP2PTitle} (Expirare ofertă: {gameState.rules.tradeOfferTimeoutSec}s)
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                      <div>
                        <strong style={{ fontSize: '0.8rem' }}>Oferi din mână:</strong>
                        {ALL_RESOURCES.map((r) => (
                          <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontSize: '0.8rem' }}>
                              {RESOURCE_ICONS[r]} {RESOURCE_LABELS[locale][r]}: <strong>{p2pOffer[r]}</strong>
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setP2pOffer({ ...p2pOffer, [r]: Math.max(0, p2pOffer[r] - 1) })
                                }
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setP2pOffer({
                                    ...p2pOffer,
                                    [r]: Math.min(activePlayerObj.resources[r], p2pOffer[r] + 1)
                                  })
                                }
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.8rem' }}>Ceri la schimb:</strong>
                        {ALL_RESOURCES.map((r) => (
                          <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontSize: '0.8rem' }}>
                              {RESOURCE_ICONS[r]} {RESOURCE_LABELS[locale][r]}: <strong>{p2pRequest[r]}</strong>
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setP2pRequest({ ...p2pRequest, [r]: Math.max(0, p2pRequest[r] - 1) })
                                }
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setP2pRequest({ ...p2pRequest, [r]: p2pRequest[r] + 1 })
                                }
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ marginTop: '0.65rem', width: '100%' }}
                      disabled={
                        totalResourceCount(p2pOffer) === 0 || totalResourceCount(p2pRequest) === 0
                      }
                      onClick={() => {
                        executeAction(activePlayerObj.id, {
                          type: 'propose_trade',
                          offering: p2pOffer,
                          requesting: p2pRequest
                        });
                        setP2pOffer(createEmptyResources());
                        setP2pRequest(createEmptyResources());
                        setActiveModal('none');
                      }}
                    >
                      Trimite Oferta de Schimb Jucătorilor
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODAL C: EVENT LOG */}
          {activeModal === 'event_log' && recorder && (
            <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>📜 {t.eventLogTitle} ({recorder.getEvents().length} acțiuni)</h3>
                  <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                    ✕ Închide
                  </button>
                </div>
                <div className="modal-body">
                  <div className="event-list">
                    {[...recorder.getEvents()].reverse().map((ev) => {
                      const p = getPlayerById(gameState, ev.playerId);
                      return (
                        <div key={ev.sequence} className="event-item">
                          <strong>#{ev.sequence}</strong> [T{ev.turn}] <strong>{p?.name ?? ev.playerId}</strong>:{' '}
                          {formatActionDescription(ev.action, locale)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODAL D: BUILDING COSTS REFERENCE (/cost.jpg) */}
          {activeModal === 'costs_help' && (
            <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>📋 Tabel Costuri Construcții & Puncte de Victorie</h3>
                  <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                    ✕ Închide
                  </button>
                </div>
                <div className="modal-body" style={{ textAlign: 'center' }}>
                  <img
                    src="/cost.jpg"
                    alt="Costuri Catan"
                    style={{ maxWidth: '100%', maxHeight: '65dvh', borderRadius: 8, border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* AUTOMATIC MODAL E: DISCARD CARDS ON 7 ROLL (>7 cards) */}
          {gameState.phase === 'discard_resources' &&
            Object.keys(gameState.pendingDiscards).map((discardPid) => {
              const p = getPlayerById(gameState, discardPid);
              if (!p || p.type !== 'human') return null;
              const needed = gameState.pendingDiscards[discardPid] ?? 0;
              const currentSelected = totalResourceCount(discardSelection);
              return (
                <div key={discardPid} className="modal-backdrop">
                  <div className="modal-dialog" style={{ borderColor: 'var(--accent-red)' }}>
                    <div className="modal-header">
                      <h3 style={{ color: 'var(--accent-red)' }}>
                        ⚠️ S-a dat 7! {p.name} trebuie să decarteze {needed} cărți ({currentSelected}/{needed})
                      </h3>
                    </div>
                    <div className="modal-body">
                      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                        {ALL_RESOURCES.map((r) => (
                          <div key={r} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <ResourceCardSprite
                              resource={r}
                              count={p.resources[r]}
                              locale={locale}
                              size="md"
                              selected={discardSelection[r] > 0}
                            />
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setDiscardSelection({
                                    ...discardSelection,
                                    [r]: Math.max(0, discardSelection[r] - 1)
                                  })
                                }
                              >
                                -
                              </button>
                              <strong>{discardSelection[r]}</strong>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setDiscardSelection({
                                    ...discardSelection,
                                    [r]: Math.min(p.resources[r], discardSelection[r] + 1)
                                  })
                                }
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        disabled={currentSelected !== needed}
                        onClick={() =>
                          executeAction(discardPid, {
                            type: 'discard_cards',
                            resources: discardSelection
                          })
                        }
                      >
                        Confirmă Decartarea ({currentSelected}/{needed})
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

          {/* AUTOMATIC MODAL F: STEAL RESOURCE TARGET SELECTION */}
          {gameState.phase === 'steal_resource' && isHumanTurn && (
            <div className="modal-backdrop">
              <div className="modal-dialog" style={{ maxWidth: 460 }}>
                <div className="modal-header">
                  <h3>🥷 Alege adversarul de la care furi 1 resursă</h3>
                </div>
                <div className="modal-body" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {(gameState.robberContext?.eligibleTargetIds ?? []).map((tId) => {
                    const tp = getPlayerById(gameState, tId);
                    return (
                      <button
                        key={tId}
                        type="button"
                        className="btn btn-primary"
                        onClick={() =>
                          executeAction(gameState.activePlayerId, {
                            type: 'steal_from_player',
                            targetPlayerId: tId
                          })
                        }
                      >
                        Fură 1 carte de la {tp?.name ?? tId}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* AUTOMATIC MODAL G: GAME OVER & SAVED FOR LATER ANALYSIS */}
          {gameState.winnerId && (
            <div className="modal-backdrop">
              <div className="modal-dialog" style={{ maxWidth: 520, textAlign: 'center' }}>
                <div className="modal-header">
                  <h3>🎉 Partidă Finalizată & Salvată Automat!</h3>
                </div>
                <div className="modal-body">
                  <h2 style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>
                    🏆 {getPlayerById(gameState, gameState.winnerId)?.name}{' '}
                    {locale === 'ro' ? 'a câștigat partida!' : 'won the game!'}
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: '1rem' }}>
                    Partida ({gameState.gameId}) a fost salvată automat în Istoricul Partidelor pentru analiză pas-cu-pas, evaluarea deciziilor și statistici.
                  </p>
                  <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        if (recorder) {
                          const rep = recorder.toReplayFile();
                          saveReplayToHistory(rep, true);
                          setActiveReplay(rep);
                          setActiveTab('replay');
                        }
                      }}
                    >
                      🎬 Deschide în Replay & Analiză
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setActiveTab('lobby')}
                    >
                      ⚙️ Partidă Nouă
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* TAB 3: REPLAY VIEWER & SAVED GAMES HISTORY */}
      {activeTab === 'replay' && (
        <ReplayAndAnalysisView
          replay={activeReplay ?? (recorder ? recorder.toReplayFile() : null)}
          onSelectReplay={(rep) => setActiveReplay(rep)}
          locale={locale}
        />
      )}

      {/* TAB 4: AI BENCHMARK RUNNER & RULES REFERENCE (Fits inside locked viewport) */}
      {activeTab === 'benchmark' && (
        <main className="lobby-container">
          <section className="panel">
            <h2>🔬 Simulator Statistic AI vs. AI (Secțiunea 6.6 & 9.3)</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.65rem', flexShrink: 0 }}>
              Rulează partide complete AI vs. AI cu rotația pozițiilor de start și calculează rata de victorie, intervalul de încredere 95% (Wilson CI) și scorul mediu.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
              <label style={{ fontSize: '0.82rem' }}>Număr partide:</label>
              <select
                value={benchmarkGamesCount}
                onChange={(e) => setBenchmarkGamesCount(Number(e.target.value))}
              >
                <option value={4}>4 partide (rotație completă)</option>
                <option value={8}>8 partide</option>
                <option value={12}>12 partide</option>
              </select>
              <button type="button" className="btn btn-primary" onClick={handleRunBenchmark}>
                ▶ Rulează Benchmark AI
              </button>
            </div>

            <div className="panel-scroll">
              {benchmarkReport && (
                <div>
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.82rem' }}>
                    Partide finalizate: <strong>{benchmarkReport.completedGames}/{benchmarkReport.gamesCount}</strong> ·
                    Medie ture: <strong>{benchmarkReport.averageTurns}</strong> · Mutări ilegale:{' '}
                    <strong style={{ color: 'var(--accent-green)' }}>{benchmarkReport.totalIllegalMoves}</strong>
                  </div>
                  {Object.values(benchmarkReport.playerStats).map((st) => (
                    <div key={st.playerId} className="candidate-row">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{st.name}</strong>
                        <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                          Victorii: {st.wins}/{st.gamesPlayed} ({Math.round(st.winRate * 100)}%)
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        Scor mediu: <strong>{st.averageScore} VP</strong> · Interval încredere 95%:{' '}
                        [{Math.round(st.confidenceInterval95[0] * 100)}%,{' '}
                        {Math.round(st.confidenceInterval95[1] * 100)}%]
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <h2>📖 Ghidul Regulilor & Galerie Asset-uri (<code>poze/</code>)</h2>
            <div className="panel-scroll" style={{ fontSize: '0.8rem', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p>
                <strong>1. Tabla și Producția:</strong> 19 hexagoane așezate în spirală (în sensul acelor de ceasornic) cu jetoane numerice alfabetice <code>A–R</code> (sărind peste Deșert), texturi din <code>terrains_hexes.png</code> și 9 porturi din <code>harbors.png</code>.
              </p>
              <p>
                <strong>2. Reguli Configurabile:</strong> Prag de victorie (10, 12 sau 14 VP), furt Cavaler simplu sau multiplu (de la toți jucătorii prezenți pe hexagon), și limită de 1 carte de dezvoltare pe tură sau 1 din fiecare tip.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.35rem' }}>
                <img
                  src="/cost.jpg"
                  alt="Tabel Costuri"
                  style={{ width: '100%', maxHeight: 190, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border-color)' }}
                />
                <img
                  src="/resource_cards.jpg"
                  alt="Cărți Resurse"
                  style={{ width: '100%', maxHeight: 190, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
};
