import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ALL_RESOURCES,
  AIDifficulty,
  AIStrategyStyle,
  BUILDING_COSTS,
  DevCardType,
  GameAction,
  GameRulesConfig,
  GameState,
  INITIAL_PLAYER_PIECES,
  PLAYER_COLORS,
  ParticipantConfig,
  ParticipantType,
  PlayerColor,
  PlayerView,
  ReplayFile,
  ReplayRecorder,
  ResourceCount,
  ResourceType,
  TERRAIN_TO_RESOURCE,
  TradeOffer,
  canPlayDevCardType,
  createEmptyResources,
  createRulesConfig,
  getEligibleRobberTargetsOnHex,
  getLegalActions,
  getPlayerBankTradeRatio,
  getPlayerById,
  getPlayerView,
  hasResources,
  totalResourceCount,
  calculateScore,
  isScenarioWithShips
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
  Confetti,
  DevCardSprite,
  ResourceCardSprite
} from './components/GameAssets';
import { ReplayAndAnalysisView } from './components/ReplayAndAnalysisView';
import { HallOfFameView } from './components/HallOfFameView';
import { SandboxMode } from './components/SandboxMode';
import {
  saveReplayToHistory,
  loadSavedPlayerName,
  savePlayerName,
  loadSavedParticipants,
  saveLobbyParticipants,
  loadSavedRules,
  saveLobbyRules,
  loadSavedTimerConfig,
  saveLobbyTimer,
  loadSavedOnlineSession,
  saveOnlineSession
} from './storage';
import {
  GameSyncPayload,
  LobbyState,
  OnlineSession,
  createOnlineLobby,
  fetchGameState,
  stepOnlineAi,
  terminateOnlineGame,
  terminateOnlineLobby,
  respondOnlineTermination,
  fetchLobby,
  fetchSpectatorGameState,
  joinOnlineLobbyByCode,
  listPublicLobbies,
  playerViewToGameState,
  startOnlineLobby,
  submitOnlineAction,
  wsUrlForGame
} from './online';
import {
  AI_DIFFICULTY_LABELS,
  AI_STYLE_LABELS,
  Locale,
  PARTICIPANT_TYPE_LABELS,
  PHASE_LABELS,
  RESOURCE_ICONS,
  RESOURCE_LABELS,
  TRANSLATIONS,
  formatActionDescription,
  DEV_CARD_ICONS,
  DEV_CARD_LABELS,
  DEV_CARD_RULE_TEXT,
  FULL_RULES,
  getScenarioRules,
  SCENARIO_LABELS
} from './i18n';

type ActiveTab = 'lobby' | 'game' | 'replay' | 'benchmark' | 'spectate' | 'sandbox' | 'hall_of_fame';

// Readable text color on top of each player's own board color as a filled badge background -
// 'blue'/'green'/'red'/'brown' are dark enough for white text, 'orange'/'white' need black
// instead (plain colored text on the app's own dark background, used before this, was too low
// contrast to read at a glance - a blue name on navy panels in particular).
const PLAYER_BADGE_TEXT_COLOR: Record<PlayerColor, string> = {
  red: '#ffffff',
  blue: '#ffffff',
  green: '#ffffff',
  brown: '#ffffff',
  orange: '#1a1206',
  white: '#1a1206'
};

// Shared "player name as a filled badge" style - used anywhere a player's name needs to be
// identifiable by board color at a glance (trade banners/modals, rejection lists...) without
// the low-contrast "colored text on a dark panel" problem plain `color: p.color` text had.
function playerBadgeStyle(color?: PlayerColor): React.CSSProperties {
  return color
    ? {
        display: 'inline-block',
        background: color,
        color: PLAYER_BADGE_TEXT_COLOR[color],
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: 999,
        fontSize: '0.92em'
      }
    : { fontWeight: 700 };
}

const NAV_TAB_ICON: Record<ActiveTab, string> = {
  lobby: '⚙️',
  game: '🎲',
  replay: '🎬',
  benchmark: '📈',
  spectate: '👁️',
  sandbox: '🛠️',
  hall_of_fame: '🏆'
};

const NAV_TAB_LABEL = (t: {
  navLobby: string;
  navGame: string;
  navReplay: string;
  navBenchmark: string;
  navHallOfFame: string;
}): Record<ActiveTab, string> => ({
  lobby: t.navLobby,
  game: t.navGame,
  replay: t.navReplay,
  benchmark: t.navBenchmark,
  spectate: 'Spectator',
  sandbox: 'Mediu de Test',
  hall_of_fame: t.navHallOfFame
});

export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.16.') ||
    host.startsWith('172.17.') ||
    host.startsWith('172.18.') ||
    host.startsWith('172.19.') ||
    host.startsWith('172.2') ||
    host.startsWith('172.30.') ||
    host.startsWith('172.31.') ||
    host.endsWith('.local')
  );
}



type BuildSelectionMode = 'none' | 'road' | 'ship' | 'settlement' | 'city' | 'knight' | 'relocate_ship';
type GameModalType =
  | 'none'
  | 'trade'
  | 'counter_trade'
  | 'dev_cards'
  | 'play_monopoly'
  | 'play_year_of_plenty'
  | 'event_log'
  | 'costs_help'
  | 'full_rules'
  | 'score_bank'
  | 'starting_order';

function getExplicitTurnStatusDescription(
  phase: string,
  activePlayerName: string,
  openOffer?: { status: string; fromPlayerId: string } | null,
  locale: Locale = 'ro'
): string {
  if (locale === 'ro') {
    switch (phase) {
      case 'setup_settlement_1':
        return 'așază prima așezare pe tablă';
      case 'setup_road_1':
        return 'așază primul drum pe tablă';
      case 'setup_settlement_2':
        return 'așază a doua așezare (resurse de start)';
      case 'setup_road_2':
        return 'așază al doilea drum pe tablă';
      case 'turn_start':
        return 'urmează să dea cu zarul';
      case 'discard_resources':
        return 'jaf hoț: jucătorii cu >7 cărți trebuie să decarteze';
      case 'move_robber':
        return 'mută hoțul pe un hexagon advers';
      case 'steal_resource':
        return 'fură o resursă de la un adversar adiacent';
      case 'road_building_card':
        return 'plasează 2 drumuri gratuite (carte Progres)';
      case 'special_building':
        return 'faza specială de construcție (5-6 jucători)';
      case 'main_actions':
        if (openOffer && openOffer.status === 'open') {
          return 'negociază o ofertă comercială de schimb';
        }
        return 'faza de construcții, comerț & cărți';
      case 'game_over':
        return 'partidă încheiată';
      default:
        return phase;
    }
  }
  switch (phase) {
    case 'setup_settlement_1':
      return 'placing first settlement';
    case 'setup_road_1':
      return 'placing first road';
    case 'setup_settlement_2':
      return 'placing second settlement (starting resources)';
    case 'setup_road_2':
      return 'placing second road';
    case 'turn_start':
      return 'ready to roll dice';
    case 'discard_resources':
      return 'robber: discard cards (>7)';
    case 'move_robber':
      return 'moving the robber';
    case 'steal_resource':
      return 'stealing a resource';
    case 'road_building_card':
      return 'placing 2 free roads';
    case 'special_building':
      return 'special building phase (5-6 players)';
    case 'main_actions':
      if (openOffer && openOffer.status === 'open') {
        return 'negotiating a trade offer';
      }
      return 'building, trading & dev cards';
    case 'game_over':
      return 'game over';
    default:
      return phase;
  }
}

export const App: React.FC = () => {
  const [locale, setLocale] = useState<Locale>('ro');
  const [activeTab, setActiveTab] = useState<ActiveTab>('lobby');

  // App version badge + release notes — read live from the server's /api/version endpoint
  // (derived from git commit count/log), so it reflects whatever is currently checked out
  // without needing a separate version-bump step.
  const [versionInfo, setVersionInfo] = useState<{
    version: string;
    commitCount: number;
    shortHash: string;
    releaseNotes: { hash: string; date: string; message: string }[];
  } | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState<boolean>(false);

  // True once the live server reports a different build than the JS actually running in
  // this tab — the version BADGE always reflects the server instantly (plain API read), but
  // a tab opened before a new deploy keeps running its old bundle until reloaded, including
  // a browser-cached index.html that never even re-requested it. __BUILD_HASH__ is baked in
  // at build time (see vite.config.ts) specifically so this can be detected without the user
  // having to notice the badge number themselves and guess that a hard refresh would help.
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);

  useEffect(() => {
    const checkVersion = () => {
      fetch('/api/version')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && typeof data.version === 'string' && data.version !== 'v1.0-dev') {
            setVersionInfo(data);
            // Only meaningful for a production build: __BUILD_HASH__ is baked in once when
            // vite starts, and in dev mode (npm run dev:web) that's whatever version.json
            // happened to contain at that moment — not "the code this tab is running", which
            // in dev mode is always current via HMR regardless of this constant. Comparing
            // it against the live-advancing /api/version while developing just produces a
            // permanent false "update available" banner that reloading can't fix (the vite
            // dev server itself would need restarting, not the page).
            if (
              import.meta.env.PROD &&
              typeof data.shortHash === 'string' &&
              __BUILD_HASH__ !== 'dev' &&
              data.shortHash !== __BUILD_HASH__
            ) {
              setUpdateAvailable(true);
            }
          } else {
            fetch('/version.json')
              .then((r) => (r.ok ? r.json() : null))
              .then((staticData) => {
                if (staticData && typeof staticData.version === 'string') {
                  setVersionInfo(staticData);
                } else if (data) {
                  setVersionInfo(data);
                }
              })
              .catch(() => {
                if (data) setVersionInfo(data);
              });
          }
        })
        .catch(() => {
          fetch('/version.json')
            .then((r) => (r.ok ? r.json() : null))
            .then((staticData) => {
              if (staticData && typeof staticData.version === 'string') {
                setVersionInfo(staticData);
              }
            })
            .catch(() => {
              // Pure offline preview without version.json
            });
        });
    };

    checkVersion();
    // Re-check periodically so a tab left open eventually notices a new deploy too, not
    // just the very first load.
    const interval = setInterval(checkVersion, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Browser tab title: version alongside the name, visible on every tab (including Lobby),
  // not just the in-page header badge.
  useEffect(() => {
    document.title = versionInfo ? `Catan v2 · ${versionInfo.version}` : 'Catan v2';
  }, [versionInfo]);

  const t = TRANSLATIONS[locale];

  // Lobby Configuration State
  const [colorPickerIdx, setColorPickerIdx] = useState<number | null>(null);
  const handleSwapColor = (targetIdx: number, newColor: PlayerColor) => {
    const oldColor = participants[targetIdx].color;
    if (oldColor === newColor) return;
    const next = [...participants];
    const otherIdx = next.findIndex((p, i) => i !== targetIdx && p.color === newColor);
    if (otherIdx !== -1) {
      next[otherIdx] = { ...next[otherIdx], color: oldColor };
    }
    next[targetIdx] = { ...next[targetIdx], color: newColor };
    setParticipants(next);
  };

  const [rules, setRules] = useState<GameRulesConfig>(() =>
    loadSavedRules(
      createRulesConfig({
        startingResourcesRule: 'both_settlements',
        knightStealRule: 'all_adjacent',
        devCardsPerTurnRule: 'one_per_type'
      })
    )
  );

  const [participants, setParticipants] = useState<ParticipantConfig[]>(() => {
    const defaultParticipants: ParticipantConfig[] = [
      { id: 'p1', name: loadSavedPlayerName() ?? 'Jucător 1 (Om)', type: 'human', color: 'red' },
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
    ];
    const saved = loadSavedParticipants(defaultParticipants);
    const max = rules.boardScenario === 'expansion' ? 6 : 4;
    return saved.length > max ? saved.slice(0, max) : saved;
  });

  useEffect(() => {
    saveLobbyParticipants(participants);
  }, [participants]);

  useEffect(() => {
    saveLobbyRules(rules);
  }, [rules]);
  const [customSeed, setCustomSeed] = useState<string>('');
  const [serverStatusMsg, setServerStatusMsg] = useState<string | null>(null);

  // Online is the only way to actually play: human seats beyond the host stay "open" on the
  // server lobby until someone joins them with the invite code; gameplay is driven entirely by
  // the server (REST actions + WebSocket push), never a local ReplayRecorder — so a game can
  // never start before every intended human has actually joined from their own device.
  const [onlineLobby, setOnlineLobby] = useState<LobbyState | null>(null);
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(() => loadSavedOnlineSession());

  useEffect(() => {
    saveOnlineSession(onlineSession);
  }, [onlineSession]);
  const [onlinePlayerView, setOnlinePlayerView] = useState<PlayerView | null>(null);
  const [onlineLegalActions, setOnlineLegalActions] = useState<GameAction[]>([]);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineBusy, setOnlineBusy] = useState<boolean>(false);
  const onlineWsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Active Game & Replay Recorder State
  const [recorder, setRecorder] = useState<ReplayRecorder | null>(null);
  const [gameVersionTick, setGameVersionTick] = useState<number>(0);
  const [buildMode, setBuildMode] = useState<BuildSelectionMode>('none');
  const [selectedShipEdgeId, setSelectedShipEdgeId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<GameModalType>('none');
  const [autoPlayAi, setAutoPlayAi] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mobileHudOpen, setMobileHudOpen] = useState<boolean>(false);
  const [mobileDockCollapsed, setMobileDockCollapsed] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [navMenuOpen, setNavMenuOpen] = useState<boolean>(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Keep the screen from locking/dimming mid-game (long dev-card/trade decisions, or just
  // watching bots play, shouldn't get interrupted by the phone going to standby). The Wake
  // Lock API auto-releases when the tab is hidden, so re-acquire it on visibilitychange too;
  // unsupported browsers (no navigator.wakeLock, e.g. older iOS Safari) just no-op.
  useEffect(() => {
    if (activeTab !== 'game') return;
    let sentinel: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const requestLock = async () => {
      try {
        sentinel = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        // Unsupported or denied — the screen will dim normally, nothing else to do.
      }
    };
    requestLock();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) requestLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [activeTab]);

  const [diceRollAnimKey, setDiceRollAnimKey] = useState<string>('init');

  // Per-turn countdown (client-side comfort timer, not a core game rule)
  const [turnTimerEnabled, setTurnTimerEnabled] = useState<boolean>(() => loadSavedTimerConfig()?.enabled ?? false);
  const [turnTimerSec, setTurnTimerSec] = useState<number>(() => loadSavedTimerConfig()?.sec ?? 60);

  useEffect(() => {
    saveLobbyTimer(turnTimerEnabled, turnTimerSec);
  }, [turnTimerEnabled, turnTimerSec]);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number | null>(null);
  const lastTimedTurnKeyRef = useRef<string>('');

  // Stacked, non-blocking log of recent action notifications (dev cards played, builds,
  // bank trades, steals...) - a single replaceable banner used to swallow whatever happened
  // next if two things occurred close together (very common at AI auto-play speed); each
  // entry now has its own lifetime and they stack instead of clobbering each other.
  interface ActionFeedbackItem {
    id: string;
    content: React.ReactNode;
    fading?: boolean;
  }
  const [actionFeedbackQueue, setActionFeedbackQueue] = useState<ActionFeedbackItem[]>([]);

  // Highest game-event sequence already shown as feedback to this client, whether that came
  // from our own just-submitted action's REST response or a WS state_sync push - keeps
  // reportRemoteEventFeedback from re-announcing an event the REST path already handled.
  const lastSeenEventSeqRef = useRef<number>(0);

  // Which resources a player just received, for a brief "+N" flash on their cards
  const [resourceGainFlash, setResourceGainFlash] = useState<
    Record<string, Partial<Record<ResourceType, number>>>
  >({});
  const gainFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trade negotiation banners (see render below): every active/recently-resolved offer, kept
  // visible for a minimum of 5s from when each was first observed even if the underlying offer
  // is cleared from state faster than that (e.g. an AI proposer ending its turn right after an
  // acceptance) - so nobody has to react instantly to see what happened.
  interface TradeBannerEntry {
    offer: TradeOffer;
    firstShownAtMs: number;
  }
  const [visibleTradeOffers, setVisibleTradeOffers] = useState<Record<string, TradeBannerEntry>>({});
  const prevTradeStatusRef = useRef<Record<string, TradeOffer['status']>>({});

  // Resource cards animating from the hex that produced them to the player who received them
  interface FlyingResourceCard {
    key: string;
    resource: ResourceType;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    launched: boolean;
  }
  const [flyingCards, setFlyingCards] = useState<FlyingResourceCard[]>([]);

  // Generic version: flies a resource icon between any two DOM anchors, found by CSS selector.
  // Used for dice production (hex -> player), and for trade-acceptance / robber-steal /
  // discard-to-bank animations (player <-> player, player <-> bank) below.
  const launchFlyingIcon = (
    requests: { resource: ResourceType; fromSelector: string; toSelector: string }[]
  ) => {
    const newCards: FlyingResourceCard[] = [];
    for (const req of requests) {
      const fromEl = document.querySelector(req.fromSelector);
      const toEl = document.querySelector(req.toSelector);
      if (!fromEl || !toEl) continue;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      newCards.push({
        key: `fly-${Date.now()}-${Math.random()}-${req.fromSelector}-${req.toSelector}-${req.resource}`,
        resource: req.resource,
        startX: fromRect.left + fromRect.width / 2,
        startY: fromRect.top + fromRect.height / 2,
        endX: toRect.left + toRect.width / 2,
        endY: toRect.top + toRect.height / 2,
        launched: false
      });
    }
    if (newCards.length === 0) return;
    const keys = new Set(newCards.map((c) => c.key));
    setFlyingCards((prev) => [...prev, ...newCards]);
    // Start each card at its origin, then flip to its destination on the next frame so the
    // left/top CSS transition actually animates the move instead of snapping there.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlyingCards((prev) => prev.map((c) => (keys.has(c.key) ? { ...c, launched: true } : c)));
      });
    });
    setTimeout(() => {
      setFlyingCards((prev) => prev.filter((c) => !keys.has(c.key)));
    }, 950);
  };

  const launchFlyingCards = (
    requests: { playerId: string; resource: ResourceType; hexId: string }[]
  ) => {
    launchFlyingIcon(
      requests.map((req) => ({
        resource: req.resource,
        fromSelector: `[data-hex-id="${req.hexId}"]`,
        toSelector: `[data-player-id="${req.playerId}"][data-resource="${req.resource}"]`
      }))
    );
  };

  // player-card anchor: the whole sidebar row for a player (exists for every player, unlike
  // the per-resource slots above which only render for the viewer's own, visible hand) - used
  // as the fly-to/fly-from target for trade and robber animations between arbitrary players.
  const playerCardSelector = (playerId: string) => `[data-player-card-id="${playerId}"]`;
  const bankAnchorSelector = `[data-bank-anchor="true"]`;

  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [joinPlayerName, setJoinPlayerName] = useState<string>(() => loadSavedPlayerName() ?? 'Jucător 2');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState<boolean>(false);
  const [waitingRoomNewName, setWaitingRoomNewName] = useState<string>('');
  const [isRenamingInWaitingRoom, setIsRenamingInWaitingRoom] = useState<boolean>(false);

  // Public (non-private) lobbies/games browser for the lobby tab — lets a visitor join a game
  // still waiting for players, or watch one already in progress, without needing an invite code.
  const [publicLobbies, setPublicLobbies] = useState<LobbyState[]>([]);
  const [spectateGameId, setSpectateGameId] = useState<string | null>(null);
  const [spectateView, setSpectateView] = useState<PlayerView | null>(null);
  const [spectateError, setSpectateError] = useState<string | null>(null);
  const [spectateTerminationDismissed, setSpectateTerminationDismissed] = useState<boolean>(false);
  const [inGameTermination, setInGameTermination] = useState<{
    expiresAtMs: number;
    remainingSec: number;
    humanPlayerIds: string[];
    confirmedCount: number;
    deniedCount: number;
  } | null>(null);
  const [inGameTerminationCountdown, setInGameTerminationCountdown] = useState<number>(30);
  const [inGameTerminationDismissed, setInGameTerminationDismissed] = useState<boolean>(false);

  useEffect(() => {
    if (!inGameTermination) return;
    const update = () => {
      const sec = Math.max(0, Math.ceil((inGameTermination.expiresAtMs - Date.now()) / 1000));
      setInGameTerminationCountdown(sec);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [inGameTermination]);

  // Auto-restore online game or lobby on startup / page refresh
  useEffect(() => {
    const saved = loadSavedOnlineSession();
    if (!saved) return;
    let cancelled = false;

    if (saved.gameId) {
      fetchGameState(saved.gameId, saved.sessionToken)
        .then((data) => {
          if (cancelled) return;
          setOnlinePlayerView(data.playerView);
          setOnlineLegalActions(data.legalActions as GameAction[]);
          setOnlineLobby(null);
          setActiveTab('game');
        })
        .catch(() => {
          if (cancelled) return;
          setOnlineSession(null);
          saveOnlineSession(null);
        });
    } else if (saved.lobbyId) {
      fetchLobby(saved.lobbyId)
        .then((lobby) => {
          if (cancelled) return;
          if (lobby.status === 'in_progress' && lobby.gameId) {
            enterOnlineGame(lobby.gameId, saved.sessionToken, saved.playerId, lobby.lobbyId);
          } else {
            setOnlineLobby(lobby);
            setActiveTab('lobby');
          }
        })
        .catch(() => {
          if (cancelled) return;
          setOnlineSession(null);
          saveOnlineSession(null);
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh the public lobby list every 5s while it's actually visible (the lobby tab).
  useEffect(() => {
    if (activeTab !== 'lobby') return;
    let cancelled = false;
    const refresh = () => {
      listPublicLobbies()
        .then((lobbies) => { if (!cancelled) setPublicLobbies(lobbies); })
        .catch(() => { /* transient — next poll retries */ });
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeTab]);

  // Poll the spectated game's state every 3s — read-only, so plain REST polling (no WebSocket
  // needed) matches the same resilient fallback pattern used for the player's own online games.
  useEffect(() => {
    if (!spectateGameId) return;
    let cancelled = false;
    const refresh = () => {
      fetchSpectatorGameState(spectateGameId)
        .then((data) => {
          if (!cancelled) {
            setSpectateView(data.playerView);
            if (data.terminationDismissed !== undefined) {
              setSpectateTerminationDismissed(Boolean(data.terminationDismissed));
            }
          }
        })
        .catch((err) => { if (!cancelled) setSpectateError(err instanceof Error ? err.message : String(err)); });
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [spectateGameId]);

  const handleSpectate = (gameId: string) => {
    setSpectateError(null);
    setSpectateView(null);
    setSpectateTerminationDismissed(false);
    setSpectateGameId(gameId);
    setActiveTab('spectate');
  };

  const handleStopSpectating = () => {
    setSpectateGameId(null);
    setSpectateView(null);
    setSpectateError(null);
    setSpectateTerminationDismissed(false);
    setActiveTab('lobby');
    listPublicLobbies().then((lobbies) => setPublicLobbies(lobbies)).catch(() => {});
  };

  const handleRenameWaitingRoomSeat = async (targetSeatIndex: number, newName: string) => {
    if (!onlineSession || !onlineLobby) return;
    const clean = newName.trim();
    if (!clean) return;
    try {
      const res = await fetch(`/api/lobbies/${onlineLobby.lobbyId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: onlineSession.sessionToken, newName: clean })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.lobby) {
          setOnlineLobby(data.lobby);
          setIsRenamingInWaitingRoom(false);
          showActionFeedback(locale === 'ro' ? `Nume actualizat: ${clean}` : `Name updated: ${clean}`);
        }
      }
    } catch (err) {
      console.error('Failed to rename lobby seat:', err);
    }
  };

  const handlePromptRenameInGame = async (currentName: string) => {
    const promptMsg = locale === 'ro' ? 'Introdu noul tău nume de jucător:' : 'Enter your new player name:';
    const entered = window.prompt(promptMsg, currentName);
    if (!entered || !entered.trim() || entered.trim() === currentName) return;
    const clean = entered.trim();

    if (onlineSession?.gameId) {
      try {
        const res = await fetch(`/api/games/${onlineSession.gameId}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: onlineSession.sessionToken, newName: clean })
        });
        if (res.ok) {
          showActionFeedback(locale === 'ro' ? `Numele a fost schimbat în: ${clean}` : `Name changed to: ${clean}`);
          const d = await fetchGameState(onlineSession.gameId, onlineSession.sessionToken); setOnlinePlayerView(d.playerView);
        }
      } catch (err) {
        console.error('Error renaming player in game:', err);
      }
    } else if (recorder) {
      // Local / hotseat game: update player directly in state
      const st = recorder.getState();
      const p = st.players.find((pl) => pl.id === viewerId);
      if (p) {
        p.name = clean;
        setGameVersionTick((v) => v + 1);
        showActionFeedback(locale === 'ro' ? `Numele a fost schimbat în: ${clean}` : `Name changed to: ${clean}`);
      }
    }
  };

  // Automatically detect ?join=XYZ or ?code=XYZ from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join') || params.get('code');
    const name = params.get('name');
    if (code) {
      setJoinCodeInput(code.toUpperCase().trim());
      setActiveTab('lobby');
    }
    if (name) {
      setJoinPlayerName(name.trim());
    }
  }, []);

  const handleShareInvite = async (codeToShare: string) => {
    // "localhost" only resolves to the host's own machine — useless in a link meant for
    // someone else's device. Swap it for this machine's real LAN address (the backend
    // detects it via os.networkInterfaces()) so the invite actually reaches this host from
    // elsewhere on the network.
    let origin = window.location.origin;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      try {
        const res = await fetch('/api/lan-info');
        const data = await res.json();
        const lanIp = data.lanIps?.[0];
        if (lanIp) origin = `${window.location.protocol}//${lanIp}:${window.location.port}`;
      } catch {
        // Backend unreachable — fall back to the (locally-useless, but at least honest) origin.
      }
    }
    const shareUrl = `${origin}/?join=${encodeURIComponent(codeToShare)}`;
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

  // Fetches this player's own game state and switches into live online play, driven from here
  // on by the server (REST submit + WebSocket push) rather than the local ReplayRecorder.
  const enterOnlineGame = async (gameId: string, sessionToken: string, playerId: string, lobbyId: string) => {
    const data = await fetchGameState(gameId, sessionToken);
    setOnlineSession({ lobbyId, gameId, sessionToken, playerId });
    setOnlinePlayerView(data.playerView);
    setOnlineLegalActions(data.legalActions as GameAction[]);
    setOnlineLobby(null);
    setActiveTab('game');
  };

  const handleJoinWithCode = async (codeOverride?: string) => {
    const code = (codeOverride ?? joinCodeInput).trim();
    if (!code) {
      setJoinError('Te rugăm să introduci codul de invitație.');
      return;
    }
    setJoinLoading(true);
    setJoinError(null);
    try {
      const data = await joinOnlineLobbyByCode(code, joinPlayerName.trim() || 'Jucător 2');
      setCreatedInviteCode(code);
      setServerStatusMsg(`Te-ai alăturat cu succes ca ${data.playerId}!`);
      if (data.gameId) {
        await enterOnlineGame(data.gameId, data.sessionToken, data.playerId, data.lobby.lobbyId);
      } else {
        // Game hasn't started yet — show the waiting room until the host starts it.
        setOnlineSession({ lobbyId: data.lobby.lobbyId, gameId: null, sessionToken: data.sessionToken, playerId: data.playerId });
        setOnlineLobby(data.lobby);
        setActiveTab('lobby');
      }
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Nu s-a putut contacta serverul. Verifică dacă este pornit.');
    } finally {
      setJoinLoading(false);
    }
  };

  // Host creates a real server-backed lobby: own seat (0) stays human, any OTHER configured
  // "human" seat becomes an open slot for someone to claim with the invite code (online play
  // is one person per device, unlike local hot-seat where every human seat is this browser).
  const handleCreateOnlineLobby = async () => {
    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const hasHumans = participants.some((p) => p.type === 'human');
      const firstHumanIdx = participants.findIndex((p) => p.type === 'human');
      const hostName = (hasHumans ? participants[firstHumanIdx]?.name : participants[0]?.name)?.trim() || 'Spectator';
      const seats = participants.map((p, idx) => {
        if (!hasHumans) {
          return {
            seatIndex: idx,
            name: p.name,
            type: p.type,
            color: p.color,
            aiDifficulty: p.aiDifficulty,
            aiStyle: p.aiStyle
          };
        }
        const isHostSeat = idx === firstHumanIdx;
        return {
          seatIndex: idx,
          name: isHostSeat ? hostName : p.name,
          type: isHostSeat ? 'human' : (p.type === 'human' ? 'open' : p.type),
          color: p.color,
          aiDifficulty: p.aiDifficulty,
          aiStyle: p.aiStyle
        };
      });
      const data = await createOnlineLobby({
        hostName,
        seats,
        rules,
        seed: customSeed.trim() || undefined
      });
      setOnlineLobby(data.lobby);
      setOnlineSession({ lobbyId: data.lobby.lobbyId, gameId: null, sessionToken: data.sessionToken, playerId: data.playerId });
      setCreatedInviteCode(data.inviteCode);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Nu s-a putut crea lobby-ul online.');
    } finally {
      setOnlineBusy(false);
    }
  };

  // Host-only: starts the game once every "human" seat has been claimed (the Start button
  // itself is disabled while any seat is still 'open' — see the waiting-room UI).
  const handleStartOnlineLobby = async () => {
    if (!onlineSession) return;
    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const data = await startOnlineLobby(onlineSession.lobbyId);
      await enterOnlineGame(data.gameId, onlineSession.sessionToken, onlineSession.playerId, onlineSession.lobbyId);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Nu s-a putut porni partida.');
    } finally {
      setOnlineBusy(false);
    }
  };

  // Poll the lobby roster while in the waiting room (no server-push for lobby updates yet),
  // and auto-enter the game the moment ANY client — including another guest, or the host from
  // their own device — starts it.
  useEffect(() => {
    if (!onlineSession || onlineSession.gameId || !onlineLobby) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const lobby = await fetchLobby(onlineSession.lobbyId);
        if (cancelled) return;
        setOnlineLobby(lobby);
        if (lobby.gameId) {
          await enterOnlineGame(lobby.gameId, onlineSession.sessionToken, onlineSession.playerId, onlineSession.lobbyId);
        }
      } catch {
        // Transient network hiccup — keep polling.
      }
    };
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onlineSession?.lobbyId, onlineSession?.gameId, Boolean(onlineLobby)]);

  // Live game sync over WebSocket — authenticates with this player's session, then applies
  // every state_sync push (caused by ANY player's action, including bots the server stepped
  // through automatically) so opponents' moves show up here without polling.
  useEffect(() => {
    if (!onlineSession?.gameId) {
      setWsConnected(false);
      return;
    }
    const gameId = onlineSession.gameId;
    const sessionToken = onlineSession.sessionToken;
    // -1 = "not yet baselined": the first state_sync of a session can carry up to 25 events that
    // already happened before we connected (or reconnected) - those get silently absorbed into
    // the baseline instead of narrated, so joining/reloading mid-game doesn't replay old steals.
    lastSeenEventSeqRef.current = -1;
    let isDisposed = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let currentWs: WebSocket | null = null;
    let failCount = 0;

    const connect = () => {
      if (isDisposed) return;
      try {
        const ws = new WebSocket(wsUrlForGame());
        currentWs = ws;
        onlineWsRef.current = ws;

        ws.onopen = () => {
          failCount = 0;
          if (isDisposed) {
            ws.close();
            return;
          }
          setWsConnected(true);
          ws.send(JSON.stringify({ type: 'authenticate', gameId, sessionToken }));
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data as string);
            if (msg.type === 'state_sync') {
              setOnlinePlayerView(msg.playerView);
              setOnlineLegalActions(msg.legalActions);

              const incomingEvents = (msg.recentEvents ?? []) as Array<{ sequence: number; playerId: string; action: GameAction; details: Record<string, unknown> }>;
              if (lastSeenEventSeqRef.current === -1) {
                // First sync of this connection: adopt its latest sequence as the baseline
                // without narrating anything older than "now".
                lastSeenEventSeqRef.current = incomingEvents.reduce((max, e) => Math.max(max, e.sequence), 0);
              } else {
                // Narrate any steal/discard event we haven't already shown feedback for -
                // covers every OTHER player's move (including bot turns the server stepped
                // through on its own), which previously updated state here silently with no
                // banner or animation at all for anyone but the player who acted.
                const newEvents = incomingEvents
                  .filter((e) => e.sequence > lastSeenEventSeqRef.current)
                  .sort((a, b) => a.sequence - b.sequence);
                if (newEvents.length > 0) {
                  // The server steps a bot's whole turn before broadcasting once, so several
                  // events can land in a single state_sync - firing all their banners in the
                  // same tick would just overwrite each other, showing only the last one.
                  // Stagger them instead (capped, so a very long bot turn doesn't queue up a
                  // banner marathon) so each is actually readable.
                  const players = (msg.playerView?.players ?? []) as { id: string; name: string; color: PlayerColor }[];
                  const toNarrate = newEvents.slice(-6);
                  toNarrate.forEach((event, i) => {
                    setTimeout(() => reportRemoteEventFeedback(event, players), i * 1100);
                  });
                  lastSeenEventSeqRef.current = newEvents[newEvents.length - 1]!.sequence;
                }
              }

              if (msg.pendingTermination) {
                setInGameTermination(msg.pendingTermination);
              } else {
                setInGameTermination(null);
              }
              if (msg.terminationDismissed !== undefined) {
                setInGameTerminationDismissed(Boolean(msg.terminationDismissed));
              }
            } else if (msg.type === 'action_rejected') {
              setOnlineError(msg.reason ?? 'Mutare respinsă de server.');
            }
          } catch {
            // Ignore malformed packets.
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (onlineWsRef.current === ws) {
            onlineWsRef.current = null;
          }
          if (!isDisposed) {
            failCount++;
            // Backoff if reverse proxy does not support WebSocket upgrades
            const delay = Math.min(30000, 2000 * Math.pow(1.5, Math.min(failCount, 6)));
            reconnectTimeout = setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      isDisposed = true;
      setWsConnected(false);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (currentWs) currentWs.close();
      if (onlineWsRef.current === currentWs) onlineWsRef.current = null;
    };
  }, [onlineSession?.gameId, onlineSession?.sessionToken]);

  // REST polling fallback for live sync — some hosts (shared cPanel especially) front the app
  // with a reverse proxy that doesn't forward WebSocket upgrade requests, silently leaving the
  // socket above disconnected with no retry. This guarantees opponents' moves still show up
  // everywhere, just on a ~3s cadence instead of instantly; harmless where WS does work too,
  // since a stale response (compared by sequence number) is just discarded.
  useEffect(() => {
    if (!onlineSession?.gameId) return;
    const gameId = onlineSession.gameId;
    const sessionToken = onlineSession.sessionToken;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchGameState(gameId, sessionToken);
        if (cancelled) return;
        setOnlinePlayerView((prev) => (prev && prev.sequence >= data.playerView.sequence ? prev : data.playerView));
        setOnlineLegalActions(data.legalActions);
        if (data.pendingTermination) {
          setInGameTermination(data.pendingTermination);
        } else {
          setInGameTermination(null);
        }
        if (data.terminationDismissed !== undefined) {
          setInGameTerminationDismissed(Boolean(data.terminationDismissed));
        }
      } catch {
        // Transient network hiccup — the next tick will retry.
      }
    };
    const isAllAi = Boolean(onlinePlayerView?.players && onlinePlayerView.players.every((p) => p.type !== 'human'));
    const interval = setInterval(poll, isAllAi ? 1200 : 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onlineSession?.gameId, onlineSession?.sessionToken]);

  const lastSavedGameIdRef = useRef<string | null>(null);

  // Dev card & trade sub-modals state
  const [yopResources, setYopResources] = useState<[ResourceType, ResourceType]>(['wheat', 'ore']);
  const [monopolyResource, setMonopolyResource] = useState<ResourceType>('wheat');
  const [bankGiveRes, setBankGiveRes] = useState<ResourceType>('wood');
  const [bankReceiveRes, setBankReceiveRes] = useState<ResourceType>('ore');
  const [p2pOffer, setP2pOffer] = useState<ResourceCount>(createEmptyResources());
  // Which incoming offer the counter_trade modal (reuses p2pOffer/p2pRequest below) is
  // answering - a responder proposing their own terms isn't the active player, so this can't
  // reuse the main trade modal's "propose_trade as activePlayerObj" flow.
  const [counterOfferOriginalId, setCounterOfferOriginalId] = useState<string | null>(null);
  const [dismissedTradeOfferIds, setDismissedTradeOfferIds] = useState<Set<string>>(new Set());

  const [minimizedDiscard, setMinimizedDiscard] = useState<boolean>(false);
  const [rejectDropdownOfferId, setRejectDropdownOfferId] = useState<string | null>(null);

  useEffect(() => {
    if (!rejectDropdownOfferId) return;
    const handleClickOutside = () => setRejectDropdownOfferId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [rejectDropdownOfferId]);

  const dismissTradeOffer = (offerId: string, reason = 'Refuz') => {
    setRejectDropdownOfferId(null);
    if (dismissedTradeOfferIds.has(offerId)) return;
    setDismissedTradeOfferIds((prev) => new Set(prev).add(offerId));

    // Guard: only execute respond_trade if the offer actually exists and is still open!
    const curOffer = gameState?.activeTradeOffers?.find((o) => o.id === offerId);
    if (!curOffer || curOffer.status !== 'open') {
      return;
    }

    executeAction(viewerId, {
      type: 'respond_trade',
      offerId,
      response: 'reject',
      reason
    });
    showActionFeedback(locale === 'ro' ? `Refuz trimis: "${reason}"` : `Decline sent: "${reason}"`);
  };

  const cancelMyTradeOffer = (offerId: string) => {
    setDismissedTradeOfferIds((prev) => new Set(prev).add(offerId));
    executeAction(viewerId, {
      type: 'cancel_trade',
      offerId
    });
  };
  const [p2pRequest, setP2pRequest] = useState<ResourceCount>(createEmptyResources());
  const [discardSelection, setDiscardSelection] = useState<ResourceCount>(createEmptyResources());

  // Replay Viewer State
  const [activeReplay, setActiveReplay] = useState<ReplayFile | null>(null);
  const openGameReplay = async (targetGameId?: string) => {
    if (recorder) {
      const rep = recorder.toReplayFile();
      saveReplayToHistory(rep, true);
      setActiveReplay(rep);
      setActiveTab('replay');
      return;
    }
    const gId = targetGameId ?? onlineSession?.gameId;
    if (gId) {
      try {
        const res = await fetch(`/api/games/${gId}/replay`);
        if (res.ok) {
          const data = await res.json();
          if (data.replay) {
            saveReplayToHistory(data.replay, true);
            setActiveReplay(data.replay);
            setActiveTab('replay');
            return;
          }
        }
      } catch (err) {
        console.error('Eroare la încărcarea replay-ului:', err);
      }
    }
    setActiveTab('replay');
  };


  // Benchmark Simulator State
  const [benchmarkGamesCount, setBenchmarkGamesCount] = useState<number>(8);
  const [benchmarkReport, setBenchmarkReport] = useState<BenchmarkReport | null>(null);

  // Online games are never driven by the local ReplayRecorder — their GameState-shaped view is
  // adapted from the server's redacted PlayerView (see playerViewToGameState in online.ts), so
  // the rest of this component's rendering code works unchanged for both modes.
  const gameState: GameState | null = onlineSession
    ? onlinePlayerView
      ? playerViewToGameState(onlinePlayerView)
      : null
    : recorder
      ? recorder.getState()
      : null;

  // Automatically save finished games for later analysis (local hot-seat games only — online
  // games are already persisted server-side).
  useEffect(() => {
    if (onlineSession || !recorder || !gameState) return;
    if (gameState.phase === 'game_over' && gameState.winnerId) {
      if (lastSavedGameIdRef.current !== gameState.gameId) {
        lastSavedGameIdRef.current = gameState.gameId;
        const replayFile = recorder.toReplayFile();
        saveReplayToHistory(replayFile, true);
        setActiveReplay(replayFile);
      }
    }
  }, [recorder, gameState?.phase, gameState?.winnerId, gameVersionTick]);

  // Determine the current human viewer (or active player if spectating 4 AIs). Online: always
  // fixed to the local player's own seat — unlike local hot-seat, where every human seat is
  // played from this one device, an online player only ever sees/acts as themselves.
  const viewerId = useMemo(() => {
    if (onlineSession) return onlineSession.playerId;
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
  }, [gameState, gameVersionTick, onlineSession]);

  // Online: use the server's own redacted PlayerView directly rather than re-deriving one from
  // the already-adapted gameState (which would double-redact — opponents' resources were
  // already zero-filled by the adapter, so re-running getPlayerView on it would show a fake
  // resourceCount of 0 instead of the real count the server gave us).
  const playerView = useMemo(() => {
    if (onlineSession) return onlinePlayerView;
    if (!gameState) return null;
    return getPlayerView(gameState, viewerId);
  }, [gameState, viewerId, gameVersionTick, onlineSession, onlinePlayerView]);

  const legalActionsForActive = useMemo(() => {
    if (onlineSession) return onlineLegalActions;
    if (!gameState) return [];
    let actorId = gameState.activePlayerId;
    if (gameState.phase === 'discard_resources') {
      actorId = Object.keys(gameState.pendingDiscards)[0] ?? actorId;
    }
    return getLegalActions(gameState, actorId);
  }, [gameState, gameVersionTick, onlineSession, onlineLegalActions]);

  // Pushes one more notification onto the stack (see actionFeedbackQueue above) instead of
  // replacing whatever is currently shown - capped so a long burst of bot actions doesn't
  // pile up indefinitely, and each entry fades itself out independently after its own 3.6s.
  const showActionFeedback = (content: React.ReactNode) => {
    const id = `fb-${Date.now()}-${Math.random()}`;
    setActionFeedbackQueue((prev) => {
      const next = [...prev, { id, content }];
      return next.length > 5 ? next.slice(next.length - 5) : next;
    });
    setTimeout(() => {
      setActionFeedbackQueue((prev) => prev.map((f) => (f.id === id ? { ...f, fading: true } : f)));
    }, 3600);
    setTimeout(() => {
      setActionFeedbackQueue((prev) => prev.filter((f) => f.id !== id));
    }, 3900);
  };

  // Robber steals and mass discards only ever exist as a momentary event, not persistent state
  // like a trade offer - so, unlike the trade banner above, telling anyone but the acting player
  // about one means reading it out of the event log. Called for every event the WS stream hands
  // us that we haven't already shown feedback for (see lastSeenEventSeqRef below), regardless of
  // who caused it, so an observer sees "X stole from Y" / "Z discarded N cards" too, not just X.
  const reportRemoteEventFeedback = (
    event: { playerId: string; action: GameAction; details: Record<string, unknown> },
    players: { id: string; name: string; color: PlayerColor }[]
  ) => {
    // Colored badge (see playerBadgeStyle) instead of plain text, same treatment as the trade
    // negotiation banner's player names - plain text on these dark panels was hard to tell
    // apart at a glance, especially for the darker colors.
    const nameBadge = (id: string) => {
      const p = players.find((pp) => pp.id === id);
      return <span style={playerBadgeStyle(p?.color)}>{p?.name ?? id}</span>;
    };
    if (
      event.action.type === 'steal_from_player' ||
      event.action.type === 'move_robber' ||
      event.action.type === 'play_knight'
    ) {
      const stolenResource = event.details?.stolenResource as ResourceType | undefined;
      const stolenFrom = (event.details?.stolenFrom ?? (event.action.type === 'steal_from_player' ? event.action.targetPlayerId : undefined)) as string | undefined;
      if (!stolenResource || !stolenFrom) return;
      showActionFeedback(
        <>
          🥷 {nameBadge(event.playerId)} {locale === 'ro' ? 'a furat' : 'stole'} 1 {RESOURCE_ICONS[stolenResource]}{' '}
          {RESOURCE_LABELS[locale][stolenResource]} {locale === 'ro' ? 'de la' : 'from'} {nameBadge(stolenFrom)}!
        </>
      );
      requestAnimationFrame(() =>
        launchFlyingIcon([
          { resource: stolenResource, fromSelector: playerCardSelector(stolenFrom), toSelector: playerCardSelector(event.playerId) }
        ])
      );
    } else if (event.action.type === 'discard_cards') {
      const discarded = (event.details?.discarded ?? {}) as Partial<ResourceCount>;
      const total = ALL_RESOURCES.reduce((sum, r) => sum + (discarded[r] ?? 0), 0);
      if (total <= 0) return;
      showActionFeedback(
        <>
          🗑️ {nameBadge(event.playerId)} {locale === 'ro' ? `a aruncat ${total} cărți:` : `discarded ${total} cards:`}{' '}
          {ALL_RESOURCES.filter((r) => (discarded[r] ?? 0) > 0)
            .map((r) => `${RESOURCE_ICONS[r]}${discarded[r]}`)
            .join(' ')}
        </>
      );
      requestAnimationFrame(() =>
        launchFlyingIcon(
          ALL_RESOURCES.filter((r) => (discarded[r] ?? 0) > 0).map((r) => ({
            resource: r,
            fromSelector: playerCardSelector(event.playerId),
            toSelector: bankAnchorSelector
          }))
        )
      );
    } else if (
      event.action.type === 'build_road' ||
      event.action.type === 'build_settlement' ||
      event.action.type === 'build_city' ||
      event.action.type === 'build_ship'
    ) {
      // Building actions had no feedback at all before this - at full AI auto-play speed
      // (steps every few hundred ms) an opponent's new settlement/city/road was easy to miss
      // entirely with nothing marking that it just happened.
      const cost =
        event.action.type === 'build_road' || event.action.type === 'build_ship'
          ? BUILDING_COSTS[event.action.type === 'build_ship' ? 'ship' : 'road']
          : event.action.type === 'build_settlement'
          ? BUILDING_COSTS.settlement
          : BUILDING_COSTS.city;
      const icon = event.action.type === 'build_settlement' ? '🏠' : event.action.type === 'build_city' ? '🏰' : event.action.type === 'build_ship' ? '⛵' : '🛤️';
      const nameRo =
        event.action.type === 'build_settlement'
          ? 'o așezare'
          : event.action.type === 'build_city'
          ? 'oraș'
          : event.action.type === 'build_ship'
          ? 'o corabie'
          : 'un drum';
      const nameEn =
        event.action.type === 'build_settlement'
          ? 'a settlement'
          : event.action.type === 'build_city'
          ? 'a city'
          : event.action.type === 'build_ship'
          ? 'a ship'
          : 'a road';
      const costText = ALL_RESOURCES.filter((r) => cost[r] > 0)
        .map((r) => `${RESOURCE_ICONS[r]}${cost[r]}`)
        .join(' ');
      showActionFeedback(
        <>
          {icon} {nameBadge(event.playerId)} {locale === 'ro' ? `a construit ${nameRo}` : `built ${nameEn}`} ({costText})
        </>
      );
      requestAnimationFrame(() =>
        launchFlyingIcon(
          ALL_RESOURCES.filter((r) => cost[r] > 0).map((r) => ({
            resource: r,
            fromSelector: playerCardSelector(event.playerId),
            toSelector: bankAnchorSelector
          }))
        )
      );
    } else if (event.action.type === 'roll_dice') {
      const roll = event.details?.dice as { die1: number; die2: number; total: number } | undefined;
      if (!roll) return;
      showActionFeedback(
        <>
          🎲 {nameBadge(event.playerId)}: {roll.die1} + {roll.die2} = {roll.total}
        </>
      );
    } else if (event.action.type === 'trade_bank') {
      // The user explicitly asked to also see bank/port trades, not just player-to-player ones.
      showActionFeedback(
        <>
          ⚓ {nameBadge(event.playerId)}{' '}
          {locale === 'ro' ? 'a schimbat cu banca' : 'traded with the bank'}: {event.action.giveAmount}
          {RESOURCE_ICONS[event.action.give]} → 1{RESOURCE_ICONS[event.action.receive]}
        </>
      );
      requestAnimationFrame(() =>
        launchFlyingIcon([
          { resource: event.action.type === 'trade_bank' ? event.action.give : 'wood', fromSelector: playerCardSelector(event.playerId), toSelector: bankAnchorSelector },
          { resource: event.action.type === 'trade_bank' ? event.action.receive : 'wood', fromSelector: bankAnchorSelector, toSelector: playerCardSelector(event.playerId) }
        ])
      );
    } else if (event.action.type === 'respond_trade') {
      if (event.action.response === 'accept') {
        showActionFeedback(
          <>
            🤝 {nameBadge(event.playerId)} {locale === 'ro' ? 'a acceptat un schimb!' : 'accepted a trade!'}
          </>
        );
      } else {
        const reasonText = event.action.reason ? `: "${event.action.reason}"` : '';
        showActionFeedback(
          <>
            ❌ {nameBadge(event.playerId)} {locale === 'ro' ? 'a refuzat un schimb' : 'declined a trade'}
            {reasonText}
          </>
        );
      }
    } else if (event.action.type === 'buy_dev_card') {
      // Deliberately doesn't reveal which card type - that stays hidden from everyone but the
      // buyer until it's played (or it's game over), same as the physical game.
      showActionFeedback(
        <>
          🃏 {nameBadge(event.playerId)} {locale === 'ro' ? 'a cumpărat o carte de dezvoltare' : 'bought a development card'}
        </>
      );
    } else if (event.action.type === 'play_monopoly') {
      const totalTaken = Number(event.details?.totalTaken ?? 0);
      showActionFeedback(
        <>
          👑 {nameBadge(event.playerId)} {locale === 'ro' ? 'a declarat Monopol pe' : 'declared Monopoly on'}{' '}
          {RESOURCE_ICONS[event.action.resource]} {RESOURCE_LABELS[locale][event.action.resource]} ({totalTaken}{' '}
          {locale === 'ro' ? 'cărți confiscate' : 'cards taken'})
        </>
      );
    } else if (event.action.type === 'play_year_of_plenty') {
      const r1 = event.action.resources[0];
      const r2 = event.action.resources[1];
      showActionFeedback(
        <>
          🎁 {nameBadge(event.playerId)} {locale === 'ro' ? 'a jucat Anul Abundenței' : 'played Year of Plenty'} (+1{' '}
          {RESOURCE_ICONS[r1]}, +1 {RESOURCE_ICONS[r2]})
        </>
      );
    } else if (event.action.type === 'play_road_building') {
      showActionFeedback(
        <>
          🛣️ {nameBadge(event.playerId)} {locale === 'ro' ? 'a jucat Progres: 2 Drumuri Gratuite' : 'played Road Building: 2 free roads'}
        </>
      );
    }
  };

  // Applies a server sync payload (from either the REST action response or a WebSocket
  // state_sync push) to local state, and — only when it's the result of OUR OWN just-submitted
  // action (action/actingPlayerId/prevView given) — triggers the same action-feedback banner,
  // resource-gain flash and flying-card animation the local hot-seat path has. A push caused by
  // another player's move updates state silently; we don't know enough about their hand to
  // animate it honestly anyway.
  const applyOnlineSync = (
    data: {
      playerView: PlayerView;
      legalActions: GameAction[];
      recentEvents?: { sequence?: number; playerId?: string; action: GameAction; details: Record<string, unknown> }[];
    },
    action?: GameAction,
    actingPlayerId?: string,
    prevView?: PlayerView | null
  ) => {
    const newView = data.playerView;
    setOnlinePlayerView(newView);
    setOnlineLegalActions(data.legalActions);

    // Our own action's effects (and anything the server stepped for us, like bot turns) are
    // about to be narrated below via the action/actingPlayerId branch - mark every event up to
    // the latest one here as already-seen so the WS push that echoes them back doesn't also
    // run them through reportRemoteEventFeedback and double up the banner/animation.
    const latestSeq = data.recentEvents?.reduce((max, e) => Math.max(max, e.sequence ?? 0), 0) ?? 0;
    if (latestSeq > lastSeenEventSeqRef.current) lastSeenEventSeqRef.current = latestSeq;

    const myId = onlineSession?.playerId;

    if (action && actingPlayerId) {
      if (action.type === 'roll_dice') {
        setDiceRollAnimKey(`roll-${Date.now()}-${Math.random()}`);
        if (newView.lastDiceRoll) {
          showActionFeedback(
            `🎲 ${newView.lastDiceRoll.die1} + ${newView.lastDiceRoll.die2} = ${newView.lastDiceRoll.total}`
          );
        }
      } else if (action.type === 'respond_trade') {
        const actingP = newView.players.find((p) => p.id === actingPlayerId);
        if (action.response === 'reject') {
          const reasonText = action.reason ? `: "${action.reason}"` : '';
          showActionFeedback(
            locale === 'ro'
              ? `❌ ${actingP?.name ?? actingPlayerId} a refuzat schimbul${reasonText}`
              : `❌ ${actingP?.name ?? actingPlayerId} declined trade${reasonText}`
          );
        } else {
          showActionFeedback(
            locale === 'ro'
              ? `🤝 ${actingP?.name ?? actingPlayerId} a acceptat schimbul!`
              : `🤝 ${actingP?.name ?? actingPlayerId} accepted trade!`
          );
        }
      } else if (action.type === 'end_turn') {
        showActionFeedback('⏭️ Tură încheiată');
      } else if (action.type === 'steal_from_player' || action.type === 'move_robber') {
        const lastEvent = data.recentEvents?.[data.recentEvents.length - 1];
        const stolenResource = lastEvent?.details?.stolenResource as ResourceType | undefined;
        const stolenFrom = (lastEvent?.details?.stolenFrom ?? (action.type === 'steal_from_player' ? action.targetPlayerId : undefined)) as string | undefined;
        const thief = newView.players.find((p) => p.id === actingPlayerId);
        const victim = stolenFrom ? newView.players.find((p) => p.id === stolenFrom) : undefined;
        if (stolenResource && victim) {
          const resText = `${RESOURCE_ICONS[stolenResource]} ${RESOURCE_LABELS[locale][stolenResource]}`;
          if (actingPlayerId === myId) {
            const isSingleHexTarget = action.type === 'move_robber';
            showActionFeedback(
              locale === 'ro'
                ? (isSingleHexTarget
                    ? `🥷 Ai furat automat 1 ${resText} de la ${victim.name} (singurul adversar cu resurse de pe hexagon)!`
                    : `🥷 Ai furat 1 ${resText} de la ${victim.name}!`)
                : `🥷 You stole 1 ${resText} from ${victim.name}!`
            );
          } else if (stolenFrom === myId) {
            showActionFeedback(
              locale === 'ro'
                ? `🥷 ${thief?.name ?? actingPlayerId} ți-a furat 1 ${resText}!`
                : `🥷 ${thief?.name ?? actingPlayerId} stole 1 ${resText} from you!`
            );
          } else {
            showActionFeedback(
              locale === 'ro'
                ? `🥷 ${thief?.name ?? actingPlayerId} a furat 1 ${resText} de la ${victim.name}!`
                : `🥷 ${thief?.name ?? actingPlayerId} stole 1 ${resText} from ${victim.name}!`
            );
          }
        } else if (action.type === 'move_robber' && actingPlayerId === myId) {
          showActionFeedback(
            locale === 'ro'
              ? '🥷 Hoțul a fost mutat. Niciun adversar de pe hexagon nu are resurse de furat.'
              : '🥷 Robber moved. No adjacent opponents have resource cards.'
          );
        }
      } else if (action.type === 'play_monopoly') {
        const lastEv = data.recentEvents?.[data.recentEvents.length - 1];
        const res = action.resource;
        const resText = `${RESOURCE_ICONS[res]} ${RESOURCE_LABELS[locale][res]}`;
        const totalTaken = Number(lastEv?.details?.totalTaken ?? 0);
        const takenByPlayer = (lastEv?.details?.takenByPlayer ?? {}) as Record<string, number>;
        const actingPlayer = newView.players.find((p) => p.id === actingPlayerId);

        if (actingPlayerId === myId) {
          if (totalTaken > 0) {
            const breakdown = Object.entries(takenByPlayer)
              .map(([vId, amt]) => `${amt} de la ${newView.players.find((p) => p.id === vId)?.name ?? vId}`)
              .join(', ');
            showActionFeedback(`👑 MONOPOL! Ai confiscat ${totalTaken}x ${resText} de la adversari (${breakdown})!`);
          } else {
            showActionFeedback(`👑 MONOPOL pe ${resText}: Niciun adversar nu avea această resursă în mână (0 cărți colectate).`);
          }
        } else {
          const myLoss = takenByPlayer[myId ?? ''] ?? 0;
          if (myLoss > 0) {
            showActionFeedback(`👑 ${actingPlayer?.name ?? actingPlayerId} a declarat Monopol pe ${resText} și ți-a confiscat ${myLoss} cărți!`);
          } else {
            showActionFeedback(`👑 ${actingPlayer?.name ?? actingPlayerId} a declarat Monopol pe ${resText} (${totalTaken} cărți colectate).`);
          }
        }
      } else if (action.type === 'play_year_of_plenty') {
        const r1 = action.resources[0];
        const r2 = action.resources[1];
        const actingPlayer = newView.players.find((p) => p.id === actingPlayerId);
        showActionFeedback(`🎁 ${actingPlayer?.name ?? actingPlayerId} a jucat Anul Abundenței (+1 ${RESOURCE_ICONS[r1]} ${RESOURCE_LABELS[locale][r1]}, +1 ${RESOURCE_ICONS[r2]} ${RESOURCE_LABELS[locale][r2]})`);
      } else if (action.type === 'buy_dev_card') {
        const lastEv = data.recentEvents?.[data.recentEvents.length - 1];
        const drawnType = lastEv?.details?.drawnType as DevCardType | undefined;
        const buyer = newView.players.find((p) => p.id === actingPlayerId);
        const buyerName = buyer?.name ?? actingPlayerId;
        if (drawnType) {
          const cardName = DEV_CARD_LABELS[locale]?.[drawnType] ?? drawnType;
          const icon = DEV_CARD_ICONS[drawnType] ?? '🃏';
          if (actingPlayerId === myId) {
            showActionFeedback(`🃏 Ai cumpărat o carte de dezvoltare: ${icon} ${cardName}!`);
          } else {
            if (drawnType === 'victory_point' && newView.phase === 'game_over') {
              showActionFeedback(`🏆 ${buyerName} a cumpărat: ${icon} ${cardName} și a atins scorul de victorie!`);
            } else {
              showActionFeedback(`🃏 ${buyerName} a cumpărat o carte de dezvoltare.`);
            }
          }
        }
      }
    }

    if (prevView && myId) {
      const prevMine = prevView.players.find((p) => p.id === myId)?.resources;
      const newMine = newView.players.find((p) => p.id === myId)?.resources;
      if (prevMine && newMine) {
        const gains: Partial<Record<ResourceType, number>> = {};
        for (const r of ALL_RESOURCES) {
          const delta = newMine[r] - prevMine[r];
          if (delta > 0) gains[r] = delta;
        }
        if (Object.keys(gains).length > 0) {
          setResourceGainFlash({ [myId]: gains });
          if (gainFlashTimeoutRef.current) clearTimeout(gainFlashTimeoutRef.current);
          gainFlashTimeoutRef.current = setTimeout(() => setResourceGainFlash({}), 1800);

          if (newView.lastDiceRoll && newView.lastDiceRoll.total !== 7) {
            const total = newView.lastDiceRoll.total;
            const hexByResource: Partial<Record<ResourceType, string>> = {};
            for (const hex of Object.values(newView.board.hexes)) {
              if (hex.numberToken !== total || hex.id === newView.board.robberHexId) continue;
              const res = TERRAIN_TO_RESOURCE[hex.terrain];
              if (res && !hexByResource[res]) hexByResource[res] = hex.id;
            }
            const requests: { playerId: string; resource: ResourceType; hexId: string }[] = [];
            for (const r of ALL_RESOURCES) {
              const hexId = hexByResource[r];
              if (hexId && (gains[r] ?? 0) > 0) {
                requests.push({ playerId: myId, resource: r, hexId });
              }
            }
            if (requests.length > 0) {
              requestAnimationFrame(() => launchFlyingCards(requests));
            }
          }
        }
      }
    }

    setBuildMode('none');
    setDiscardSelection(createEmptyResources());
  };

  const executeOnlineAction = async (playerId: string, action: GameAction) => {
    if (!onlineSession?.gameId) return;
    setActionError(null);
    const prevView = onlinePlayerView;
    try {
      const data = await submitOnlineAction({
        gameId: onlineSession.gameId,
        sessionToken: onlineSession.sessionToken,
        playerId,
        expectedSequence: prevView?.sequence,
        action
      });
      applyOnlineSync(data, action, playerId, prevView);
    } catch (err: any) {
      if (err?.statusCode === 409 && err?.data?.playerView) {
        applyOnlineSync(err.data as GameSyncPayload, action, playerId, prevView);
        if (action.type === 'respond_trade' || action.type === 'cancel_trade') {
          try {
            const nextSeq = err.data.currentSequence ?? err.data.playerView?.sequence;
            const retryData = await submitOnlineAction({
              gameId: onlineSession.gameId,
              sessionToken: onlineSession.sessionToken,
              playerId,
              expectedSequence: nextSeq,
              action
            });
            applyOnlineSync(retryData, action, playerId, err.data.playerView);
            return;
          } catch {
            // ignore retry failure
          }
        }
        setActionError('Starea partidei a fost resincronizată automat cu serverul.');
      } else {
        // If an offer rejection/cancellation failed with 400 because the offer is already closed,
        // silently refresh the online game state so the client seamlessly catches up with the server.
        if (action.type === 'respond_trade' || action.type === 'cancel_trade') {
          try {
            const fresh = await fetchGameState(onlineSession.gameId, onlineSession.sessionToken);
            setOnlinePlayerView(fresh.playerView);
            setOnlineLegalActions(fresh.legalActions);
            return;
          } catch {
            // ignore
          }
        }
        setActionError(err instanceof Error ? err.message : 'Mutare invalidă.');
      }
    }
  };

  const executeAction = (playerId: string, action: GameAction) => {
    if (onlineSession) {
      void executeOnlineAction(playerId, action);
      return;
    }
    if (!recorder) return;
    try {
      setActionError(null);
      const prevResourcesByPlayer = new Map(
        recorder.getState().players.map((p) => [p.id, { ...p.resources }])
      );
      recorder.recordAndApply(playerId, action);
      const newState = recorder.getState();

      if (action.type === 'roll_dice') {
        setDiceRollAnimKey(`roll-${Date.now()}-${Math.random()}`);
        if (newState.lastDiceRoll) {
          showActionFeedback(
            `🎲 ${newState.lastDiceRoll.die1} + ${newState.lastDiceRoll.die2} = ${newState.lastDiceRoll.total}`
          );
        }
      } else if (action.type === 'respond_trade') {
        const actingP = getPlayerById(newState, playerId);
        if (action.response === 'reject') {
          const reasonText = action.reason ? `: "${action.reason}"` : '';
          showActionFeedback(
            locale === 'ro'
              ? `❌ ${actingP?.name ?? playerId} a refuzat schimbul${reasonText}`
              : `❌ ${actingP?.name ?? playerId} declined trade${reasonText}`
          );
        } else {
          showActionFeedback(
            locale === 'ro'
              ? `🤝 ${actingP?.name ?? playerId} a acceptat schimbul!`
              : `🤝 ${actingP?.name ?? playerId} accepted trade!`
          );
        }
      } else if (action.type === 'end_turn') {
        showActionFeedback('⏭️ Tură încheiată');
      } else if (action.type === 'steal_from_player' || action.type === 'move_robber') {
        const stealEvents = recorder.getEvents();
        const stealEvent = stealEvents[stealEvents.length - 1];
        const stolenResource = stealEvent?.details?.stolenResource as ResourceType | undefined;
        const stolenFrom = (stealEvent?.details?.stolenFrom ?? (action.type === 'steal_from_player' ? action.targetPlayerId : undefined)) as string | undefined;
        const thief = getPlayerById(newState, playerId);
        const victim = stolenFrom ? getPlayerById(newState, stolenFrom) : undefined;
        if (stolenResource && victim) {
          const resText = `${RESOURCE_ICONS[stolenResource]} ${RESOURCE_LABELS[locale][stolenResource]}`;
          if (playerId === viewerId) {
            const isSingleHexTarget = action.type === 'move_robber';
            showActionFeedback(
              locale === 'ro'
                ? (isSingleHexTarget
                    ? `🥷 Ai furat automat 1 ${resText} de la ${victim.name} (singurul adversar cu resurse de pe hexagon)!`
                    : `🥷 Ai furat 1 ${resText} de la ${victim.name}!`)
                : `🥷 You stole 1 ${resText} from ${victim.name}!`
            );
          } else if (stolenFrom === viewerId) {
            showActionFeedback(
              locale === 'ro'
                ? `🥷 ${thief?.name ?? playerId} ți-a furat 1 ${resText}!`
                : `🥷 ${thief?.name ?? playerId} stole 1 ${resText} from you!`
            );
          } else {
            showActionFeedback(
              locale === 'ro'
                ? `🥷 ${thief?.name ?? playerId} a furat 1 ${resText} de la ${victim.name}!`
                : `🥷 ${thief?.name ?? playerId} stole 1 ${resText} from ${victim.name}!`
            );
          }
        } else if (action.type === 'move_robber' && playerId === viewerId) {
          showActionFeedback(
            locale === 'ro'
              ? '🥷 Hoțul a fost mutat. Niciun adversar de pe hexagon nu are resurse de furat.'
              : '🥷 Robber moved. No adjacent opponents have resource cards.'
          );
        }
      } else if (action.type === 'play_monopoly') {
        const events = recorder.getEvents();
        const lastEv = events[events.length - 1];
        const res = action.resource;
        const resText = `${RESOURCE_ICONS[res]} ${RESOURCE_LABELS[locale][res]}`;
        const totalTaken = Number(lastEv?.details?.totalTaken ?? 0);
        const takenByPlayer = (lastEv?.details?.takenByPlayer ?? {}) as Record<string, number>;
        const actingPlayer = getPlayerById(newState, playerId);
        if (totalTaken > 0) {
          const breakdown = Object.entries(takenByPlayer)
            .map(([vId, amt]) => `${amt} de la ${getPlayerById(newState, vId)?.name ?? vId}`)
            .join(', ');
          showActionFeedback(`👑 MONOPOL! ${actingPlayer?.name ?? playerId} a confiscat ${totalTaken}x ${resText} (${breakdown})!`);
        } else {
          showActionFeedback(`👑 MONOPOL pe ${resText}: Niciun adversar nu avea această resursă în mână (0 cărți colectate).`);
        }
      } else if (action.type === 'play_year_of_plenty') {
        const r1 = action.resources[0];
        const r2 = action.resources[1];
        showActionFeedback(`🎁 Anul Abundenței: Ai primit 1x ${RESOURCE_ICONS[r1]} ${RESOURCE_LABELS[locale][r1]} și 1x ${RESOURCE_ICONS[r2]} ${RESOURCE_LABELS[locale][r2]} direct din bancă!`);
      } else if (action.type === 'buy_dev_card') {
        const events = recorder.getEvents();
        const lastEv = events[events.length - 1];
        const drawnType = lastEv?.details?.drawnType as DevCardType | undefined;
        const buyer = getPlayerById(newState, playerId);
        const buyerName = buyer?.name ?? playerId;
        if (drawnType) {
          const cardName = DEV_CARD_LABELS[locale]?.[drawnType] ?? drawnType;
          const icon = DEV_CARD_ICONS[drawnType] ?? '🃏';
          if (playerId === viewerId) {
            showActionFeedback(`🃏 Ai cumpărat o carte de dezvoltare: ${icon} ${cardName}!`);
          } else {
            if (drawnType === 'victory_point' && newState.phase === 'game_over') {
              showActionFeedback(`🏆 ${buyerName} a cumpărat: ${icon} ${cardName} și a atins scorul de victorie!`);
            } else {
              showActionFeedback(`🃏 ${buyerName} a cumpărat o carte de dezvoltare.`);
            }
          }
        }
      }

      // Flash "+N" on whichever resources any player just gained (dice production, etc.)
      const gains: Record<string, Partial<Record<ResourceType, number>>> = {};
      for (const p of newState.players) {
        const prev = prevResourcesByPlayer.get(p.id);
        if (!prev) continue;
        for (const r of ALL_RESOURCES) {
          const delta = p.resources[r] - prev[r];
          if (delta > 0) {
            gains[p.id] = { ...gains[p.id], [r]: delta };
          }
        }
      }
      if (Object.keys(gains).length > 0) {
        setResourceGainFlash(gains);
        if (gainFlashTimeoutRef.current) clearTimeout(gainFlashTimeoutRef.current);
        gainFlashTimeoutRef.current = setTimeout(() => setResourceGainFlash({}), 1800);
      }

      // On a production roll, fly a card from the hex that produced each gained resource
      // toward the player who received it.
      if (action.type === 'roll_dice' && newState.lastDiceRoll && newState.lastDiceRoll.total !== 7) {
        const total = newState.lastDiceRoll.total;
        const hexByResource: Partial<Record<ResourceType, string>> = {};
        for (const hex of Object.values(newState.board.hexes)) {
          if (hex.numberToken !== total || hex.id === newState.board.robberHexId) continue;
          const res = TERRAIN_TO_RESOURCE[hex.terrain];
          if (res && !hexByResource[res]) hexByResource[res] = hex.id;
        }
        const requests: { playerId: string; resource: ResourceType; hexId: string }[] = [];
        for (const [gPlayerId, resMap] of Object.entries(gains)) {
          for (const r of ALL_RESOURCES) {
            const hexId = hexByResource[r];
            if (hexId && (resMap[r] ?? 0) > 0) {
              requests.push({ playerId: gPlayerId, resource: r, hexId });
            }
          }
        }
        if (requests.length > 0) {
          requestAnimationFrame(() => launchFlyingCards(requests));
        }
      }

      setBuildMode('none');
      setDiscardSelection(createEmptyResources());
      setGameVersionTick((v) => v + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Mutare invalidă.');
      setGameVersionTick((v) => v + 1);
    }
  };

  // Step one AI move
  const executeOneAiStep = async () => {
    if (onlineSession?.gameId) {
      try {
        const data = await stepOnlineAi(onlineSession.gameId, 1, onlineSession.playerId);
        setOnlinePlayerView(data.playerView);
        setOnlineLegalActions(data.legalActions as GameAction[]);
      } catch (err) {
        console.error('Failed to step AI online:', err);
      }
      return;
    }
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
            (!openOffer.toPlayerId || openOffer.toPlayerId === p.id) &&
            !openOffer.rejectedByPlayerIds.includes(p.id)
        );
        if (botResponder) {
          actorId = botResponder.id;
        } else {
          // Stop bot actions if a human player is currently reviewing this offer
          const pendingHuman = st.players.find(
            (p) =>
              p.id !== openOffer.fromPlayerId &&
              p.type === 'human' &&
              (!openOffer.toPlayerId || openOffer.toPlayerId === p.id) &&
              !openOffer.rejectedByPlayerIds.includes(p.id)
          );
          if (pendingHuman) {
            // They're never shown the accept/reject modal for an offer they can't afford (see
            // the incoming-offer modal below), so waiting on them here would stall every other
            // player's turn forever. Answer on their behalf; a human who CAN afford it still
            // gets a real say via the modal, so leave those waiting as before.
            if (!hasResources(pendingHuman.resources, openOffer.requesting)) {
              recorder.recordAndApply(pendingHuman.id, {
                type: 'respond_trade',
                offerId: openOffer.id,
                response: 'reject',
                reason: 'Resurse insuficiente'
              });
              setGameVersionTick((v) => v + 1);
            }
            return;
          }
        }
      }
    }

    const actor = getPlayerById(st, actorId);
    if (!actor || actor.type === 'human') return;

    const decision = chooseAIAction(st, actorId);
    const { event } = recorder.recordAndApply(actorId, decision.action, {
      aiDecision: decision.decisionRecord
    });
    if (decision.action.type === 'roll_dice') {
      setDiceRollAnimKey(`ai-roll-${Date.now()}-${Math.random()}`);
    }
    // Local hot-seat/AI games had no feedback at all for bot moves (online play already got it
    // via applyOnlineSync) - at a few hundred ms between auto-play steps, a bot's steal, build,
    // or trade response was easy to miss with nothing marking that it happened.
    reportRemoteEventFeedback({ playerId: actorId, action: decision.action, details: event.details }, st.players);
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
        const botResponder = st.players.find(
          (p) =>
            p.id !== openOffer.fromPlayerId &&
            p.type !== 'human' &&
            (!openOffer.toPlayerId || openOffer.toPlayerId === p.id) &&
            !openOffer.rejectedByPlayerIds.includes(p.id)
        );
        if (botResponder) {
          needsBotMove = true;
        } else {
          // If offer is open and pending human response, DO NOT step AI active player! Wait for human!
          const pendingHuman = st.players.find(
            (p) =>
              p.id !== openOffer.fromPlayerId &&
              p.type === 'human' &&
              (!openOffer.toPlayerId || openOffer.toPlayerId === p.id) &&
              !openOffer.rejectedByPlayerIds.includes(p.id)
          );
          // A pendingHuman who can't afford the offer gets auto-rejected inside
          // executeOneAiStep rather than silently stalling - run that step for them too.
          needsBotMove = !pendingHuman || !hasResources(pendingHuman.resources, openOffer.requesting);
        }
      } else {
        const active = getPlayerById(st, st.activePlayerId);
        needsBotMove = Boolean(active && active.type !== 'human');
      }
    }

    if (!needsBotMove) return;

    // Main-actions steps (build/trade/steal/dev-card) are slower than roll/setup so the
    // action-feedback banner reportRemoteEventFeedback shows for each one actually has time to
    // be read before the next step overwrites it - at the old 340ms, several bot actions could
    // fire before a single banner's 1600ms display window ran out.
    const delayMs = st.phase === 'turn_start' ? 520 : st.phase === 'main_actions' ? 950 : 340;
    const timer = setTimeout(() => {
      executeOneAiStep();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [autoPlayAi, recorder, gameVersionTick, activeTab]);

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
        (act.type === 'place_initial_road' || act.type === 'place_initial_ship')
      ) {
        eSet.add(act.edgeId);
      } else if (gameState.phase === 'road_building_card' && act.type === 'place_free_road') {
        eSet.add(act.edgeId);
      } else if (gameState.phase === 'move_robber' && act.type === 'move_robber') {
        hSet.add(act.hexId);
      } else if (buildMode === 'road' && act.type === 'build_road') {
        eSet.add(act.edgeId);
      } else if (buildMode === 'ship' && act.type === 'build_ship') {
        eSet.add(act.edgeId);
      } else if (buildMode === 'relocate_ship') {
        if (!selectedShipEdgeId) {
          if (act.type === 'move_ship') {
            eSet.add(act.fromEdgeId);
          }
        } else {
          if (act.type === 'move_ship' && act.fromEdgeId === selectedShipEdgeId) {
            eSet.add(act.toEdgeId);
          }
        }
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
    if (!gameState || !isHumanTurn) return;
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
    if (!gameState || !isHumanTurn) return;
    const pId = gameState.activePlayerId;
    if (gameState.phase === 'setup_road_1' || gameState.phase === 'setup_road_2') {
      const hasInitialShip = legalActionsForActive.some(
        (a) => a.type === 'place_initial_ship' && a.edgeId === edgeId
      );
      if (hasInitialShip && buildMode === 'ship') {
        executeAction(pId, { type: 'place_initial_ship', edgeId });
      } else {
        executeAction(pId, { type: 'place_initial_road', edgeId });
      }
    } else if (gameState.phase === 'road_building_card') {
      executeAction(pId, { type: 'place_free_road', edgeId });
    } else if (buildMode === 'road') {
      executeAction(pId, { type: 'build_road', edgeId });
    } else if (buildMode === 'ship') {
      executeAction(pId, { type: 'build_ship', edgeId });
    } else if (buildMode === 'relocate_ship') {
      if (!selectedShipEdgeId) {
        const isFromEdge = legalActionsForActive.some(
          (a) => a.type === 'move_ship' && a.fromEdgeId === edgeId
        );
        if (isFromEdge) {
          setSelectedShipEdgeId(edgeId);
        }
      } else {
        const isValidDest = legalActionsForActive.some(
          (a) => a.type === 'move_ship' && a.fromEdgeId === selectedShipEdgeId && a.toEdgeId === edgeId
        );
        if (isValidDest) {
          executeAction(pId, { type: 'move_ship', fromEdgeId: selectedShipEdgeId, toEdgeId: edgeId });
          setBuildMode('none');
          setSelectedShipEdgeId(null);
        } else {
          const isOtherFromEdge = legalActionsForActive.some(
            (a) => a.type === 'move_ship' && a.fromEdgeId === edgeId
          );
          if (isOtherFromEdge) {
            setSelectedShipEdgeId(edgeId);
          } else {
            setSelectedShipEdgeId(null);
          }
        }
      }
    } else if (gameState.phase === 'main_actions' && buildMode === 'none') {
      const isMovableShip = legalActionsForActive.some(
        (a) => a.type === 'move_ship' && a.fromEdgeId === edgeId
      );
      if (isMovableShip) {
        setBuildMode('relocate_ship');
        setSelectedShipEdgeId(edgeId);
      }
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
    const { report, replays } = runBenchmarkSuite({
      baseSeed: customSeed || 'bench-2026',
      gamesCount: benchmarkGamesCount,
      participants: [
        { id: 'p1', name: 'Expert Adaptiv', type: 'ai', aiDifficulty: 'expert', aiStyle: 'adaptive' },
        { id: 'p2', name: 'Avansat Dezvoltare', type: 'ai', aiDifficulty: 'advanced', aiStyle: 'development' },
        { id: 'p3', name: 'Mediu Expansiune', type: 'ai', aiDifficulty: 'medium', aiStyle: 'expansion' },
        { id: 'p4', name: 'Începător Comercial', type: 'ai', aiDifficulty: 'beginner', aiStyle: 'commercial' }
      ],
      rules,
      // Run entirely in the browser, so without this every benchmark game's replay (and its
      // AI decision log) was lost the moment this function returned - only the aggregate
      // stats below ever existed. Recording + syncing each one makes them reviewable later
      // in the Replay/Analysis view, same as any other game.
      recordReplays: true
    });
    for (const replay of replays) {
      saveReplayToHistory(replay, true);
    }
    setBenchmarkReport(report);
  };

  const maxPlayers = rules.boardScenario === 'expansion' || rules.boardScenario === 'world_map' ? 6 : 4;

  const playerColorsMap: Record<string, PlayerColor> = {};
  if (gameState) {
    for (const p of gameState.players) {
      playerColorsMap[p.id] = p.color;
    }
  }

  const activePlayerObj = gameState ? getPlayerById(gameState, gameState.activePlayerId) : undefined;
  const hasShipsInScenario = Boolean(gameState && isScenarioWithShips(gameState.rules?.boardScenario));
  const viewerPlayerObj = gameState ? getPlayerById(gameState, viewerId) : undefined;
  const isAllAiOnlineGame = Boolean(
    onlineSession && gameState?.players && gameState.players.every((p) => p.type !== 'human')
  );
  // Online: "my turn" means literally mine — other human seats are on other devices, so seeing
  // that *a* human is active (the local hot-seat definition) isn't enough to let me act.
  // In a 4-AI online match, the user is strictly a spectator and should never be prompted to act.
  const isHumanTurn = onlineSession
    ? (!isAllAiOnlineGame && gameState?.activePlayerId === viewerId && activePlayerObj?.type === 'human')
    : activePlayerObj?.type === 'human';

  // Reset the countdown only when a genuinely new turn starts for a human player (not on every
  // phase change within the same turn — rolling the dice shouldn't hand them another full minute).
  const turnKey = gameState ? `${gameState.turn}-${gameState.activePlayerId}` : '';
  useEffect(() => {
    if (turnKey === lastTimedTurnKeyRef.current) return;
    lastTimedTurnKeyRef.current = turnKey;
    const isRegularTurnPhase = gameState?.phase === 'turn_start' || gameState?.phase === 'main_actions';
    if (turnTimerEnabled && gameState && isHumanTurn && activeTab === 'game' && isRegularTurnPhase) {
      setTurnTimeLeft(turnTimerSec);
    } else {
      setTurnTimeLeft(null);
    }
  }, [turnKey, turnTimerEnabled, isHumanTurn, activeTab, gameState?.phase, turnTimerSec]);

  // Tick the countdown down; when it runs out, act on the player's behalf (end the turn if
  // that's legal right now, otherwise roll the dice) so a slow/away player doesn't stall the table.
  useEffect(() => {
    if (turnTimeLeft === null) return;
    if (turnTimeLeft <= 0) {
      if (activePlayerObj) {
        if (legalActionsForActive.some((a) => a.type === 'end_turn')) {
          executeAction(activePlayerObj.id, { type: 'end_turn' });
        } else if (legalActionsForActive.some((a) => a.type === 'roll_dice')) {
          executeAction(activePlayerObj.id, { type: 'roll_dice' });
        }
      }
      setTurnTimeLeft(null);
      return;
    }
    const id = setTimeout(() => setTurnTimeLeft((t) => (t !== null ? t - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [turnTimeLeft]);

  // Track every active trade offer for the negotiation banner(s) below, keyed by offer id so a
  // resolved one keeps its last known snapshot (status, who accepted...) after it's cleared from
  // gameState - the pruning effect right after this one is what actually removes it, once it's
  // both resolved AND has been visible for the 5s floor.
  //
  // A resolved offer stays in gameState.activeTradeOffers (status 'accepted'/'rejected'/...)
  // until end_turn clears the whole array - it is NOT removed just because it resolved. Once
  // the pruning effect below drops it from visibleTradeOffers, it's still sitting right there
  // in activeTradeOffers for the rest of that turn, so without the dismissedTradeOfferIds check
  // below, the very next unrelated action (e.g. building something) recreates gameState, this
  // effect sees "an offer not currently tracked" again, and the banner pops back up out of
  // nowhere. Skipping anything already dismissed - manually or via that same prune - is what
  // makes a resolved offer actually stay gone for the rest of the turn.
  useEffect(() => {
    if (!gameState) return;
    const now = Date.now();
    setVisibleTradeOffers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const offer of gameState.activeTradeOffers) {
        if (dismissedTradeOfferIds.has(offer.id)) continue;
        const existing = next[offer.id];
        if (!existing || existing.offer !== offer) {
          next[offer.id] = { offer, firstShownAtMs: existing?.firstShownAtMs ?? now };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [gameState?.activeTradeOffers, dismissedTradeOfferIds]);

  useEffect(() => {
    const timers = Object.entries(visibleTradeOffers).map(([id, entry]) => {
      if (entry.offer.status === 'open') return null;
      const remaining = Math.max(0, 5000 - (Date.now() - entry.firstShownAtMs));
      return setTimeout(() => {
        // Marking it dismissed (not just dropping it from visibleTradeOffers) is what stops the
        // tracking effect above from reviving it the next time gameState changes.
        setDismissedTradeOfferIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
        setVisibleTradeOffers((prev) => {
          if (!(id in prev)) return prev;
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
      }, remaining);
    });
    return () => {
      for (const t of timers) if (t) clearTimeout(t);
    };
  }, [visibleTradeOffers]);

  // Fly the traded resources between the two players' sidebar cards the moment an offer is
  // accepted - fires once per offer (tracked via prevTradeStatusRef) and works for every
  // viewer, including two AI/other-human players trading with each other.
  useEffect(() => {
    if (!gameState) return;
    for (const offer of gameState.activeTradeOffers) {
      const prevStatus = prevTradeStatusRef.current[offer.id];
      if (prevStatus !== 'accepted' && offer.status === 'accepted' && offer.acceptedByPlayerId) {
        const accepterId = offer.acceptedByPlayerId;
        const reqs: { resource: ResourceType; fromSelector: string; toSelector: string }[] = [];
        for (const r of ALL_RESOURCES) {
          if (offer.offering[r] > 0) {
            reqs.push({ resource: r, fromSelector: playerCardSelector(offer.fromPlayerId), toSelector: playerCardSelector(accepterId) });
          }
          if (offer.requesting[r] > 0) {
            reqs.push({ resource: r, fromSelector: playerCardSelector(accepterId), toSelector: playerCardSelector(offer.fromPlayerId) });
          }
        }
        if (reqs.length > 0) {
          requestAnimationFrame(() => launchFlyingIcon(reqs));
        }
      }
      prevTradeStatusRef.current[offer.id] = offer.status;
    }
  }, [gameState?.activeTradeOffers]);

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
      {/* Resource cards animating from the producing hex to the receiving player — fixed
          positioning so it escapes the board/sidebar's own overflow clipping. */}
      {flyingCards.map((c) => (
        <div
          key={c.key}
          className="flying-resource-card"
          style={{ left: c.launched ? c.endX : c.startX, top: c.launched ? c.endY : c.startY }}
        >
          {RESOURCE_ICONS[c.resource]}
        </div>
      ))}

      {/* Top Navigation Header (Fixed 52px height) */}
      <header className="app-header">
        <div
          className="brand-title"
          onClick={() => setActiveTab('lobby')}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          title={locale === 'ro' ? '🏠 Mergi la Pagina Principală / Lobby' : '🏠 Go to Home / Lobby'}
        >
          <span>🏝️</span>
          <span className="desktop-only">{t.appTitle}</span>
          <span className="mobile-only">Catan</span>
          {versionInfo && (
            <button
              type="button"
              className="version-badge"
              onClick={(e) => {
                e.stopPropagation();
                setShowReleaseNotes(true);
              }}
              title="Vezi notele de lansare"
            >
              {versionInfo.version}
            </button>
          )}
        </div>

        {/* Live Turn & Phase Status placed neatly in the top header */}
        {activeTab === 'game' && gameState && (
          <div className="header-turn-status">
            <span
              className="color-dot"
              style={{ backgroundColor: activePlayerObj?.color, width: 10, height: 10, flexShrink: 0 }}
            />
            <span className="turn-label">
              T{gameState.turn} — La rând: <strong>{activePlayerObj?.name}</strong>:
            </span>
            <span className="phase-label" style={{ fontWeight: 500 }}>
              {getExplicitTurnStatusDescription(
                gameState.phase,
                activePlayerObj?.name ?? '',
                gameState.activeTradeOffers?.find((o) => o.status === 'open'),
                locale
              )}
            </span>
            {Boolean(onlineSession?.gameId) && (
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontWeight: 600,
                  marginLeft: 4,
                  background: wsConnected ? 'rgba(34, 197, 94, 0.18)' : 'rgba(234, 179, 8, 0.18)',
                  color: wsConnected ? '#4ade80' : '#fde047',
                  border: `1px solid ${wsConnected ? '#22c55e' : '#eab308'}`
                }}
                title={wsConnected ? 'Conectat în timp real prin WebSocket' : 'Sincronizare de rezervă prin REST Polling'}
              >
                {wsConnected ? '● Live' : '○ Polling'}
              </span>
            )}
            {buildMode !== 'none' && (
              <span className="build-indicator">
                👉 {buildMode.toUpperCase()}
              </span>
            )}
          </div>
        )}

        {/* Section nav collapses into a hamburger dropdown — four always-visible tab buttons
            didn't belong inline in a 52px header, and crowded it on every screen size. */}
        <div className="nav-menu-wrapper">
          <button
            type="button"
            className="btn nav-menu-trigger"
            onClick={() => setNavMenuOpen((o) => !o)}
          >
            ☰ {NAV_TAB_ICON[activeTab]} <span className="desktop-only">{NAV_TAB_LABEL(t)[activeTab]}</span>
          </button>
          {navMenuOpen && (
            <>
              <div className="nav-menu-backdrop" onClick={() => setNavMenuOpen(false)} />
              <div className="nav-menu-dropdown">
                <button
                  type="button"
                  className={`nav-btn ${activeTab === 'lobby' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('lobby');
                    setNavMenuOpen(false);
                  }}
                >
                  ⚙️ {t.navLobby}
                </button>
                <button
                  type="button"
                  className={`nav-btn ${activeTab === 'game' ? 'active' : ''}`}
                  onClick={() => {
                    // No game to jump into yet — send them to the lobby to create/join an
                    // online game instead of silently starting a local one.
                    setActiveTab(recorder || onlineSession ? 'game' : 'lobby');
                    setNavMenuOpen(false);
                  }}
                >
                  🎲 {t.navGame}
                </button>
                <button
                  type="button"
                  className={`nav-btn ${activeTab === 'replay' ? 'active' : ''}`}
                  onClick={() => {
                    openGameReplay();
                    setNavMenuOpen(false);
                  }}
                >
                  🎬 {t.navReplay}
                </button>
                <button
                  type="button"
                  className={`nav-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('benchmark');
                    setNavMenuOpen(false);
                  }}
                >
                  📈 {t.navBenchmark}
                </button>
                <button
                  type="button"
                  className={`nav-btn ${activeTab === 'hall_of_fame' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('hall_of_fame');
                    setNavMenuOpen(false);
                  }}
                >
                  🏆 {t.navHallOfFame}
                </button>
                {isLocalEnvironment() && (
                  <button
                    type="button"
                    className={`nav-btn ${activeTab === 'sandbox' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('sandbox');
                      setNavMenuOpen(false);
                    }}
                  >
                    🛠️ {locale === 'ro' ? 'Mediu de Test' : 'Sandbox Mode'}
                  </button>
                )}
                <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
                <button
                  type="button"
                  className="nav-btn"
                  onClick={() => {
                    setActiveModal('full_rules');
                    setNavMenuOpen(false);
                  }}
                >
                  📖 {locale === 'ro' ? 'Regulament' : 'Rulebook'}
                </button>
              </div>
            </>
          )}
        </div>

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

      {updateAvailable && (
        <div className="update-banner">
          <span>
            🔄 {locale === 'ro'
              ? `O versiune nouă e disponibilă (${versionInfo?.version ?? ''}).`
              : `A new version is available (${versionInfo?.version ?? ''}).`}
          </span>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            {locale === 'ro' ? '↻ Reîncarcă' : '↻ Reload'}
          </button>
        </div>
      )}

      {/* TAB 1: LOBBY & GAME CONFIGURATION (Fully Responsive, Vertical Scroll on Mobile) */}
      {activeTab === 'lobby' && (
        <main className="lobby-container">
          {/* Left Panel: 1-4 Configurable Participants & Join by Code */}
          <section className="panel">
            {/* Active Online Game Rejoin Banner */}
            {onlineSession?.gameId && (
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.14)',
                  border: '1px solid var(--accent-blue)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.65rem 0.9rem',
                  marginBottom: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--accent-blue)', fontSize: '0.9rem' }}>
                    🎮 {locale === 'ro' ? 'Ai o partidă online activă în desfășurare!' : 'You have an active online game!'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    ID: {onlineSession.gameId} · {locale === 'ro' ? 'Jucător' : 'Player'}: {onlineSession.playerId}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.82rem' }}
                    onClick={() => {
                      enterOnlineGame(onlineSession.gameId!, onlineSession.sessionToken, onlineSession.playerId, onlineSession.lobbyId);
                    }}
                  >
                    ▶️ {locale === 'ro' ? 'Reintră în Joc' : 'Rejoin Game'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '0.25rem 0.55rem', fontSize: '0.82rem' }}
                    onClick={() => {
                      setOnlineSession(null);
                      saveOnlineSession(null);
                      setOnlinePlayerView(null);
                    }}
                  >
                    ✕ {locale === 'ro' ? 'Părăsește' : 'Leave'}
                  </button>
                </div>
              </div>
            )}

            {/* Join by Code / Link Card */}
            <div className="join-game-box">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-gold)', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  🎮 Intră într-o partidă cu Cod de Invitație
                </span>
                {joinCodeInput && (
                  <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 700, background: 'rgba(59, 130, 246, 0.15)', padding: '2px 8px', borderRadius: 4 }}>
                    ✓ Cod preluat din link!
                  </span>
                )}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.65rem',
                  alignItems: 'end'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Cod de Invitație:
                  </label>
                  <input
                    type="text"
                    placeholder="Cod (ex: CATAN-1234)"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '0.48rem 0.65rem',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      borderRadius: 6
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Numele tău de jucător:
                  </label>
                  <input
                    type="text"
                    placeholder="Introdu numele tău (ex: Andrei)"
                    value={joinPlayerName}
                    onChange={(e) => {
                      setJoinPlayerName(e.target.value);
                      savePlayerName(e.target.value);
                    }}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '0.48rem 0.65rem',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      borderRadius: 6
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleJoinWithCode()}
                  disabled={joinLoading || !joinCodeInput.trim()}
                  style={{
                    width: '100%',
                    padding: '0.52rem 1rem',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    justifyContent: 'center',
                    height: 38,
                    boxSizing: 'border-box'
                  }}
                >
                  {joinLoading ? 'Se conectează...' : '🚀 Intră în Joc'}
                </button>
              </div>
              {joinError && (
                <div style={{ color: '#f87171', fontSize: '0.82rem', marginTop: 8, fontWeight: 600 }}>
                  ⚠️ {joinError}
                </div>
              )}
            </div>

            {publicLobbies.length > 0 && (
              <div className="join-game-box" style={{ marginBottom: '0.85rem' }}>
                <div style={{ fontWeight: 700, color: 'var(--accent-gold)', fontSize: '0.92rem', marginBottom: 8 }}>
                  🌐 {locale === 'ro' ? 'Partide Publice Active' : 'Active Public Games'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {publicLobbies
                    .filter((l) => l.status !== 'finished')
                    .map((l) => {
                      const filledSeats = l.seats.filter((s) => s.type !== 'open').length;
                      const isWaiting = l.status === 'waiting';
                      const openSeats = l.seats.filter((s) => s.type === 'open');
                      const humanSeats = l.seats.filter((s) => s.type === 'human');
                      const aiSeats = l.seats.filter((s) => s.type === 'ai');
                      const hasOpenSeat = openSeats.length > 0;
                      return (
                        <div
                          key={l.lobbyId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.6rem',
                            flexWrap: 'wrap',
                            background: 'var(--bg-inset)',
                            border: '1px solid var(--border-color-soft)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.55rem 0.7rem'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{l.name}</span>
                              {isWaiting && hasOpenSeat && (
                                <span style={{ fontSize: '0.72rem', background: 'rgba(34,197,94,0.18)', color: '#4ade80', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                                  🟢 {openSeats.length} {openSeats.length === 1 ? (locale === 'ro' ? 'loc liber' : 'open seat') : (locale === 'ro' ? 'locuri libere' : 'open seats')}
                                </span>
                              )}
                              {isWaiting && !hasOpenSeat && (
                                <span style={{ fontSize: '0.72rem', background: 'rgba(245,158,11,0.18)', color: '#f59e0b', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                                  🚫 {locale === 'ro' ? 'Fără locuri libere' : 'No open seats'}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                              {isWaiting
                                ? (hasOpenSeat
                                    ? (locale === 'ro' ? '⏳ Așteaptă jucători' : '⏳ Waiting for players')
                                    : (locale === 'ro' ? `⏳ Așteaptă pornirea de către gazdă (${humanSeats.length} Om, ${aiSeats.length} AI)` : `⏳ Waiting for host to start (${humanSeats.length} Human, ${aiSeats.length} AI)`))
                                : (locale === 'ro' ? '▶️ În desfășurare' : '▶️ In progress')}
                              {' · '}
                              {filledSeats}/{l.seats.length} {locale === 'ro' ? 'locuri' : 'seats'}
                            </span>
                            {l.inviteCode && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.73rem', marginTop: 1 }}>
                                <span style={{ color: 'var(--text-muted)' }}>{locale === 'ro' ? 'Cod invitație:' : 'Invite code:'}</span>
                                <code
                                  style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    fontFamily: 'monospace',
                                    fontWeight: 700,
                                    color: 'var(--accent-gold)'
                                  }}
                                >
                                  {l.inviteCode}
                                </code>
                                <button
                                  type="button"
                                  title={locale === 'ro' ? 'Copiază codul și completează caseta de alăturare' : 'Copy code and fill join box'}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '0 3px',
                                    fontSize: '0.85rem'
                                  }}
                                  onClick={() => {
                                    navigator.clipboard.writeText(l.inviteCode!);
                                    setJoinCodeInput(l.inviteCode!);
                                    setServerStatusMsg(locale === 'ro' ? `Codul ${l.inviteCode} a fost copiat în casetă!` : `Code ${l.inviteCode} copied to box!`);
                                  }}
                                >
                                  📋
                                </button>
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            {isWaiting && hasOpenSeat && l.inviteCode && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                disabled={joinLoading}
                                onClick={() => handleJoinWithCode(l.inviteCode)}
                              >
                                🚀 {locale === 'ro' ? 'Alătură-te' : 'Join'}
                              </button>
                            )}
                            {l.status === 'in_progress' && l.gameId && (
                              <button
                                type="button"
                                className="btn"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                onClick={() => handleSpectate(l.gameId!)}
                              >
                                👁️ {locale === 'ro' ? 'Spectează' : 'Spectate'}
                              </button>
                            )}
                            {l.terminationDismissed ? (
                              <span style={{ fontSize: '0.74rem', color: '#4ade80', fontWeight: 600, padding: '0.25rem 0.5rem', background: 'rgba(34,197,94,0.15)', borderRadius: 4 }}>
                                🛡️ {locale === 'ro' ? 'Partidă protejată' : 'Protected'}
                              </span>
                            ) : l.pendingTermination ? (
                              <span style={{ fontSize: '0.74rem', color: '#f59e0b', fontWeight: 600, padding: '0.25rem 0.5rem', background: 'rgba(245,158,11,0.15)', borderRadius: 4 }}>
                                ⏱️ {locale === 'ro' ? 'Confirmare în curs (30s)...' : 'Confirmation pending (30s)...'}
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-danger"
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                                title={locale === 'ro' ? 'Oprește sau anulează această partidă de pe server' : 'Stop or cancel this game/lobby'}
                                onClick={async () => {
                                  if (!window.confirm(locale === 'ro' ? 'Sigur dorești să oprești definitiv această partidă/sală de pe server?' : 'Are you sure you want to stop and cancel this lobby/game?')) return;
                                  try {
                                    let res: any;
                                    if (l.gameId) {
                                      res = await terminateOnlineGame(l.gameId);
                                    } else {
                                      res = await terminateOnlineLobby(l.lobbyId);
                                    }
                                    if (res?.pendingConfirmation) {
                                      alert(locale === 'ro'
                                        ? 'Cererea de oprire a fost trimisă jucătorilor din partidă. Dacă aceștia refuză, partida va continua. Dacă nu răspund în 30 de secunde, partida se va închide automat.'
                                        : 'Confirmation requested from players (30s timeout).');
                                      listPublicLobbies().then(setPublicLobbies).catch(() => {});
                                    } else {
                                      setPublicLobbies((prev) => prev.filter((p) => p.lobbyId !== l.lobbyId && p.gameId !== l.gameId));
                                      listPublicLobbies().then((lobbies) => setPublicLobbies(lobbies)).catch(() => {});
                                      setServerStatusMsg(locale === 'ro' ? 'Partida/sala a fost oprită cu succes.' : 'Game/lobby stopped successfully.');
                                    }
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : 'Eroare la oprirea partidei');
                                  }
                                }}
                              >
                                ⏹️ {locale === 'ro' ? 'Oprește' : 'Stop'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexShrink: 0 }}>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
                👥 {locale === 'ro'
                  ? `Configurare Participanți (1–${maxPlayers} Locuri)`
                  : `Configure Participants (1–${maxPlayers} Seats)`}
              </h2>
              {participants.length < maxPlayers && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const nextIdx = participants.length + 1;
                    const usedColors = new Set(participants.map((p) => p.color));
                    const nextColor =
                      PLAYER_COLORS.find((c) => !usedColors.has(c)) ??
                      PLAYER_COLORS[(nextIdx - 1) % PLAYER_COLORS.length]!;
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
              {participants.map((p, idx) => {
                const currentColor = p.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
                const activeColors = maxPlayers > 4 ? PLAYER_COLORS : PLAYER_COLORS.slice(0, 4);

                return (
                  <div
                    key={p.id}
                    className="seat-card"
                    style={{ borderLeftColor: currentColor }}
                  >
                    {/* Top Row: Interactive Color Dot (Swap) + Name input + Type Toggle (Om / AI) + Delete */}
                    <div className="seat-row-main" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {/* Interactive Color Dot */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="color-dot-btn"
                          title={locale === 'ro' ? 'Click pentru a alege culoarea (schimbă automat culoarea cu celălalt jucător)' : 'Click to choose color (swaps with existing player)'}
                          style={{
                            backgroundColor: currentColor,
                            borderColor: colorPickerIdx === idx ? '#fff' : '#e9dfc4'
                          }}
                          onClick={() => setColorPickerIdx(colorPickerIdx === idx ? null : idx)}
                        />
                        {colorPickerIdx === idx && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '120%',
                              left: 0,
                              zIndex: 60,
                              display: 'flex',
                              gap: 6,
                              padding: '6px 8px',
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-md)',
                              boxShadow: '0 4px 14px rgba(0,0,0,0.6)'
                            }}
                          >
                            {activeColors.map((c) => (
                              <button
                                key={c}
                                type="button"
                                title={c.toUpperCase()}
                                style={{
                                  backgroundColor: c,
                                  width: 22,
                                  height: 22,
                                  borderRadius: '50%',
                                  border: currentColor === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.4)',
                                  transform: currentColor === c ? 'scale(1.2)' : 'none',
                                  cursor: 'pointer',
                                  padding: 0
                                }}
                                onClick={() => {
                                  handleSwapColor(idx, c);
                                  setColorPickerIdx(null);
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Name input */}
                      <input
                        type="text"
                        value={p.name}
                        placeholder={p.type === 'human' ? 'Nume' : 'Nume Bot'}
                        onChange={(e) => {
                          const next = [...participants];
                          next[idx] = { ...p, name: e.target.value };
                          setParticipants(next);
                          if (idx === 0) savePlayerName(e.target.value);
                        }}
                        style={{
                          flex: '1 1 120px',
                          minWidth: 90,
                          fontSize: '0.86rem',
                          padding: '0.35rem 0.55rem'
                        }}
                      />

                      {/* Om / AI Segmented Toggle Pills */}
                      <div className="participant-type-toggle">
                        <button
                          type="button"
                          className={`toggle-pill ${p.type === 'human' ? 'active' : ''}`}
                          onClick={() => {
                            const next = [...participants];
                            next[idx] = { ...p, type: 'human' };
                            setParticipants(next);
                          }}
                        >
                          👤 {locale === 'ro' ? 'Om' : 'Human'}
                        </button>
                        <button
                          type="button"
                          className={`toggle-pill ${p.type !== 'human' ? 'active' : ''}`}
                          onClick={() => {
                            const next = [...participants];
                            next[idx] = {
                              ...p,
                              type: 'ai',
                              aiDifficulty: p.aiDifficulty ?? 'medium',
                              aiStyle: p.aiStyle ?? 'balanced'
                            };
                            setParticipants(next);
                          }}
                        >
                          🤖 AI
                        </button>
                      </div>

                      {/* Delete Seat Button */}
                      {participants.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.8rem', flexShrink: 0 }}
                          title={locale === 'ro' ? 'Elimină acest loc' : 'Remove seat'}
                          onClick={() => setParticipants(participants.filter((_, i) => i !== idx))}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* AI Configuration Row (only when AI) */}
                    {(p.type === 'ai' || p.type === 'llm') && (
                      <div className="seat-row-ai" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: 4 }}>
                        <div className="form-field" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                            {locale === 'ro' ? 'Dificultate' : 'Difficulty'}
                          </label>
                          <select
                            value={p.aiDifficulty ?? 'medium'}
                            style={{ fontSize: '0.82rem', padding: '0.25rem 0.45rem' }}
                            onChange={(e) => {
                              const next = [...participants];
                              next[idx] = { ...p, aiDifficulty: e.target.value as AIDifficulty };
                              setParticipants(next);
                            }}
                          >
                            <option value="beginner">{locale === 'ro' ? 'Începător' : 'Beginner'}</option>
                            <option value="medium">{locale === 'ro' ? 'Mediu' : 'Medium'}</option>
                            <option value="advanced">{locale === 'ro' ? 'Avansat' : 'Advanced'}</option>
                            <option value="expert">{locale === 'ro' ? 'Expert' : 'Expert'}</option>
                          </select>
                        </div>
                        <div className="form-field" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                            {locale === 'ro' ? 'Stil Strategic' : 'Strategy Style'}
                          </label>
                          <select
                            value={p.aiStyle ?? 'balanced'}
                            style={{ fontSize: '0.82rem', padding: '0.25rem 0.45rem' }}
                            onChange={(e) => {
                              const next = [...participants];
                              next[idx] = { ...p, aiStyle: e.target.value as AIStrategyStyle };
                              setParticipants(next);
                            }}
                          >
                            <option value="balanced">{locale === 'ro' ? 'Echilibrat' : 'Balanced'}</option>
                            <option value="expansion">{locale === 'ro' ? 'Expansiune' : 'Expansion'}</option>
                            <option value="development">{locale === 'ro' ? 'Dezvoltare' : 'Development'}</option>
                            <option value="commercial">{locale === 'ro' ? 'Comercial' : 'Commercial'}</option>
                            <option value="competitive">{locale === 'ro' ? 'Competitiv' : 'Competitive'}</option>
                            <option value="adaptive">{locale === 'ro' ? 'Adaptiv' : 'Adaptive'}</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Unified Start Buttons & Share Banner — online is the only way to actually play
                (local hot-seat was confusing: it let games start before every intended human
                had a chance to join). "Simulare Rapidă" stays separate — it's an instant 4-AI
                benchmark for the Replay/Analysis tools, not a way to play as a human. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.65rem', flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-primary btn-start-match"
                disabled={onlineBusy}
                onClick={handleCreateOnlineLobby}
              >
                🌐 {onlineBusy ? 'Se creează...' : 'Creează Partidă Online'}
              </button>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
                {participants.every((p) => p.type !== 'human')
                  ? '👁️ Toți cei 4 participanți sunt AI: partida se va desfășura în Mod Spectator, iar agenții vor construi și plasa totul autonom.'
                  : 'Locul 1 ești tu. Orice alt loc marcat „Om” devine un loc liber — ceilalți jucători se alătură de pe propriul dispozitiv cu codul de invitație, înainte să poată începe partida.'}
              </p>
              {onlineError && (
                <div style={{ color: '#f87171', fontSize: '0.78rem' }}>⚠️ {onlineError}</div>
              )}

              <button
                type="button"
                className="btn btn-quick-sim"
                onClick={handleQuick4AiSimulation}
              >
                ⚡ {t.quickAiMatch} & Analiză
              </button>

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
                  <label>{locale === 'ro' ? 'Variantă Tablă' : 'Board Variant'}</label>
                  <select
                    value={rules.boardScenario}
                    onChange={(e) => {
                      const scenario = e.target.value as GameRulesConfig['boardScenario'];
                      setRules({ ...rules, boardScenario: scenario });
                      if (scenario === 'classic' && participants.length > 4) {
                        setParticipants(participants.slice(0, 4));
                      }
                    }}
                  >
                    <option value="classic">
                      {locale === 'ro' ? '🏝️ Clasică (19 hexagoane, până la 4 jucători)' : 'Classic (19 hexes, up to 4 players)'}
                    </option>
                    <option value="expansion">
                      {locale === 'ro' ? '🗺️ Extensie 5-6 Jucători (30 hexagoane, până la 6 jucători)' : '5-6 Player Expansion (30 hexes, up to 6 players)'}
                    </option>
                    <option value="seafarers_shores">
                      {locale === 'ro' ? '⛵ Navigatori: Spre Țărmuri Noi (Arhipelag & Râuri de Aur)' : 'Seafarers: Heading to New Shores (Archipelago & Gold)'}
                    </option>
                    <option value="seafarers_islands">
                      {locale === 'ro' ? '🏝️ Navigatori: Cele Patru Insule (4 Insule & Rute Maritime)' : 'Seafarers: The Four Islands (4 Islands & Trade Routes)'}
                    </option>
                    <option value="seafarers_fog">
                      {locale === 'ro' ? '🌫️ Navigatori: Insulele în Ceață (Ape Neexplorate & Aur)' : 'Seafarers: The Fog Island (Uncharted Waters & Gold)'}
                    </option>
                    <option value="world_map">
                      {locale === 'ro' ? '🌍 Harta Lumii (World Map - Continente, Oceane & Aur)' : 'World Map (Continents, Oceans & Gold)'}
                    </option>
                  </select>
                </div>

                <div className="form-field">
                  <label>{t.boardLayout}</label>
                  <input
                    type="text"
                    readOnly
                    value={
                      rules.boardScenario === 'expansion'
                        ? (locale === 'ro'
                            ? 'Spirală Echilibrată (28 jetoane, fără 6 și 8 adiacente)'
                            : 'Balanced Spiral (28 tokens, no adjacent 6s & 8s)')
                        : (locale === 'ro'
                            ? 'Spirala Oficială Regulament (A–R ceasornic)'
                            : 'Official Rulebook Spiral (A–R clockwise)')
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
                    placeholder="Aleatoriu (lasă liber sau introdu seed fix)"
                  />
                </div>

                <div className="form-field">
                  <label>⏱️ Cronometru per Tură</label>
                  <select
                    value={turnTimerEnabled ? String(turnTimerSec) : 'off'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'off') {
                        setTurnTimerEnabled(false);
                      } else {
                        setTurnTimerEnabled(true);
                        setTurnTimerSec(Number(v));
                      }
                    }}
                  >
                    <option value="off">Dezactivat</option>
                    <option value="30">30 secunde</option>
                    <option value="45">45 secunde</option>
                    <option value="60">60 secunde (maxim)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '0.85rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-gold)' }}>
                    {locale === 'ro' ? 'Cărțile Jocului & Ce Fac' : 'Game Cards & What They Do'}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                    onClick={() => setActiveModal('full_rules')}
                  >
                    📖 {locale === 'ro' ? 'Regulile Jocului' : 'Full Rules'}
                  </button>
                </div>

                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  {locale === 'ro' ? 'Resurse' : 'Resources'}
                </div>
                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                  {ALL_RESOURCES.map((r) => (
                    <ResourceCardSprite key={r} resource={r} count={19} locale={locale} size="sm" />
                  ))}
                </div>

                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  {locale === 'ro' ? 'Cărți de Dezvoltare' : 'Development Cards'}
                </div>
                <div className="card-gallery-grid">
                  {(
                    [
                      ['knight', 14],
                      ['victory_point', 5],
                      ['road_building', 2],
                      ['year_of_plenty', 2],
                      ['monopoly', 2]
                    ] as const
                  ).map(([t, count]) => (
                    <div key={t} className="card-gallery-item">
                      <DevCardSprite type={t} count={count} locale={locale} size="sm" />
                      <p className="card-gallery-rule-text">{DEV_CARD_RULE_TEXT[locale][t]}</p>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', margin: '0.75rem 0 0.4rem' }}>
                  {locale === 'ro' ? 'Carduri Speciale (fără carte fizică în pachet)' : 'Special Cards (no physical card in the deck)'}
                </div>
                <div className="card-gallery-grid">
                  <div className="card-gallery-item">
                    <div
                      className="special-card-tile"
                      style={{ backgroundImage: 'url(/special_longest_road.jpg)' }}
                    >
                      <span className="special-card-title">{locale === 'ro' ? 'Drumul cel mai Lung' : 'Longest Road'}</span>
                      <span className="special-card-vp">+2 PV</span>
                    </div>
                    <p className="card-gallery-rule-text">
                      {locale === 'ro'
                        ? 'Primul jucător cu un lanț neîntrerupt de minim 5 drumuri conectate. Trece la alt jucător dacă acesta construiește un lanț mai lung.'
                        : 'The first player with an unbroken chain of at least 5 connected roads. Transfers if someone else builds a longer chain.'}
                    </p>
                  </div>
                  <div className="card-gallery-item">
                    <div
                      className="special-card-tile special-card-tile-army"
                      style={{ backgroundImage: 'url(/special_largest_army.jpg)' }}
                    >
                      <span className="special-card-title">{locale === 'ro' ? 'Armata cea mai Mare' : 'Largest Army'}</span>
                      <span className="special-card-vp">+2 PV</span>
                    </div>
                    <p className="card-gallery-rule-text">
                      {locale === 'ro'
                        ? 'Primul jucător care joacă 3 cărți Cavaler. Trece la alt jucător dacă acesta joacă mai multe.'
                        : 'The first player to play 3 Knight cards. Transfers if someone else plays more.'}
                    </p>
                  </div>
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
                    <div
                      key={p.id}
                      data-player-card-id={p.id}
                      className={`player-card ${isCurrent ? 'active-turn' : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem' }}>
                        <span>
                          <span
                            className="color-dot"
                            style={{ backgroundColor: p.color, marginRight: 5, verticalAlign: 'middle' }}
                          />
                          <strong>{p.name}</strong>
                          {p.id === viewerId && (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '0 4px', fontSize: '0.68rem', marginLeft: 4, height: 18, lineHeight: '16px' }}
                              title={locale === 'ro' ? 'Schimbă numele tău' : 'Change your name'}
                              onClick={() => handlePromptRenameInGame(p.name)}
                            >
                              ✏️
                            </button>
                          )}
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                            [{p.type.toUpperCase()}]
                          </span>
                        </span>
                        <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                          {p.totalScore !== undefined ? `${p.totalScore} VP` : `${p.publicScore} VP`}
                          {!!p.specialVictoryPoints && p.specialVictoryPoints > 0 && (
                            <span
                              style={{
                                marginLeft: 4,
                                fontSize: '0.68rem',
                                background: 'rgba(234, 179, 8, 0.2)',
                                color: '#eab308',
                                padding: '1px 5px',
                                borderRadius: 4,
                                border: '1px solid rgba(234, 179, 8, 0.4)'
                              }}
                              title={locale === 'ro' ? `+${p.specialVictoryPoints} Puncte Speciale de Victorie (Catan Chits / Insule)` : `+${p.specialVictoryPoints} Special VP (Catan Chits)`}
                            >
                              +{p.specialVictoryPoints}🪙
                            </span>
                          )}
                        </span>
                      </div>

                      {p.resources ? (
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          {ALL_RESOURCES.map((r) => {
                            const gain = resourceGainFlash[p.id]?.[r];
                            return (
                              <div key={r} data-player-id={p.id} data-resource={r} style={{ position: 'relative' }}>
                                <ResourceCardSprite resource={r} count={p.resources![r]} locale={locale} size="xs" />
                                {gain ? <span className="resource-gain-flash">+{gain}</span> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.76rem', marginTop: 3, color: 'var(--text-muted)' }}>
                          🎴 {p.resourceCount} resurse · 🃏 {p.devCardCount} dezvoltare
                        </div>
                      )}

                      {/* Piece Counts: Settlements, Cities, Roads */}
                      <div className="player-grid-pieces" style={{ display: 'flex', gap: 4, marginTop: '0.25rem', marginBottom: '0.2rem' }}>
                        {(
                          [
                            ['settlements', '🏠', locale === 'ro' ? 'Așezări' : 'Settlements'] as const,
                            ['cities', '🏰', locale === 'ro' ? 'Orașe' : 'Cities'] as const,
                            ['roads', '🛣️', locale === 'ro' ? 'Drumuri' : 'Roads'] as const,
                            ...(hasShipsInScenario && p.remainingPieces.ships !== undefined
                              ? [['ships', '⛵', locale === 'ro' ? 'Corăbii' : 'Ships'] as const]
                              : [])
                          ]
                        ).map(([key, icon, label]) => {
                          const total = INITIAL_PLAYER_PIECES[key];
                          const used = total - (p.remainingPieces[key] ?? 0);
                          const exhausted = used >= total;
                          return (
                            <span
                              key={key}
                              className={`piece-count-pill ${exhausted ? 'exhausted' : ''}`}
                              title={`${label}: ${used}/${total} construite`}
                              style={{ fontSize: '0.72rem', padding: '1px 6px' }}
                            >
                              {icon} {used}/{total}
                            </span>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
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
            <div className="panel" style={{ flexShrink: 0, padding: '0.7rem' }} data-bank-anchor="true">
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

              {turnTimeLeft !== null && (
                <div
                  className="turn-timer-badge"
                  style={{
                    pointerEvents: 'auto',
                    borderColor: turnTimeLeft <= 10 ? 'var(--accent-red)' : 'var(--accent-gold)',
                    color: turnTimeLeft <= 10 ? 'var(--accent-red)' : 'var(--accent-gold-bright)'
                  }}
                >
                  ⏱️ {turnTimeLeft}s
                </div>
              )}

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

            {actionFeedbackQueue.length > 0 && (
              <div className="action-feedback-stack">
                {actionFeedbackQueue.map((f) => (
                  <div key={f.id} className={`action-feedback-item ${f.fading ? 'fading' : ''}`}>
                    {f.content}
                  </div>
                ))}
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
          <footer className="game-bottom-dock">
            {/* Header row: player name, card count, and mobile collapse toggle */}
            <div className="dock-title-bar">
              <div className="dock-player-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div>
                  <span>Cărțile lui</span> <strong>{(viewerPlayerObj ?? activePlayerObj)?.name}</strong>{' '}
                  {/* Larger + gold so the hand size actually draws the eye, not just a muted
                      aside next to the name - piece counts moved onto their own build buttons
                      below instead of living here as a separate row. */}
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-gold)', marginLeft: 2 }}>
                    ({totalResourceCount((viewerPlayerObj ?? activePlayerObj)?.resources ?? createEmptyResources())} resurse)
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-dock-toggle"
                onClick={() => setMobileDockCollapsed((c) => !c)}
              >
                {mobileDockCollapsed ? '▲ Afișează Cărți' : '▼ Ascunde'}
              </button>
            </div>

            {/* Render cards and actions only when NOT collapsed */}
            {!mobileDockCollapsed && (
              <>
                {/* Cards Row: All 5 resources + dev card in ONE ROW, ZERO SCROLL */}
                <div className="dock-cards-row">
                  {ALL_RESOURCES.map((r) => {
                    const gain = resourceGainFlash[(viewerPlayerObj ?? activePlayerObj)?.id ?? '']?.[r];
                    return (
                      <div
                        key={r}
                        data-player-id={(viewerPlayerObj ?? activePlayerObj)?.id}
                        data-resource={r}
                        style={{ position: 'relative' }}
                      >
                        <ResourceCardSprite
                          resource={r}
                          count={(viewerPlayerObj ?? activePlayerObj)?.resources[r] ?? 0}
                          locale={locale}
                          size="xs"
                        />
                        {gain ? <span className="resource-gain-flash">+{gain}</span> : null}
                      </div>
                    );
                  })}

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

                  {/* Small cost-card thumbnail right next to the resources the player holds -
                      clicking it opens the same full Cost Table modal as the sidebar button, so
                      build/dev-card costs are one click away from where the resources are shown. */}
                  <div
                    className="cost-card-thumb"
                    onClick={() => setActiveModal('costs_help')}
                    title={locale === 'ro' ? 'Vezi Tabelul de Costuri' : 'View the Cost Table'}
                  >
                    📋
                    <span className="sprite-card-label sprite-card-label-xs">
                      {locale === 'ro' ? 'Costuri' : 'Costs'}
                    </span>
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

                  {(gameState.phase === 'main_actions' || gameState.phase === 'special_building') && isHumanTurn && activePlayerObj && (
                    <>
                      {gameState.phase === 'special_building' && (
                        <button
                          type="button"
                          className="btn btn-warning"
                          style={{ fontWeight: 700 }}
                          onClick={() => executeAction(activePlayerObj.id, { type: 'pass_special_building' })}
                          title={locale === 'ro' ? 'Încheie rândul de construcție specială' : 'Finish special building turn'}
                        >
                          ⏭️ {locale === 'ro' ? 'Pas Fază Specială' : 'Pass Special Build'}
                        </button>
                      )}
                      <button
                        type="button"
                        className={`btn ${buildMode === 'road' ? 'btn-primary' : ''}`}
                        disabled={
                          !hasResources(activePlayerObj.resources, BUILDING_COSTS.road) ||
                          activePlayerObj.remainingPieces.roads <= 0
                        }
                        onClick={() => setBuildMode((m) => (m === 'road' ? 'none' : 'road'))}
                      >
                        🛣️ {t.buildRoad} ({INITIAL_PLAYER_PIECES.roads - activePlayerObj.remainingPieces.roads}/{INITIAL_PLAYER_PIECES.roads})
                      </button>
                      {hasShipsInScenario && activePlayerObj.remainingPieces.ships !== undefined && (
                        <button
                          type="button"
                          className={`btn ${buildMode === 'ship' ? 'btn-primary' : ''}`}
                          disabled={
                            !hasResources(activePlayerObj.resources, BUILDING_COSTS.ship) ||
                            (activePlayerObj.remainingPieces.ships ?? 0) <= 0
                          }
                          onClick={() => setBuildMode((m) => (m === 'ship' ? 'none' : 'ship'))}
                          title={locale === 'ro' ? 'Construiește Corabie (1 Lemn + 1 Oaie)' : 'Build Ship (1 Wood + 1 Sheep)'}
                        >
                          ⛵ {locale === 'ro' ? 'Corabie' : 'Ship'} ({INITIAL_PLAYER_PIECES.ships - (activePlayerObj.remainingPieces.ships ?? 0)}/{INITIAL_PLAYER_PIECES.ships})
                        </button>
                      )}
                      {hasShipsInScenario && legalActionsForActive.some((a) => a.type === 'move_ship') && (
                        <button
                          type="button"
                          className={`btn ${buildMode === 'relocate_ship' ? 'btn-primary' : ''}`}
                          onClick={() => {
                            setBuildMode((m) => (m === 'relocate_ship' ? 'none' : 'relocate_ship'));
                            setSelectedShipEdgeId(null);
                          }}
                          title={locale === 'ro' ? 'Mută o corabie de la capătul liber (1/tură gratuit)' : 'Relocate open ship (1/turn free)'}
                        >
                          🧭 {locale === 'ro' ? (selectedShipEdgeId ? 'Alege Destinație' : 'Mută Corabie') : (selectedShipEdgeId ? 'Choose Dest' : 'Move Ship')}
                        </button>
                      )}
                      <button
                        type="button"
                        className={`btn ${buildMode === 'settlement' ? 'btn-primary' : ''}`}
                        disabled={
                          !hasResources(activePlayerObj.resources, BUILDING_COSTS.settlement) ||
                          activePlayerObj.remainingPieces.settlements <= 0
                        }
                        onClick={() => setBuildMode((m) => (m === 'settlement' ? 'none' : 'settlement'))}
                      >
                        🏠 {t.buildSettlement} ({INITIAL_PLAYER_PIECES.settlements - activePlayerObj.remainingPieces.settlements}/{INITIAL_PLAYER_PIECES.settlements})
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
                        🏰 {t.buildCity} ({INITIAL_PLAYER_PIECES.cities - activePlayerObj.remainingPieces.cities}/{INITIAL_PLAYER_PIECES.cities})
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
                        🃏 {t.buyDevCard}
                      </button>

                      {gameState.phase === 'main_actions' && (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setActiveModal('trade')}
                        >
                          ⚓ Comerț
                        </button>
                      )}
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
              </>
            )}
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
                      {isCurrent && <span className="player-grid-turn-badge">⚡ La rând</span>}
                      <div className="player-grid-header">
                        <div className="player-grid-title">
                          <span
                            className="color-dot"
                            style={{ backgroundColor: p.color, width: 12, height: 12 }}
                          />
                          <span className="player-grid-name">{p.name}</span>
                          <span className="player-grid-type">{p.type.toUpperCase()}</span>
                        </div>
                        <span className="player-grid-score">
                          {p.totalScore !== undefined ? `${p.totalScore} VP` : `${p.publicScore} VP`}
                        </span>
                      </div>

                      {p.resources ? (
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 2 }}>
                          {ALL_RESOURCES.map((r) => {
                            const gain = resourceGainFlash[p.id]?.[r];
                            return (
                              <div key={r} style={{ position: 'relative' }}>
                                <ResourceCardSprite resource={r} count={p.resources![r]} locale={locale} size="xs" />
                                {gain ? <span className="resource-gain-flash">+{gain}</span> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.2rem 0' }}>
                          🎴 {p.resourceCount} resurse · 🃏 {p.devCardCount} dezvoltare
                        </div>
                      )}

                      <div className="player-grid-stats">
                        {/* Pieces placed vs the fixed physical supply (5 settlements / 4
                            cities / 15 roads) — so "why can't I build a settlement" has an
                            answer right here: 5/5 means none left, not a resource problem. */}
                        <div className="player-grid-pieces">
                          {(
                            [
                              ['settlements', '🏠', locale === 'ro' ? 'Așezări' : 'Settlements'] as const,
                              ['cities', '🏰', locale === 'ro' ? 'Orașe' : 'Cities'] as const,
                              ['roads', '🛣️', locale === 'ro' ? 'Drumuri' : 'Roads'] as const,
                              ...(hasShipsInScenario && p.remainingPieces.ships !== undefined
                                ? [['ships', '⛵', locale === 'ro' ? 'Corăbii' : 'Ships'] as const]
                                : [])
                            ]
                          ).map(([key, icon, title]) => {
                            const total = INITIAL_PLAYER_PIECES[key];
                            const used = total - (p.remainingPieces[key] ?? 0);
                            const exhausted = used >= total;
                            return (
                              <span
                                key={key}
                                className={`piece-count-pill ${exhausted ? 'exhausted' : ''}`}
                                title={`${title}: ${used}/${total}`}
                              >
                                {icon} {used}/{total}
                              </span>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>🏆 Drum Lung: {p.longestRoadLength}</span>
                          <span>⚔️ Cavaleri: {p.knightsPlayed}</span>
                        </div>
                        {(hasLongestRoad || hasLargestArmy) && (
                          <div className="player-grid-badges">
                            {hasLongestRoad && <span className="achievement-badge">🏅 +2 Drum</span>}
                            {hasLargestArmy && <span className="achievement-badge">🛡️ +2 Armată</span>}
                          </div>
                        )}
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
                            <div
                              key={dt}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 150 }}
                            >
                              <DevCardSprite
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
                                    : dt === 'monopoly'
                                    ? '👑 Joacă Monopol'
                                    : dt === 'year_of_plenty'
                                    ? '🎁 Joacă Anul Abundenței'
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
                                    : dt === 'monopoly'
                                    ? () => {
                                        setActiveModal('play_monopoly');
                                      }
                                    : dt === 'year_of_plenty'
                                    ? () => {
                                        setActiveModal('play_year_of_plenty');
                                      }
                                    : undefined
                                }
                              />
                              <p className="card-gallery-rule-text" style={{ textAlign: 'center', margin: 0 }}>
                                {DEV_CARD_RULE_TEXT[locale][dt]}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MODAL SPECIAL: PLAY MONOPOLY - SELECT RESOURCE INTERACTIVELY */}
          {activeModal === 'play_monopoly' && activePlayerObj && (
            <div className="modal-backdrop" onClick={() => setActiveModal('dev_cards')}>
              <div className="modal-dialog" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--accent-gold)' }}>
                    👑 Declară Monopol
                  </h3>
                  <button type="button" className="btn" onClick={() => setActiveModal('dev_cards')}>
                    ✕ Înapoi
                  </button>
                </div>
                <div className="modal-body">
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '0.85rem' }}>
                    {locale === 'ro'
                      ? 'Alege resursa pe care dorești să o confunzi/confiști de la toți ceilalți jucători. Toți adversarii vor fi obligați să-ți cedeze toate cărțile de acest tip pe care le au în mână!'
                      : 'Choose the resource to monopolize. All opponents will be forced to yield all cards of this resource in their hand!'}
                  </p>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
                    {ALL_RESOURCES.map((r) => {
                      const isSelected = monopolyResource === r;
                      return (
                        <div
                          key={r}
                          onClick={() => setMonopolyResource(r)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            cursor: 'pointer',
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: isSelected ? '2px solid var(--accent-gold)' : '2px solid rgba(255,255,255,0.12)',
                            background: isSelected ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255,255,255,0.04)',
                            transform: isSelected ? 'scale(1.06)' : 'scale(1)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <ResourceCardSprite
                            resource={r}
                            count={activePlayerObj.resources[r] ?? 0}
                            locale={locale}
                            size="sm"
                            selected={isSelected}
                          />
                          <span
                            style={{
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              marginTop: 5,
                              color: isSelected ? 'var(--accent-gold)' : 'inherit'
                            }}
                          >
                            {RESOURCE_LABELS[locale][r]} {isSelected ? '✓' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.65rem', fontSize: '0.92rem', fontWeight: 700 }}
                    onClick={() => {
                      executeAction(activePlayerObj.id, {
                        type: 'play_monopoly',
                        resource: monopolyResource
                      });
                      setActiveModal('none');
                    }}
                  >
                    👑 Confiscă tot: {RESOURCE_LABELS[locale][monopolyResource].toUpperCase()}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL SPECIAL: PLAY YEAR OF PLENTY - SELECT 2 RESOURCES */}
          {activeModal === 'play_year_of_plenty' && activePlayerObj && (
            <div className="modal-backdrop" onClick={() => setActiveModal('dev_cards')}>
              <div className="modal-dialog" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--accent-gold)' }}>
                    🎁 Joacă: Anul Abundenței
                  </h3>
                  <button type="button" className="btn" onClick={() => setActiveModal('dev_cards')}>
                    ✕ Înapoi
                  </button>
                </div>
                <div className="modal-body">
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '0.6rem' }}>
                    {locale === 'ro'
                      ? 'Alege 2 resurse gratuite pe care le iei direct din bancă:'
                      : 'Choose 2 free resources to take directly from the bank:'}
                  </p>

                  {/* Own hand, so the choice can factor in what's already held — e.g. no need
                      to pick more of a resource already stockpiled. */}
                  <div style={{ marginBottom: '0.85rem' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>
                      {locale === 'ro' ? '🎴 Cărțile tale în mână:' : '🎴 Your cards in hand:'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {ALL_RESOURCES.map((r) => (
                        <ResourceCardSprite
                          key={r}
                          resource={r}
                          count={activePlayerObj.resources[r]}
                          locale={locale}
                          size="xs"
                        />
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                        {locale === 'ro' ? 'Prima resursă:' : 'First resource:'}
                      </span>
                      <select
                        value={yopResources[0]}
                        onChange={(e) => setYopResources([e.target.value as ResourceType, yopResources[1]])}
                        style={{ fontSize: '0.86rem', padding: '0.3rem 0.6rem' }}
                      >
                        {ALL_RESOURCES.map((r) => (
                          <option key={r} value={r}>
                            {RESOURCE_ICONS[r]} {RESOURCE_LABELS[locale][r]} ({gameState.bank[r]} în bancă)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                        {locale === 'ro' ? 'A doua resursă:' : 'Second resource:'}
                      </span>
                      <select
                        value={yopResources[1]}
                        onChange={(e) => setYopResources([yopResources[0], e.target.value as ResourceType])}
                        style={{ fontSize: '0.86rem', padding: '0.3rem 0.6rem' }}
                      >
                        {ALL_RESOURCES.map((r) => (
                          <option key={r} value={r}>
                            {RESOURCE_ICONS[r]} {RESOURCE_LABELS[locale][r]} ({gameState.bank[r]} în bancă)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.6rem', fontWeight: 700 }}
                    onClick={() => {
                      executeAction(activePlayerObj.id, {
                        type: 'play_year_of_plenty',
                        resources: yopResources
                      });
                      setActiveModal('none');
                    }}
                  >
                    🎁 Ia {RESOURCE_LABELS[locale][yopResources[0]]} + {RESOURCE_LABELS[locale][yopResources[1]]}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL A: STARTING ORDER — each player's opening 2d6 roll, highest goes first */}
          {activeModal === 'starting_order' && gameState?.startingOrderRolls && (
            <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
              <div className="modal-dialog" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>🎲 Cine Începe Partida</h3>
                  <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                    ✕ Închide
                  </button>
                </div>
                <div className="modal-body">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    Fiecare jucător a dat cu zarurile; cel mai mare total începe jocul.
                  </p>
                  {gameState.startingOrderRolls.map((roll, idx) => {
                    const p = getPlayerById(gameState, roll.playerId);
                    if (!p) return null;
                    return (
                      <div
                        key={roll.playerId}
                        className="candidate-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderColor: idx === 0 ? 'var(--accent-gold)' : undefined,
                          background: idx === 0 ? 'rgba(184, 134, 63, 0.14)' : undefined
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className="color-dot"
                            style={{ backgroundColor: p.color }}
                          />
                          <strong>
                            {idx + 1}. {p.name}
                          </strong>
                          {idx === 0 && (
                            <span style={{ color: 'var(--accent-gold-bright)', fontWeight: 700, fontSize: '0.78rem' }}>
                              Începe primul
                            </span>
                          )}
                        </span>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                          {roll.die1} + {roll.die2} = {roll.total}
                        </span>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '0.75rem', justifyContent: 'center' }}
                    onClick={() => setActiveModal('none')}
                  >
                    Să Începem!
                  </button>
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

                    {/* Port Quick-Trade Suggestions (e.g. 3 Wood + 2:1 Wood Port -> 1 Brick for Road) */}
                    {(() => {
                      const portRatioWood = getPlayerBankTradeRatio(gameState.board, activePlayerObj.id, 'wood');
                      const portRatioBrick = getPlayerBankTradeRatio(gameState.board, activePlayerObj.id, 'brick');
                      const portRatioOre = getPlayerBankTradeRatio(gameState.board, activePlayerObj.id, 'ore');
                      const portRatioWheat = getPlayerBankTradeRatio(gameState.board, activePlayerObj.id, 'wheat');

                      const suggestions: { label: string; give: ResourceType; giveAmount: number; receive: ResourceType }[] = [];

                      // Road suggestion: 1 Wood + 1 Brick needed
                      if (activePlayerObj.resources.wood >= portRatioWood + 1 && activePlayerObj.resources.brick === 0 && gameState.bank.brick >= 1) {
                        suggestions.push({
                          label: 'Ai Port la Lemn (' + portRatioWood + ':1) și ' + activePlayerObj.resources.wood + ' Lemn! Schimbă ' + portRatioWood + ' Lemn ➔ 1 Argilă pentru Drum',
                          give: 'wood',
                          giveAmount: portRatioWood,
                          receive: 'brick'
                        });
                      } else if (activePlayerObj.resources.brick >= portRatioBrick + 1 && activePlayerObj.resources.wood === 0 && gameState.bank.wood >= 1) {
                        suggestions.push({
                          label: 'Ai Port la Argilă (' + portRatioBrick + ':1) și ' + activePlayerObj.resources.brick + ' Argilă! Schimbă ' + portRatioBrick + ' Argilă ➔ 1 Lemn pentru Drum',
                          give: 'brick',
                          giveAmount: portRatioBrick,
                          receive: 'wood'
                        });
                      }

                      // City suggestion: 3 Ore + 2 Wheat needed
                      if (activePlayerObj.resources.ore >= portRatioOre + 3 && activePlayerObj.resources.wheat < 2 && gameState.bank.wheat >= 1) {
                        suggestions.push({
                          label: 'Schimbă ' + portRatioOre + ' Minereu ➔ 1 Grâu pentru Oraș',
                          give: 'ore',
                          giveAmount: portRatioOre,
                          receive: 'wheat'
                        });
                      }

                      if (suggestions.length === 0) return null;

                      return (
                        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--accent-gold)', borderRadius: 6, padding: '0.45rem 0.65rem', marginTop: '0.6rem' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--accent-gold)', marginBottom: 4 }}>
                            ⚓ Sugestii Rapide de Schimb la Porturi:
                          </div>
                          {suggestions.map((sug, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.78rem' }}>{sug.label}</span>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ fontSize: '0.74rem', padding: '0.2rem 0.5rem' }}
                                onClick={() => {
                                  executeAction(activePlayerObj.id, {
                                    type: 'trade_bank',
                                    give: sug.give,
                                    giveAmount: sug.giveAmount,
                                    receive: sug.receive
                                  });
                                }}
                              >
                                Schimbă Rapid la Port
                              </button>
                            </div>
                          ))}
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
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, marginBottom: 2 }}>
                          {ALL_RESOURCES.map((r) => (
                            <ResourceCardSprite
                              key={r}
                              resource={r}
                              count={activePlayerObj.resources[r]}
                              locale={locale}
                              size="xs"
                            />
                          ))}
                        </div>
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

          {/* COUNTER-OFFER MODAL: a responder putting their own terms on the table instead of
              the flat accept/reject the original offer forced on them - keyed off viewerPlayerObj
              (not activePlayerObj, since the person countering usually isn't the active player,
              which is exactly why they couldn't just reuse the main trade modal above). */}
          {activeModal === 'counter_trade' && counterOfferOriginalId && viewerPlayerObj && (() => {
            const originalOffer = gameState.activeTradeOffers.find((o) => o.id === counterOfferOriginalId);
            const originalProposer = originalOffer ? getPlayerById(gameState, originalOffer.fromPlayerId) : undefined;
            const closeCounterModal = () => {
              setActiveModal('none');
              setCounterOfferOriginalId(null);
              setP2pOffer(createEmptyResources());
              setP2pRequest(createEmptyResources());
            };
            if (!originalOffer || originalOffer.status !== 'open') {
              // The offer resolved/expired while this modal was open (e.g. someone else
              // accepted it first) - nothing left to counter.
              return (
                <div className="modal-backdrop" onClick={closeCounterModal}>
                  <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                    <div className="modal-body" style={{ textAlign: 'center', padding: '1.2rem' }}>
                      <p>
                        {locale === 'ro'
                          ? 'Oferta originală nu mai este activă.'
                          : 'The original offer is no longer active.'}
                      </p>
                      <button type="button" className="btn btn-primary" onClick={closeCounterModal}>
                        {locale === 'ro' ? 'Închide' : 'Close'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div className="modal-backdrop" onClick={closeCounterModal}>
                <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      🔄 {locale === 'ro' ? 'Contra-ofertă către' : 'Counter-offer to'}{' '}
                      <span style={playerBadgeStyle(originalProposer?.color)}>
                        {originalProposer?.name ?? originalOffer.fromPlayerId}
                      </span>
                    </h3>
                    <button type="button" className="btn" onClick={closeCounterModal}>
                      ✕ {locale === 'ro' ? 'Închide' : 'Close'}
                    </button>
                  </div>
                  <div className="modal-body">
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        marginBottom: '0.75rem',
                        textAlign: 'center'
                      }}
                    >
                      {locale === 'ro'
                        ? 'Oferta lor: oferă'
                        : 'Their offer: offers'}{' '}
                      {ALL_RESOURCES.filter((r) => originalOffer.offering[r] > 0)
                        .map((r) => `${RESOURCE_ICONS[r]}${originalOffer.offering[r]}`)
                        .join(' ')}{' '}
                      · {locale === 'ro' ? 'cere' : 'asks'}{' '}
                      {ALL_RESOURCES.filter((r) => originalOffer.requesting[r] > 0)
                        .map((r) => `${RESOURCE_ICONS[r]}${originalOffer.requesting[r]}`)
                        .join(' ')}
                      {' — '}
                      {locale === 'ro'
                        ? 'alege mai jos ce vrei TU să oferi/ceri în loc:'
                        : 'pick what YOU want to offer/ask instead below:'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                      <div>
                        <strong style={{ fontSize: '0.8rem' }}>
                          {locale === 'ro' ? 'Oferi din mână:' : 'You offer:'}
                        </strong>
                        {ALL_RESOURCES.map((r) => (
                          <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontSize: '0.8rem' }}>
                              {RESOURCE_ICONS[r]} {RESOURCE_LABELS[locale][r]}: <strong>{p2pOffer[r]}</strong>
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => setP2pOffer({ ...p2pOffer, [r]: Math.max(0, p2pOffer[r] - 1) })}
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setP2pOffer({
                                    ...p2pOffer,
                                    [r]: Math.min(viewerPlayerObj.resources[r], p2pOffer[r] + 1)
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
                        <strong style={{ fontSize: '0.8rem' }}>
                          {locale === 'ro' ? 'Ceri la schimb:' : 'You ask for:'}
                        </strong>
                        {ALL_RESOURCES.map((r) => (
                          <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontSize: '0.8rem' }}>
                              {RESOURCE_ICONS[r]} {RESOURCE_LABELS[locale][r]}: <strong>{p2pRequest[r]}</strong>
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => setP2pRequest({ ...p2pRequest, [r]: Math.max(0, p2pRequest[r] - 1) })}
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => setP2pRequest({ ...p2pRequest, [r]: p2pRequest[r] + 1 })}
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
                      style={{ marginTop: '0.75rem', width: '100%' }}
                      disabled={totalResourceCount(p2pOffer) === 0 || totalResourceCount(p2pRequest) === 0}
                      onClick={() => {
                        executeAction(viewerId, {
                          type: 'counter_trade',
                          offerId: originalOffer.id,
                          offering: p2pOffer,
                          requesting: p2pRequest
                        });
                        closeCounterModal();
                      }}
                    >
                      {locale === 'ro' ? 'Trimite Contra-oferta' : 'Send Counter-offer'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

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
                          {formatActionDescription(ev.action, locale, ev.details)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODAL D: BUILDING COSTS REFERENCE (/cost.jpg) */}
          {activeModal === 'costs_help' && (() => {
            // Built from BUILDING_COSTS directly (always matches the real rules, in whatever
            // language is active) rather than a baked-in reference image - cost.jpg had no
            // Romanian or English version, only Spanish ("Carretera", "Poblado"...), which a
            // flat image can't fix per-locale the way every other card in the game already
            // shows translated text: blank/textless art with the label drawn separately.
            const rows: { key: string; label: string; cost: ResourceCount; vp: string }[] = [
              { key: 'road', label: locale === 'ro' ? 'Drum' : 'Road', cost: BUILDING_COSTS.road, vp: '0 VP' },
              ...(gameState && isScenarioWithShips(gameState.rules.boardScenario)
                ? [{ key: 'ship', label: locale === 'ro' ? 'Navă' : 'Ship', cost: BUILDING_COSTS.ship, vp: '0 VP' }]
                : []),
              { key: 'settlement', label: locale === 'ro' ? 'Așezare' : 'Settlement', cost: BUILDING_COSTS.settlement, vp: '1 VP' },
              { key: 'city', label: locale === 'ro' ? 'Oraș' : 'City', cost: BUILDING_COSTS.city, vp: '2 VP' },
              { key: 'dev_card', label: locale === 'ro' ? 'Carte de Dezvoltare' : 'Development Card', cost: BUILDING_COSTS.dev_card, vp: locale === 'ro' ? '? VP (variază)' : '? VP (varies)' }
            ];
            return (
              <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
                <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>📋 {locale === 'ro' ? 'Tabel Costuri Construcții & Puncte de Victorie' : 'Building Costs & Victory Point Table'}</h3>
                    <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                      ✕ {locale === 'ro' ? 'Închide' : 'Close'}
                    </button>
                  </div>
                  <div className="modal-body">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {rows.map((row) => (
                        <div
                          key={row.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            background: 'var(--bg-inset)',
                            border: '1px solid var(--border-color-soft)',
                            borderRadius: 8,
                            padding: '0.5rem 0.75rem'
                          }}
                        >
                          <strong style={{ minWidth: 150 }}>{row.label}</strong>
                          <div style={{ display: 'flex', gap: 10, flex: 1, justifyContent: 'center' }}>
                            {ALL_RESOURCES.filter((r) => row.cost[r] > 0).map((r) => (
                              <span key={r} style={{ fontSize: '0.86rem' }}>
                                {RESOURCE_ICONS[r]} {row.cost[r]}
                              </span>
                            ))}
                          </div>
                          <span style={{ color: 'var(--accent-gold)', fontWeight: 700, minWidth: 70, textAlign: 'right' }}>
                            {row.vp}
                          </span>
                        </div>
                      ))}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                        {locale === 'ro'
                          ? '🛣️ Drumul cel mai Lung (min. 5 drumuri): +2 VP  ·  ⚔️ Armata cea mai Mare (min. 3 Cavaleri): +2 VP'
                          : '🛣️ Longest Road (5+ roads): +2 VP  ·  ⚔️ Largest Army (3+ Knights): +2 VP'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* AUTOMATIC MODAL E: DISCARD CARDS ON 7 ROLL (>7 cards) */}
          {gameState.phase === 'discard_resources' &&
            Object.keys(gameState.pendingDiscards).map((discardPid) => {
              const p = getPlayerById(gameState, discardPid);
              if (!p || p.type !== 'human') return null;
              // Online: only ever show MY OWN discard prompt — other humans' hands aren't
              // known here, and they discard from their own device anyway.
              if (onlineSession && discardPid !== viewerId) return null;
              const needed = gameState.pendingDiscards[discardPid] ?? 0;
              const currentSelected = totalResourceCount(discardSelection);
              if (minimizedDiscard) {
                return (
                  <div
                    key={discardPid}
                    style={{
                      position: 'fixed',
                      top: 56,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 100,
                      background: 'var(--bg-panel)',
                      border: '1.5px solid var(--accent-red)',
                      borderRadius: 8,
                      padding: '0.45rem 0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
                    }}
                  >
                    <span style={{ color: 'var(--accent-red)', fontWeight: 700, fontSize: '0.85rem' }}>
                      ⚠️ S-a dat 7! {p.name}: Decartează {needed} cărți ({currentSelected}/{needed})
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.8rem' }}
                      onClick={() => setMinimizedDiscard(false)}
                    >
                      Alege Cărți
                    </button>
                  </div>
                );
              }

              return (
                <div key={discardPid} className="modal-backdrop">
                  <div className="modal-dialog" style={{ borderColor: 'var(--accent-red)' }}>
                    <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ color: 'var(--accent-red)', margin: 0, fontSize: '0.98rem' }}>
                        ⚠️ S-a dat 7! {p.name} trebuie să decarteze {needed} cărți ({currentSelected}/{needed})
                      </h3>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.78rem' }}
                        title="Minimizează pentru a analiza harta"
                        onClick={() => setMinimizedDiscard(true)}
                      >
                        👁️ Vezi Harta
                      </button>
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

          {/* AUTOMATIC MODAL F: STEAL RESOURCE TARGET SELECTION - shows each candidate's own
              card (VP, resource/dev-card counts, pieces...) same as the sidebar, since the
              board behind this modal is dimmed/blurred and isn't a usable reference while
              deciding; sourced from playerView (not gameState directly) so an online opponent's
              hidden resource count shows correctly instead of the local adapter's 0 placeholder. */}
          {gameState.phase === 'steal_resource' && isHumanTurn && (
            <div className="modal-backdrop">
              <div className="modal-dialog" style={{ maxWidth: 480 }}>
                <div className="modal-header">
                  <h3>🥷 Alege adversarul de la care furi 1 resursă</h3>
                </div>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {(gameState.robberContext?.eligibleTargetIds ?? []).map((tId) => {
                    const tp = playerView?.players.find((p) => p.id === tId) ?? getPlayerById(gameState, tId);
                    if (!tp) return null;
                    const score = 'publicScore' in tp ? (tp.totalScore ?? tp.publicScore) : calculateScore(gameState, tId).publicScore;
                    const resCount = 'resourceCount' in tp ? tp.resourceCount : totalResourceCount(tp.resources);
                    const devCount = 'devCardCount' in tp ? tp.devCardCount : tp.devCards.filter((c) => !c.played).length;
                    return (
                      <button
                        key={tId}
                        type="button"
                        className="btn"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          background: 'var(--bg-inset)',
                          border: '1px solid var(--border-color-soft)',
                          textAlign: 'left'
                        }}
                        onClick={() =>
                          executeAction(gameState.activePlayerId, {
                            type: 'steal_from_player',
                            targetPlayerId: tId
                          })
                        }
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="color-dot" style={{ backgroundColor: tp.color, width: 12, height: 12 }} />
                          <strong>{tp.name}</strong>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>{score} VP</span>
                          <span title={locale === 'ro' ? 'Cărți de resurse în mână' : 'Resource cards in hand'}>🎴 {resCount}</span>
                          <span title={locale === 'ro' ? 'Cărți de dezvoltare nejucate' : 'Unplayed dev cards'}>🃏 {devCount}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* INCOMING TRADE OFFER FOR HUMAN PLAYER (Allows Accept, Reject, Counter-Offer) */}
          {(() => {
            const incomingOffer = gameState.activeTradeOffers.find(
              (o) =>
                o.status === 'open' &&
                o.fromPlayerId !== viewerId &&
                (!o.toPlayerId || o.toPlayerId === viewerId) &&
                !o.rejectedByPlayerIds.includes(viewerId) &&
                !dismissedTradeOfferIds.has(o.id)
            );
            if (!incomingOffer) return null;
            // The counter-offer modal (below) is answering this exact offer - don't stack both.
            if (activeModal === 'counter_trade' && counterOfferOriginalId === incomingOffer.id) return null;
            const proposer = getPlayerById(gameState, incomingOffer.fromPlayerId);
            const myRes = viewerPlayerObj?.resources ?? createEmptyResources();
            const canAfford = hasResources(myRes, incomingOffer.requesting);
            // A player who can't afford to accept is never forced into the transaction with a
            // blocking modal anymore - they see the non-blocking negotiation banner below
            // instead (which still lets them reject), and are free to keep acting.
            if (!canAfford) return null;

            return (
              <div
                className="modal-backdrop"
                onClick={() => dismissTradeOffer(incomingOffer.id, 'Fereastră închisă')}
              >
                <div
                  className="modal-dialog"
                  style={{ maxWidth: 500, borderColor: 'var(--accent-gold)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="modal-header"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span
                        className="color-dot"
                        style={{ backgroundColor: proposer?.color ?? 'var(--accent-gold)', width: 13, height: 13 }}
                      />
                      Ofertă de Schimb de la{' '}
                      <span style={playerBadgeStyle(proposer?.color)}>
                        {proposer?.name ?? incomingOffer.fromPlayerId}
                      </span>
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!canAfford && (
                        <span
                          style={{
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: '0.78rem',
                            fontWeight: 700
                          }}
                        >
                          ⚠️ Resurse insuficiente
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.82rem' }}
                        title="Închide / Refuză oferta"
                        onClick={() => dismissTradeOffer(incomingOffer.id, 'Fereastră închisă')}
                      >
                        ✕ Închide
                      </button>
                    </div>
                  </div>
                  <div className="modal-body">
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.85rem',
                        marginBottom: '1rem'
                      }}
                    >
                      <div
                        style={{
                          background: 'rgba(34, 197, 94, 0.12)',
                          padding: '0.6rem',
                          borderRadius: 8,
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        }}
                      >
                        <h4 style={{ color: '#4ade80', fontSize: '0.84rem', margin: '0 0 0.4rem 0' }}>
                          Primești (îți oferă):
                        </h4>
                        {ALL_RESOURCES.filter((r) => incomingOffer.offering[r] > 0).map((r) => (
                          <div key={r} style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: 2 }}>
                            {RESOURCE_ICONS[r]} {incomingOffer.offering[r]}x {RESOURCE_LABELS[locale][r]}
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          background: 'rgba(239, 68, 68, 0.12)',
                          padding: '0.6rem',
                          borderRadius: 8,
                          border: '1px solid rgba(239, 68, 68, 0.3)'
                        }}
                      >
                        <h4 style={{ color: '#f87171', fontSize: '0.84rem', margin: '0 0 0.4rem 0' }}>
                          Dai (îți cere):
                        </h4>
                        {ALL_RESOURCES.filter((r) => incomingOffer.requesting[r] > 0).map((r) => (
                          <div key={r} style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: 2 }}>
                            {RESOURCE_ICONS[r]} {incomingOffer.requesting[r]}x {RESOURCE_LABELS[locale][r]}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resursele din mână ale jucătorului receptor */}
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: 8,
                        padding: '0.6rem 0.65rem',
                        marginBottom: '0.85rem'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.45rem'
                        }}
                      >
                        <h4 style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                          {locale === 'ro' ? '🃏 Cărțile tale în mână:' : '🃏 Your cards in hand:'}
                        </h4>
                        <span style={{ fontSize: '0.78rem', opacity: 0.75 }}>
                          {Object.values(myRes).reduce((a, b) => a + b, 0)}{' '}
                          {locale === 'ro' ? 'cărți în total' : 'cards total'}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          justifyContent: 'center',
                          flexWrap: 'wrap'
                        }}
                      >
                        {ALL_RESOURCES.map((r) => {
                          const count = myRes[r] ?? 0;
                          const req = incomingOffer.requesting[r] ?? 0;
                          const off = incomingOffer.offering[r] ?? 0;
                          const isRequested = req > 0;
                          const isOffered = off > 0;
                          const hasEnough = count >= req;

                          return (
                            <div
                              key={r}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                position: 'relative'
                              }}
                            >
                              <ResourceCardSprite
                                resource={r}
                                count={count}
                                locale={locale}
                                size="sm"
                                selected={isRequested}
                              />
                              {isRequested && (
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    marginTop: 3,
                                    padding: '1px 4px',
                                    borderRadius: 4,
                                    background: hasEnough
                                      ? 'rgba(34, 197, 94, 0.22)'
                                      : 'rgba(239, 68, 68, 0.25)',
                                    color: hasEnough ? '#4ade80' : '#f87171',
                                    border: `1px solid ${hasEnough ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.5)'}`,
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={hasEnough ? `Deții ${count} din ${req} cerute` : `Îți lipsesc ${req - count} resurse`}
                                >
                                  {hasEnough ? (req === 1 ? 'cere 1' : `cere ${req}`) : `lipsesc ${req - count}`}
                                </span>
                              )}
                              {isOffered && !isRequested && (
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    marginTop: 3,
                                    padding: '1px 4px',
                                    borderRadius: 4,
                                    background: 'rgba(59, 130, 246, 0.2)',
                                    color: '#60a5fa',
                                    border: '1px solid rgba(59, 130, 246, 0.4)',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={`Vei primi +${off}`}
                                >
                                  +{off}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {!canAfford && (
                      <div
                        style={{
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: 8,
                          padding: '0.6rem 0.75rem',
                          textAlign: 'center',
                          marginBottom: '0.85rem'
                        }}
                      >
                        <div
                          style={{
                            color: '#f87171',
                            fontSize: '0.84rem',
                            fontWeight: 700,
                            marginBottom: 4
                          }}
                        >
                          ⚠️ Nu ai în mână toate resursele cerute pentru a accepta acest schimb.
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!canAfford}
                        onClick={() => {
                          setDismissedTradeOfferIds((prev) => new Set(prev).add(incomingOffer.id));
                          executeAction(viewerId, {
                            type: 'respond_trade',
                            offerId: incomingOffer.id,
                            response: 'accept'
                          });
                        }}
                      >
                        ✅ Acceptă Schimbul
                      </button>
                      {/* Split Reject Button with Reason Dropdown */}
                      <div style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            borderColor: 'rgba(239, 68, 68, 0.5)',
                            color: '#fca5a5',
                            borderTopRightRadius: 0,
                            borderBottomRightRadius: 0,
                            borderRight: '1px solid rgba(239, 68, 68, 0.3)'
                          }}
                          onClick={() => {
                            setRejectDropdownOfferId(null);
                            dismissTradeOffer(incomingOffer.id, 'Refuz');
                          }}
                          title={locale === 'ro' ? 'Refuză oferta (rapid)' : 'Reject offer (quick)'}
                        >
                          ❌ {locale === 'ro' ? 'Refuză' : 'Reject'}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            background: 'rgba(239, 68, 68, 0.25)',
                            borderColor: 'rgba(239, 68, 68, 0.5)',
                            color: '#fca5a5',
                            borderTopLeftRadius: 0,
                            borderBottomLeftRadius: 0,
                            padding: '0 0.55rem',
                            fontSize: '0.82rem',
                            fontWeight: 700
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRejectDropdownOfferId((curr) => (curr === incomingOffer.id ? null : incomingOffer.id));
                          }}
                          title={locale === 'ro' ? 'Alege motivul refuzului' : 'Select reason for refusal'}
                        >
                          ▾
                        </button>

                        {rejectDropdownOfferId === incomingOffer.id && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '115%',
                              right: 0,
                              zIndex: 120,
                              background: '#132337',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              borderRadius: 8,
                              padding: '6px',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                              minWidth: 220,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '2px 6px', fontWeight: 600 }}>
                              {locale === 'ro' ? 'Motivul refuzului:' : 'Reason for decline:'}
                            </div>
                            {[
                              { label: locale === 'ro' ? '🚫 Nu am resursa cerută' : '🚫 Missing requested resource', reason: 'Nu am resursa cerută' },
                              { label: locale === 'ro' ? '🔒 Nu pot să dau' : '🔒 Cannot give', reason: 'Nu pot să dau' },
                              { label: locale === 'ro' ? '❌ Refuz' : '❌ Just decline', reason: 'Refuz' },
                              { label: locale === 'ro' ? '⚖️ Prea scump' : '⚖️ Too expensive', reason: 'Prea scump' }
                            ].map((item) => (
                              <button
                                key={item.reason}
                                type="button"
                                className="btn"
                                style={{
                                  textAlign: 'left',
                                  fontSize: '0.78rem',
                                  padding: '0.35rem 0.6rem',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  borderColor: 'transparent',
                                  color: '#e2e8f0',
                                  justifyContent: 'flex-start',
                                  width: '100%'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                  e.currentTarget.style.borderColor = 'transparent';
                                }}
                                onClick={() => {
                                  setRejectDropdownOfferId(null);
                                  dismissTradeOffer(incomingOffer.id, item.reason);
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn"
                        style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
                        onClick={() => {
                          // Don't reject yet - only the actual counter_trade submission below
                          // closes this offer (see counter_trade's engine handling: it rejects
                          // the original AND opens the new one in one atomic action). Canceling
                          // out of the counter-offer modal should leave the original untouched.
                          setP2pOffer(createEmptyResources());
                          setP2pRequest(createEmptyResources());
                          setCounterOfferOriginalId(incomingOffer.id);
                          setActiveModal('counter_trade');
                        }}
                      >
                        🔄 Negociază / Contra-ofertă
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TRADE NEGOTIATION BANNER - shows every player (proposer, an unaffordable or
              uninvolved responder, or any onlooker) who's negotiating, what's offered/wanted,
              and whether it's been accepted or refused yet. Non-blocking (unlike the accept/
              reject modal above, which only ever shows to a responder who can actually accept),
              colored by each player's board color, and kept up for a 5s floor by
              visibleTradeOffers regardless of how fast the offer itself resolves. */}
          {(() => {
            const nameStyle = playerBadgeStyle;
            const resourceList = (counts: ResourceCount) =>
              ALL_RESOURCES.filter((r) => counts[r] > 0)
                .map((r) => `${RESOURCE_ICONS[r]}${counts[r]}`)
                .join(' ');

            const entry = Object.values(visibleTradeOffers)
              .sort((a, b) => b.firstShownAtMs - a.firstShownAtMs)
              .find(({ offer }) => !dismissedTradeOfferIds.has(offer.id));
            if (!entry) return null;
            const { offer } = entry;
            const proposer = getPlayerById(gameState, offer.fromPlayerId);
            const target = offer.toPlayerId ? getPlayerById(gameState, offer.toPlayerId) : undefined;
            const accepter = offer.acceptedByPlayerId ? getPlayerById(gameState, offer.acceptedByPlayerId) : undefined;
            const isProposer = offer.fromPlayerId === viewerId;

            let statusNode: React.ReactNode;
            if (offer.status === 'accepted') {
              statusNode = (
                <span style={{ color: '#4ade80', fontWeight: 700 }}>
                  ✅ Acceptat de <span style={nameStyle(accepter?.color)}>{accepter?.name ?? offer.acceptedByPlayerId}</span>!
                </span>
              );
            } else if (offer.status === 'rejected' || (offer.status === 'open' && offer.rejectedByPlayerIds.length > 0 && !target)) {
              statusNode = (
                <span style={{ color: offer.status === 'rejected' ? '#f87171' : 'var(--text-muted)' }}>
                  {offer.status === 'rejected' ? '❌ Refuzată de toți' : `⏳ Se negociază... (${offer.rejectedByPlayerIds.length} refuz${offer.rejectedByPlayerIds.length === 1 ? '' : 'uri'} până acum)`}
                </span>
              );
            } else if (offer.status === 'open') {
              statusNode = <span style={{ color: 'var(--text-muted)' }}>⏳ Se negociază{target ? <> cu <span style={nameStyle(target.color)}>{target.name}</span></> : ' cu oricine'}...</span>;
            } else {
              statusNode = <span style={{ color: 'var(--text-muted)' }}>⌛ {offer.status === 'cancelled' ? 'Retrasă' : 'Expirată'}</span>;
            }

            const dismiss = () => setDismissedTradeOfferIds((prev) => new Set(prev).add(offer.id));

            return (
              <div
                style={{
                  position: 'fixed',
                  top: 56,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 85,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--accent-gold)',
                  borderRadius: 8,
                  padding: '0.55rem 0.9rem',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                  maxWidth: '94vw',
                  width: 440,
                  textAlign: 'center'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.84rem', marginBottom: 3 }}>
                  🤝 {isProposer ? 'Oferta ta de schimb' : (
                    <>
                      <span style={nameStyle(proposer?.color)}>{proposer?.name ?? offer.fromPlayerId}</span> propune un schimb
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, margin: '6px 0' }}>
                  <div
                    style={{
                      flex: 1,
                      background: 'rgba(34, 197, 94, 0.14)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      borderRadius: 8,
                      padding: '0.4rem 0.3rem'
                    }}
                  >
                    <div style={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase' }}>oferă</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{resourceList(offer.offering) || '—'}</div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: 'rgba(239, 68, 68, 0.14)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: 8,
                      padding: '0.4rem 0.3rem'
                    }}
                  >
                    <div style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase' }}>cere</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{resourceList(offer.requesting) || '—'}</div>
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', marginBottom: 2 }}>{statusNode}</div>
                {offer.rejectedByPlayerIds.length > 0 && offer.status !== 'rejected' && (
                  <div style={{ fontSize: '0.74rem', color: '#fca5a5', margin: '4px 0', textAlign: 'left' }}>
                    {offer.rejectedByPlayerIds.map((rId) => {
                      const rp = getPlayerById(gameState, rId);
                      const reason = offer.rejectionReasons?.[rId];
                      return (
                        <div key={rId} style={{ marginTop: 2 }}>
                          ❌ <span style={nameStyle(rp?.color)}>{rp?.name ?? rId}</span> a refuzat{reason ? ': "' + reason + '"' : ''}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6 }}>
                  {isProposer && offer.status === 'open' && (
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '0.76rem', padding: '0.2rem 0.55rem', borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
                      onClick={() => {
                        cancelMyTradeOffer(offer.id);
                        setActiveModal('trade');
                      }}
                    >
                      🔄 Negociază / Schimbă Oferta
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: '0.76rem', padding: '0.2rem 0.55rem' }}
                    onClick={() => {
                      if (isProposer && offer.status === 'open') cancelMyTradeOffer(offer.id);
                      dismiss();
                    }}
                  >
                    ✕ Ascunde
                  </button>
                </div>
              </div>
            );
          })()}

          {/* AUTOMATIC MODAL G: GAME OVER & SAVED FOR LATER ANALYSIS */}
          {gameState.winnerId && (() => {
            const winner = getPlayerById(gameState, gameState.winnerId);
            const scoreInfo = calculateScore(gameState, gameState.winnerId);
            let settlementCount = 0;
            let cityCount = 0;
            for (const b of Object.values(gameState.board.buildings)) {
              if (b.ownerId === gameState.winnerId) {
                if (b.type === 'city') cityCount++;
                else settlementCount++;
              }
            }
            const hasLongestRoad = gameState.longestRoadOwnerId === gameState.winnerId;
            const hasLargestArmy = gameState.largestArmyOwnerId === gameState.winnerId;

            return (
              <div className="modal-backdrop">
                <Confetti />
                <div className="modal-dialog" style={{ maxWidth: 540, textAlign: 'center' }}>
                  <div className="modal-header">
                    <h3>🎉 Partidă Finalizată & Salvată Automat!</h3>
                  </div>
                  <div className="modal-body">
                    <h2 style={{ color: 'var(--accent-gold)', marginBottom: '0.4rem' }}>
                      🏆 {winner?.name}{' '}
                      {locale === 'ro' ? 'a câștigat partida!' : 'won the game!'}
                    </h2>

                    {/* Winner Points Breakdown */}
                    <div
                      style={{
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid var(--accent-gold)',
                        borderRadius: 8,
                        padding: '0.75rem',
                        margin: '0.75rem 0',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--accent-gold)', marginBottom: 6, textAlign: 'center', fontSize: '0.95rem' }}>
                        📊 Detaliu Puncte de Victorie (Total: {scoreInfo.totalScore} / {gameState.rules.victoryPointsToWin} VP)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.84rem' }}>
                        <div>🏠 {settlementCount}x Așezări: <strong>+{settlementCount} VP</strong></div>
                        <div>🏰 {cityCount}x Orașe: <strong>+{cityCount * 2} VP</strong></div>
                        {hasLongestRoad && <div>🛣️ Drumul cel mai lung: <strong>+2 VP</strong></div>}
                        {hasLargestArmy && <div>⚔️ Armata cea mai mare: <strong>+2 VP</strong></div>}
                        {scoreInfo.hiddenVictoryPoints > 0 && (
                          <div style={{ color: '#4ade80', fontWeight: 600 }}>
                            🏆 {scoreInfo.hiddenVictoryPoints}x Punct de Victorie: <strong>+{scoreInfo.hiddenVictoryPoints} VP</strong>
                          </div>
                        )}
                      </div>
                      {scoreInfo.hiddenVictoryPoints > 0 && (
                        <div style={{ marginTop: 8, fontSize: '0.82rem', color: '#4ade80', background: 'rgba(34, 197, 94, 0.15)', padding: '0.4rem 0.6rem', borderRadius: 4, textAlign: 'center', fontWeight: 600 }}>
                          ✨ Victoria a fost decisă prin tragerea cărții de dezvoltare: 🏆 Punct de Victorie!
                        </div>
                      )}
                    </div>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '1rem' }}>
                      Partida ({gameState.gameId}) a fost salvată automat în Istoricul Partidelor pentru analiză pas-cu-pas, evaluarea deciziilor și statistici.
                    </p>
                    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openGameReplay(gameState.gameId)}
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
            );
          })()}
        </main>
      )}

      {/* SPECTATOR MODE: full-height layout with unclipped board and explicit live turn status */}
      {activeTab === 'spectate' && (
        <main className="lobby-container" style={{ height: 'calc(100vh - 58px)', minHeight: 0, padding: '0.5rem 0.75rem' }}>
          <section className="panel" style={{ flex: '2 1 0', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.5rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
                  👁️ {locale === 'ro' ? 'Mod Spectator' : 'Spectator Mode'}
                </h2>
                {spectateGameId && (
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    ({spectateGameId})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {spectateGameId && (
                  spectateTerminationDismissed ? (
                    <span style={{ fontSize: '0.78rem', color: '#4ade80', fontWeight: 600, padding: '0.25rem 0.5rem', background: 'rgba(34,197,94,0.15)', borderRadius: 4 }}>
                      🛡️ {locale === 'ro' ? 'Oprire refuzată de jucători' : 'Termination dismissed'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={async () => {
                        if (!window.confirm('Sigur dorești să oprești definitiv această partidă pe server?')) return;
                        try {
                          const targetGid = spectateGameId;
                          const res = await terminateOnlineGame(targetGid);
                          if ((res as any).pendingConfirmation) {
                            alert(locale === 'ro'
                              ? 'A fost trimisă o cerere de confirmare către jucătorii din partidă. Dacă aceștia refuză, partida va continua. Dacă nu răspund în 30 de secunde, partida se va închide automat.'
                              : 'Termination request sent to players (30s timeout).');
                          } else {
                            setPublicLobbies((prev) => prev.filter((l) => l.gameId !== targetGid));
                            handleStopSpectating();
                            listPublicLobbies().then((lobbies) => setPublicLobbies(lobbies)).catch(() => {});
                          }
                        } catch (err) {
                          alert(err instanceof Error ? err.message : 'Eroare la oprirea partidei');
                        }
                      }}
                    >
                      ⏹️ {locale === 'ro' ? 'Oprește Partida' : 'Stop Game'}
                    </button>
                  )
                )}
                <button type="button" className="btn" onClick={handleStopSpectating}>
                  ✕ {locale === 'ro' ? 'Părăsește' : 'Leave'}
                </button>
              </div>
            </div>

            {spectateError && (
              <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '0.6rem', fontWeight: 600 }}>
                ⚠️ {spectateError}
              </div>
            )}

            {!spectateView ? (
              <div style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>
                {locale === 'ro' ? 'Se încarcă partida...' : 'Loading game...'}
              </div>
            ) : (
              <>
                {(() => {
                  const activeP = spectateView.players.find((p) => p.id === spectateView.activePlayerId);
                  const openOffer = spectateView.activeTradeOffers?.find((o) => o.status === 'open');
                  return (
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', fontSize: '0.84rem', flexShrink: 0 }}>
                      <span><strong>{locale === 'ro' ? 'Tura' : 'Turn'} {spectateView.turn}</strong></span>
                      <span>·</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>{locale === 'ro' ? 'La rând:' : 'Turn:'}</span>
                        {activeP && (
                          <span
                            className="color-dot"
                            style={{ backgroundColor: activeP.color, width: 10, height: 10, display: 'inline-block' }}
                          />
                        )}
                        <strong>{activeP?.name ?? spectateView.activePlayerId}</strong>
                        <span style={{ color: 'var(--text-muted)' }}>
                          ({getExplicitTurnStatusDescription(spectateView.phase, activeP?.name ?? '', openOffer, locale)})
                        </span>
                      </div>
                      {spectateView.lastDiceRoll && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--accent-gold)' }}>
                            🎲 {spectateView.lastDiceRoll.die1} + {spectateView.lastDiceRoll.die2} = {spectateView.lastDiceRoll.total}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })()}
                <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', position: 'relative' }}>
                  <BoardSvg
                    board={spectateView.board}
                    playerColors={Object.fromEntries(spectateView.players.map((p) => [p.id, p.color]))}
                    locale={locale}
                  />
                </div>
              </>
            )}
          </section>

          {spectateView && (
            <section className="panel" style={{ flex: '1 1 320px' }}>
              <h2>👥 {locale === 'ro' ? 'Jucători' : 'Players'}</h2>
              <div className="score-bank-grid">
                {spectateView.players.map((p) => {
                  const isCurrent = spectateView.activePlayerId === p.id;
                  const hasLongestRoad = spectateView.longestRoadOwnerId === p.id;
                  const hasLargestArmy = spectateView.largestArmyOwnerId === p.id;
                  return (
                    <div key={p.id} className={`player-grid-card ${isCurrent ? 'active-turn' : ''}`}>
                      {isCurrent && <span className="player-grid-turn-badge">⚡ {locale === 'ro' ? 'La rând' : 'Turn'}</span>}
                      <div className="player-grid-header">
                        <div className="player-grid-title">
                          <span className="color-dot" style={{ backgroundColor: p.color, width: 12, height: 12 }} />
                          <span className="player-grid-name">{p.name}</span>
                          <span className="player-grid-type">{p.type.toUpperCase()}</span>
                        </div>
                        <span className="player-grid-score">
                          {p.totalScore !== undefined ? `${p.totalScore} VP` : `${p.publicScore} VP`}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.2rem 0' }}>
                        🎴 {p.resourceCount} {locale === 'ro' ? 'resurse' : 'cards'} · 🃏 {p.devCardCount} {locale === 'ro' ? 'dezvoltare' : 'dev'}
                      </div>
                      <div className="player-grid-stats">
                        <div className="player-grid-pieces">
                          {(
                            [
                              ['settlements', '🏠'] as const,
                              ['cities', '🏰'] as const,
                              ['roads', '🛣️'] as const,
                              ...(p.remainingPieces.ships !== undefined
                                ? [['ships', '⛵'] as const]
                                : [])
                            ]
                          ).map(([key, icon]) => {
                            const total = INITIAL_PLAYER_PIECES[key];
                            const used = total - (p.remainingPieces[key] ?? 0);
                            const exhausted = used >= total;
                            return (
                              <span key={key} className={`piece-count-pill ${exhausted ? 'exhausted' : ''}`}>
                                {icon} {used}/{total}
                              </span>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>🏆 {locale === 'ro' ? 'Drum' : 'Road'}: {p.longestRoadLength}</span>
                          <span>⚔️ {p.knightsPlayed}</span>
                        </div>
                        {(hasLongestRoad || hasLargestArmy) && (
                          <div className="player-grid-badges">
                            {hasLongestRoad && <span className="achievement-badge">🏅 +2</span>}
                            {hasLargestArmy && <span className="achievement-badge">🛡️ +2</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: '#0d1a29', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--border-color)', marginTop: '0.65rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '0.3rem' }}>
                  🏦 {locale === 'ro' ? 'Stoc Bancă' : 'Bank Stock'}
                </div>
                <div className="bank-single-row" style={{ margin: 0 }}>
                  {ALL_RESOURCES.map((r) => (
                    <span key={r} className="res-badge" title={RESOURCE_LABELS[locale][r]}>
                      {RESOURCE_ICONS[r]} {spectateView.bank[r]}
                    </span>
                  ))}
                  <span className="res-badge" title={locale === 'ro' ? 'Cărți de dezvoltare în pachet' : 'Dev cards left in deck'}>
                    🃏 {spectateView.devCardDeckCount}
                  </span>
                </div>
              </div>
            </section>
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

      {/* TAB: HALL OF FAME - per-player win tallies across all finished games */}
      {activeTab === 'hall_of_fame' && (
        <HallOfFameView
          locale={locale}
          onOpenReplay={(rep) => {
            setActiveReplay(rep);
            setActiveTab('replay');
          }}
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

      {/* TAB 5: SANDBOX / TEST ENVIRONMENT (Available locally) */}
      {activeTab === 'sandbox' && (
        <SandboxMode
          locale={locale}
          onExit={() => setActiveTab('lobby')}
        />
      )}

      {/* Modal Confirmare Închidere Partidă pentru Jucătorii Umani din Joc */}
      {inGameTermination && onlineSession && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal-dialog" style={{ maxWidth: 450, border: '2px solid var(--accent-gold)' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: 'var(--accent-gold)' }}>⚠️ Cerere de Închidere a Partidei</h3>
            </div>
            <div style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <p style={{ margin: 0, fontSize: '0.93rem', lineHeight: 1.5 }}>
                Cineva (un spectator sau un utilizator din lobby) a solicitat oprirea acestei partide. Ești de acord să fie închisă definitiv?
              </p>
              <div style={{ background: 'var(--bg-inset)', padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Timp rămas pentru răspuns:</span>
                <span style={{ fontWeight: 700, fontSize: '1.15rem', color: inGameTerminationCountdown <= 10 ? '#ef4444' : 'var(--accent-gold)' }}>
                  ⏱️ {inGameTerminationCountdown}s
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                * Dacă nimeni nu răspunde până la expirarea celor 30 de secunde, partida se va închide automat. Dacă alegi <strong>„Nu, continuă partida”</strong>, cererea este respinsă definitiv, iar butonul de oprire dispare pentru toată lumea.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: 6 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontWeight: 700, padding: '0.5rem 1rem' }}
                  onClick={async () => {
                    if (onlineSession?.gameId) {
                      try {
                        await respondOnlineTermination(onlineSession.gameId, 'deny', onlineSession.sessionToken, onlineSession.playerId);
                        setInGameTermination(null);
                        setInGameTerminationDismissed(true);
                        setServerStatusMsg('Ai refuzat oprirea partidei. Butonul a fost dezactivat, iar jocul continuă!');
                      } catch (err) {
                        alert(err instanceof Error ? err.message : 'Eroare la refuzul cererii.');
                      }
                    }
                  }}
                >
                  🛡️ Nu, continuă partida
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '0.5rem 0.9rem' }}
                  onClick={async () => {
                    if (onlineSession?.gameId) {
                      try {
                        await respondOnlineTermination(onlineSession.gameId, 'confirm', onlineSession.sessionToken, onlineSession.playerId);
                        setInGameTermination(null);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : 'Eroare la confirmarea cererii.');
                      }
                    }
                  }}
                >
                  ⏹️ Da, închide
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Online Waiting Room — shown from the moment a lobby is created/joined until the game
          actually starts. The roster here is polled live (no lobby push yet), and the Start
          button stays disabled while any seat is still "open" — the game cannot begin until
          every intended human has actually joined from their own device. */}
      {onlineLobby && onlineSession && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>🌐 Sală de Așteptare</h3>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setOnlineLobby(null);
                  setOnlineSession(null);
                  setOnlineError(null);
                }}
              >
                ✕ Părăsește
              </button>
            </div>
            <div className="modal-body">
              {onlineLobby.inviteCode && (
                <div className="invite-banner" style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                    <span>
                      Cod Partidă:{' '}
                      <strong style={{ color: 'var(--accent-gold)', fontSize: '0.95rem' }}>
                        {onlineLobby.inviteCode}
                      </strong>
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => handleShareInvite(onlineLobby.inviteCode!)}
                    >
                      📲 Trimite Link / Invită Prieteni
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.85rem' }}>
                {onlineLobby.seats.map((seat) => (
                  <div
                    key={seat.seatIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0.4rem 0.6rem',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      background: seat.type === 'open' ? 'rgba(248, 113, 113, 0.08)' : 'transparent'
                    }}
                  >
                    <span className="color-dot" style={{ backgroundColor: seat.color, width: 11, height: 11 }} />
                    {onlineSession && seat.playerId === onlineSession.playerId ? (
                      isRenamingInWaitingRoom ? (
                        <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                          <input
                            type="text"
                            value={waitingRoomNewName}
                            onChange={(e) => setWaitingRoomNewName(e.target.value)}
                            placeholder="Numele tău"
                            style={{ padding: '0.2rem 0.45rem', fontSize: '0.82rem', flex: 1 }}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameWaitingRoomSeat(seat.seatIndex, waitingRoomNewName);
                              else if (e.key === 'Escape') setIsRenamingInWaitingRoom(false);
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleRenameWaitingRoomSeat(seat.seatIndex, waitingRoomNewName)}
                          >
                            💾 Salvează
                          </button>
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                            onClick={() => setIsRenamingInWaitingRoom(false)}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                          <strong style={{ color: 'var(--accent-gold)' }}>{seat.name} (Tu)</strong>
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem' }}
                            title="Schimbă numele tău"
                            onClick={() => {
                              setWaitingRoomNewName(seat.name);
                              setIsRenamingInWaitingRoom(true);
                            }}
                          >
                            ✏️ Schimbă Nume
                          </button>
                        </div>
                      )
                    ) : (
                      <strong style={{ flex: 1 }}>{seat.name}</strong>
                    )}
                    {seat.type === 'open' ? (
                      <span style={{ color: 'var(--accent-red, #f87171)', fontSize: '0.78rem' }}>
                        ⏳ Așteaptă jucător...
                      </span>
                    ) : seat.type === 'human' ? (
                      <span style={{ color: 'var(--accent-green)', fontSize: '0.78rem' }}>✅ Conectat</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        🤖 {seat.type.toUpperCase()}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {onlineError && (
                <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                  ⚠️ {onlineError}
                </div>
              )}

              {onlineSession.playerId === onlineLobby.hostPlayerId ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={onlineBusy || onlineLobby.seats.some((s) => s.type === 'open')}
                  onClick={handleStartOnlineLobby}
                >
                  {onlineBusy
                    ? 'Se pornește...'
                    : onlineLobby.seats.some((s) => s.type === 'open')
                      ? '⏳ Se așteaptă jucătorii...'
                      : '🚀 Pornește Partida'}
                </button>
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  ⏳ Așteptăm ca gazda să înceapă partida...
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Release Notes — commit log read live from the server, opened by clicking the version
          badge in the header. Available from any tab, not just in-game. */}
      {showReleaseNotes && versionInfo && (
        <div className="modal-backdrop" onClick={() => setShowReleaseNotes(false)}>
          <div
            className="modal-dialog"
            style={{ maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>📋 Note de Lansare — {versionInfo.version}</h3>
              <button type="button" className="btn" onClick={() => setShowReleaseNotes(false)}>
                ✕ Închide
              </button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 0 }}>
                {versionInfo.commitCount} commit-uri · HEAD <code>{versionInfo.shortHash}</code>
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {versionInfo.releaseNotes.map((note) => (
                  <li
                    key={note.hash}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      paddingBottom: '0.5rem',
                      fontSize: '0.84rem'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                      <code style={{ color: 'var(--accent-gold)', fontSize: '0.74rem' }}>{note.hash}</code>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{note.date}</span>
                    </div>
                    <div>{note.message}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Full rulebook — reachable from the lobby's card gallery button, for players who have
          never played Catan and want to learn the game before (or during) their first game. */}
      {activeModal === 'full_rules' && (() => {
        const activeScenario = gameState?.rules?.boardScenario ?? rules.boardScenario ?? 'classic';
        const scenarioLabel = SCENARIO_LABELS[activeScenario]?.[locale] ?? activeScenario;
        const scenarioSections = getScenarioRules(activeScenario, locale);

        return (
          <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
            <div
              className="modal-dialog"
              style={{ maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <h3 style={{ margin: 0 }}>📖 {locale === 'ro' ? 'Regulament Oficial' : 'Official Rules'}</h3>
                  <small style={{ color: 'var(--accent-gold)', fontSize: '0.8rem' }}>
                    {scenarioLabel}
                  </small>
                </div>
                <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                  ✕ {locale === 'ro' ? 'Închide' : 'Close'}
                </button>
              </div>
              <div className="modal-body" style={{ overflowY: 'auto' }}>
                {scenarioSections.map((section) => (
                  <div key={section.title} className="rules-section" style={{ marginBottom: '1.25rem' }}>
                    <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.4rem', fontSize: '0.95rem' }}>{section.title}</h4>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.5', fontSize: '0.85rem' }}>
                      {section.body.map((line, idx) => (
                        <li key={idx} style={{ marginBottom: '0.35rem' }}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
