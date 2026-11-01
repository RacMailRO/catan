import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ALL_RESOURCES,
  AIDifficulty,
  AIStrategyStyle,
  BUILDING_COSTS,
  DevCardType,
  GameAction,
  GameEvent,
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
import { Dialog } from './components/ui/Dialog';
import { AdaptiveSurface } from './components/ui/AdaptiveSurface';
import { AppNav } from './components/ui/AppNav';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { AiThinkingIndicator } from './components/game/AiThinkingIndicator';
import {
  AnimatedDiceWidget,
  ResourceIcon,
  renderResourceTokens,
  Confetti,
  DevCardSprite,
  ResourceCardSprite,
  CostCardThumb,
  playerBadgeStyle
} from './components/GameAssets';
import { ScoreBank } from './components/game/ScoreBank';
import { EventLog } from './components/game/EventLog';
import { CostsHelp } from './components/game/CostsHelp';
import { FullRules } from './components/game/FullRules';
import { ReleaseNotes } from './components/game/ReleaseNotes';
import { StartingOrder } from './components/game/StartingOrder';
import { TradeOfferBuilder } from './components/game/TradeOfferBuilder';
import { CounterTradeOffer } from './components/game/CounterTradeOffer';
import { DevCardsPanel } from './components/game/DevCardsPanel';
import { PlayMonopolyDialog } from './components/game/PlayMonopolyDialog';
import { PlayYearOfPlentyDialog } from './components/game/PlayYearOfPlentyDialog';
import { DiscardDialog } from './components/game/DiscardDialog';
import { StealResourceDialog } from './components/game/StealResourceDialog';
import { IncomingTradeOfferDialog, IncomingTradeOfferModal } from './components/game/IncomingTradeOfferDialog';
import { WaitingRoomPanel } from './components/game/WaitingRoomPanel';
import { GameOverDialog } from './components/game/GameOverDialog';
import { InGameTerminationDialog } from './components/game/InGameTerminationDialog';
import { ReplayAndAnalysisView } from './components/ReplayAndAnalysisView';
import { HallOfFameView } from './components/HallOfFameView';
import { SandboxMode } from './components/SandboxMode';
import { UiShowcase } from './components/UiShowcase';
import { LobbyView } from './components/LobbyView';
import { useTradeState } from './hooks/useTradeState';
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
  RESOURCE_LABELS,
  TRANSLATIONS,
  DEV_CARD_ICONS,
  DEV_CARD_LABELS,
  DEV_CARD_RULE_TEXT,
  FULL_RULES
} from './i18n';

type ActiveTab = 'lobby' | 'game' | 'replay' | 'benchmark' | 'spectate' | 'sandbox' | 'hall_of_fame' | 'ui_showcase';

const NAV_TAB_ICON: Record<ActiveTab, string> = {
  lobby: '⚙️',
  game: '🎲',
  replay: '🎬',
  benchmark: '📈',
  spectate: '👁️',
  sandbox: '🛠️',
  hall_of_fame: '🏆',
  ui_showcase: '🧪'
};

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

// Module-level style constants for the game tab's hot render path (the player-list and
// bottom-dock card rows are each re-created per player/resource on every render while a game
// is in progress). Hoisting the genuinely static ones here avoids reallocating an identical
// object N times per render for no reason - these never change at runtime, so a stable shared
// reference is strictly better than a fresh literal every time. Styles that depend on loop
// data (e.g. a player's color) stay inline since there's nothing stable to hoist them to.
const STYLE_PLAYER_ROW_HEADER: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem' };
const STYLE_PLAYER_RENAME_BTN: React.CSSProperties = { padding: '0 4px', fontSize: '0.68rem', marginLeft: 4, height: 18, lineHeight: '16px' };
const STYLE_PLAYER_TYPE_TAG: React.CSSProperties = { fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 4 };
const STYLE_GOLD_BOLD: React.CSSProperties = { color: 'var(--accent-gold)', fontWeight: 700 };
const STYLE_SPECIAL_VP_BADGE: React.CSSProperties = {
  marginLeft: 4,
  fontSize: '0.68rem',
  background: 'rgba(234, 179, 8, 0.2)',
  color: '#eab308',
  padding: '1px 5px',
  borderRadius: 4,
  border: '1px solid rgba(234, 179, 8, 0.4)'
};
const STYLE_RESOURCE_ROW: React.CSSProperties = { display: 'flex', gap: 4, marginTop: 4 };
const STYLE_RESOURCE_SLOT: React.CSSProperties = { position: 'relative' };
const STYLE_MUTED_SMALL_TEXT: React.CSSProperties = { fontSize: '0.76rem', marginTop: 3, color: 'var(--text-muted)' };
const STYLE_PIECES_ROW: React.CSSProperties = { display: 'flex', gap: 4, marginTop: '0.25rem', marginBottom: '0.2rem' };
const STYLE_PIECE_PILL: React.CSSProperties = { fontSize: '0.72rem', padding: '1px 6px' };
const STYLE_PLAYER_STATS_ROW: React.CSSProperties = { display: 'flex', gap: '0.45rem', flexWrap: 'wrap', fontSize: '0.73rem', color: 'var(--text-muted)' };
// Bottom dock (hand) hot path.
const STYLE_DOCK_PLAYER_NAME: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' };
const STYLE_DOCK_RESOURCE_COUNT: React.CSSProperties = { fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-gold)', marginLeft: 2 };
const STYLE_DOCK_DEV_CARD_CLICKABLE: React.CSSProperties = { cursor: 'pointer' };
const STYLE_FONT_WEIGHT_BOLD: React.CSSProperties = { fontWeight: 700 };

export const App: React.FC = () => {
  const [locale, setLocale] = useState<Locale>('ro');
  const [activeTab, setActiveTab] = useState<ActiveTab>('lobby');
  // Called here (always-mounted) rather than inside ThemeToggle itself, so the theme applies
  // to the whole app from first paint — ThemeToggle only mounts once the nav drawer is opened.
  const { theme, setTheme } = useTheme();
  // Timestamp a server request started that may process several AI turns in one batch (apps/
  // server can take up to ~a minute for a multi-bot trade negotiation) — null while idle. Drives
  // AiThinkingIndicator so that wait never looks like the game is stuck.
  const [pendingActionSince, setPendingActionSince] = useState<number | null>(null);

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
  // Event Log ("Jurnal") data for online games — every sync payload carries the server's
  // trailing window of recent events (GameSyncPayload.recentEvents), but nothing stored it
  // anywhere before, so the event_log surface was gated on `recorder` (always null online —
  // see Phase 0's "local hot-seat is dead code" finding) and silently never opened.
  const [onlineEvents, setOnlineEvents] = useState<GameEvent[]>([]);
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

  // Cumulated, non-blocking notification card of recent actions (dev cards played, builds,
  // bank trades, steals...) - groups recent events into a single centered notification card with
  // an auto-dismiss timer (resets on each event) and a manual close button.
  interface ActionFeedbackItem {
    id: string;
    content: React.ReactNode;
  }
  const [actionFeedbackQueue, setActionFeedbackQueue] = useState<ActionFeedbackItem[]>([]);
  const [isFeedbackFading, setIsFeedbackFading] = useState<boolean>(false);
  const feedbackFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissFeedbackQueue = useCallback(() => {
    if (feedbackFadeTimerRef.current) clearTimeout(feedbackFadeTimerRef.current);
    if (feedbackClearTimerRef.current) clearTimeout(feedbackClearTimerRef.current);
    setIsFeedbackFading(false);
    setActionFeedbackQueue([]);
  }, []);

  // Highest game-event sequence already shown as feedback to this client, whether that came
  // from our own just-submitted action's REST response or a WS state_sync push - keeps
  // reportRemoteEventFeedback from re-announcing an event the REST path already handled.
  const lastSeenEventSeqRef = useRef<number>(0);

  // Which resources a player just received, for a brief "+N" flash on their cards
  const [resourceGainFlash, setResourceGainFlash] = useState<
    Record<string, Partial<Record<ResourceType, number>>>
  >({});
  const gainFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trade negotiation banner visibility tracking lives in useTradeState (see `trade` below) -
  // it's entangled with dismissedTradeOfferIds, which is also owned by that hook.
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
  const launchFlyingIcon = useCallback(
    (requests: { resource: ResourceType; fromSelector: string; toSelector: string }[]) => {
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
    },
    []
  );

  const launchFlyingCards = useCallback(
    (requests: { playerId: string; resource: ResourceType; hexId: string }[]) => {
      launchFlyingIcon(
        requests.map((req) => ({
          resource: req.resource,
          fromSelector: `[data-hex-id="${req.hexId}"]`,
          toSelector: `[data-player-id="${req.playerId}"][data-resource="${req.resource}"]`
        }))
      );
    },
    [launchFlyingIcon]
  );

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
  // Stable reference for the spectator BoardSvg's playerColors prop - without this it was
  // rebuilt with Object.fromEntries on every render, defeating BoardSvg's React.memo.
  const spectatePlayerColors = useMemo(() => {
    if (!spectateView) return {};
    return Object.fromEntries(spectateView.players.map((p) => [p.id, p.color]));
  }, [spectateView]);
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

  const handleStopLobbyOrGame = async (l: LobbyState) => {
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
    if (data.recentEvents) setOnlineEvents(data.recentEvents);
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
    // The server advances AI turns (uncapped batch) until a human is needed before this
    // responds, so with AI opponents this can take a while — same indicator as mid-game waits.
    setPendingActionSince(Date.now());
    try {
      const data = await startOnlineLobby(onlineSession.lobbyId);
      await enterOnlineGame(data.gameId, onlineSession.sessionToken, onlineSession.playerId, onlineSession.lobbyId);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Nu s-a putut porni partida.');
    } finally {
      setOnlineBusy(false);
      setPendingActionSince(null);
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

              const incomingEvents = (msg.recentEvents ?? []) as GameEvent[];
              setOnlineEvents(incomingEvents);
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

  // Same local-vs-online split as gameState above, for the event log ("Jurnal"). Online events
  // come from the server's trailing window (see the onlineEvents state declaration) rather than
  // a full history, same tradeoff the rest of the online UI already makes.
  const currentEvents: readonly GameEvent[] = recorder ? recorder.getEvents() : onlineEvents;

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

  // Cumulates notifications into a single unified card (see actionFeedbackQueue above)
  // instead of multiple detached toasts. Refreshes the auto-dismissal countdown timer (7s) on every event.
  const showActionFeedback = useCallback((content: React.ReactNode) => {
    if (feedbackFadeTimerRef.current) clearTimeout(feedbackFadeTimerRef.current);
    if (feedbackClearTimerRef.current) clearTimeout(feedbackClearTimerRef.current);
    setIsFeedbackFading(false);

    const id = `fb-${Date.now()}-${Math.random()}`;
    setActionFeedbackQueue((prev) => {
      const next = [...prev, { id, content: typeof content === 'string' ? renderResourceTokens(content) : content }];
      return next.length > 5 ? next.slice(next.length - 5) : next;
    });

    feedbackFadeTimerRef.current = setTimeout(() => {
      setIsFeedbackFading(true);
    }, 6800);
    feedbackClearTimerRef.current = setTimeout(() => {
      setActionFeedbackQueue([]);
      setIsFeedbackFading(false);
    }, 7200);
  }, []);

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
          🥷 {nameBadge(event.playerId)} {locale === 'ro' ? 'a furat' : 'stole'} 1 <ResourceIcon resource={stolenResource} />{' '}
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
            .map((r) => (<span key={r} className="res-count"><ResourceIcon resource={r} />{discarded[r]}</span>))}
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
        .map((r) => (<span key={r} className="res-count"><ResourceIcon resource={r} />{cost[r]}</span>));
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
          <ResourceIcon resource={event.action.give} /> → 1<ResourceIcon resource={event.action.receive} />
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
          <ResourceIcon resource={event.action.resource} /> {RESOURCE_LABELS[locale][event.action.resource]} ({totalTaken}{' '}
          {locale === 'ro' ? 'cărți confiscate' : 'cards taken'})
        </>
      );
    } else if (event.action.type === 'play_year_of_plenty') {
      const r1 = event.action.resources[0];
      const r2 = event.action.resources[1];
      showActionFeedback(
        <>
          🎁 {nameBadge(event.playerId)} {locale === 'ro' ? 'a jucat Anul Abundenței' : 'played Year of Plenty'} (+1{' '}
          <ResourceIcon resource={r1} />, +1 <ResourceIcon resource={r2} />)
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
  const applyOnlineSync = useCallback((
    data: {
      playerView: PlayerView;
      legalActions: GameAction[];
      recentEvents?: GameEvent[];
    },
    action?: GameAction,
    actingPlayerId?: string,
    prevView?: PlayerView | null
  ) => {
    const newView = data.playerView;
    setOnlinePlayerView(newView);
    setOnlineLegalActions(data.legalActions);
    if (data.recentEvents) setOnlineEvents(data.recentEvents);

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
          const resText = `{{res:${stolenResource}}} ${RESOURCE_LABELS[locale][stolenResource]}`;
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
        const resText = `{{res:${res}}} ${RESOURCE_LABELS[locale][res]}`;
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
        showActionFeedback(`🎁 ${actingPlayer?.name ?? actingPlayerId} a jucat Anul Abundenței (+1 {{res:${r1}}} ${RESOURCE_LABELS[locale][r1]}, +1 {{res:${r2}}} ${RESOURCE_LABELS[locale][r2]})`);
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
  }, [onlineSession, locale, showActionFeedback, launchFlyingCards]);

  const executeOnlineAction = useCallback(async (playerId: string, action: GameAction) => {
    if (!onlineSession?.gameId) return;
    setActionError(null);
    const prevView = onlinePlayerView;
    setPendingActionSince(Date.now());
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
    } finally {
      setPendingActionSince(null);
    }
  }, [onlineSession, onlinePlayerView, applyOnlineSync]);

  const executeAction = useCallback((playerId: string, action: GameAction) => {
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
          const resText = `{{res:${stolenResource}}} ${RESOURCE_LABELS[locale][stolenResource]}`;
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
        const resText = `{{res:${res}}} ${RESOURCE_LABELS[locale][res]}`;
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
        showActionFeedback(`🎁 Anul Abundenței: Ai primit 1x {{res:${r1}}} ${RESOURCE_LABELS[locale][r1]} și 1x {{res:${r2}}} ${RESOURCE_LABELS[locale][r2]} direct din bancă!`);
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
  }, [onlineSession, executeOnlineAction, recorder, locale, viewerId, showActionFeedback, launchFlyingCards]);

  // Trade/bank/discard negotiation state cluster (dev-card sub-modals, bank & p2p trade
  // builder staging, discard selection, incoming-offer reject dropdown, and the negotiation
  // banner's visibility tracking) - see hooks/useTradeState.ts.
  const trade = useTradeState({ gameState, executeAction, viewerId, showActionFeedback, locale });
  const {
    yopResources,
    setYopResources,
    monopolyResource,
    setMonopolyResource,
    bankGiveRes,
    setBankGiveRes,
    bankReceiveRes,
    setBankReceiveRes,
    p2pOffer,
    setP2pOffer,
    p2pRequest,
    setP2pRequest,
    counterOfferOriginalId,
    setCounterOfferOriginalId,
    dismissedTradeOfferIds,
    setDismissedTradeOfferIds,
    minimizedDiscard,
    setMinimizedDiscard,
    rejectDropdownOfferId,
    setRejectDropdownOfferId,
    discardSelection,
    setDiscardSelection,
    visibleTradeOffers,
    dismissTradeOffer,
    cancelMyTradeOffer
  } = trade;

  // Step one AI move
  const executeOneAiStep = async () => {
    if (onlineSession?.gameId) {
      setPendingActionSince(Date.now());
      try {
        const data = await stepOnlineAi(onlineSession.gameId, 1, onlineSession.playerId);
        setOnlinePlayerView(data.playerView);
        setOnlineLegalActions(data.legalActions as GameAction[]);
        if (data.recentEvents) setOnlineEvents(data.recentEvents);
      } catch (err) {
        console.error('Failed to step AI online:', err);
      } finally {
        setPendingActionSince(null);
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

  // Stable reference (recomputed only when gameState itself changes) so it doesn't defeat
  // BoardSvg's React.memo by handing it a fresh object identity on every unrelated render.
  const playerColorsMap: Record<string, PlayerColor> = useMemo(() => {
    const map: Record<string, PlayerColor> = {};
    if (gameState) {
      for (const p of gameState.players) {
        map[p.id] = p.color;
      }
    }
    return map;
  }, [gameState]);

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

  // Handlers for clicking on the interactive board - useCallback'd (with executeAction itself
  // now stabilized above) so BoardSvg's onSelect* props stay referentially stable across
  // renders that don't actually change board-relevant state, letting its React.memo do its job.
  const handleSelectVertex = useCallback((vertexId: string) => {
    if (!gameState || !isHumanTurn) return;
    const pId = gameState.activePlayerId;
    if (gameState.phase === 'setup_settlement_1' || gameState.phase === 'setup_settlement_2') {
      executeAction(pId, { type: 'place_initial_settlement', vertexId });
    } else if (buildMode === 'settlement') {
      executeAction(pId, { type: 'build_settlement', vertexId });
    } else if (buildMode === 'city') {
      executeAction(pId, { type: 'build_city', vertexId });
    }
  }, [gameState, isHumanTurn, buildMode, executeAction]);

  const handleSelectEdge = useCallback((edgeId: string) => {
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
  }, [gameState, isHumanTurn, legalActionsForActive, buildMode, selectedShipEdgeId, executeAction]);

  const handleSelectHex = useCallback((hexId: string) => {
    if (!gameState) return;
    const pId = gameState.activePlayerId;
    const targets = getEligibleRobberTargetsOnHex(gameState, hexId, pId);
    const firstTarget = targets.length === 1 ? targets[0] : undefined;

    if (gameState.phase === 'move_robber') {
      executeAction(pId, { type: 'move_robber', hexId, targetPlayerId: firstTarget });
    } else if (buildMode === 'knight') {
      executeAction(pId, { type: 'play_knight', hexId, targetPlayerId: firstTarget });
    }
  }, [gameState, buildMode, executeAction]);

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

  // Trade-offer banner tracking/pruning effects now live in useTradeState (see `trade` above).

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
      {/* Fixed-position overlay, shown regardless of active tab — covers both the "Start Game"
          wait (still on the waiting-room screen) and mid-game AI negotiation waits. */}
      <AiThinkingIndicator since={pendingActionSince} locale={locale} />

      {/* Resource cards animating from the producing hex to the receiving player — fixed
          positioning so it escapes the board/sidebar's own overflow clipping. */}
      {flyingCards.map((c) => (
        <div
          key={c.key}
          className="flying-resource-card"
          style={{ left: c.launched ? c.endX : c.startX, top: c.launched ? c.endY : c.startY }}
        >
          <ResourceIcon resource={c.resource} height={36} />
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

        {/* Section nav collapses into a hamburger dropdown — four always-visible tab buttons
            didn't belong inline in a 52px header, and crowded it on every screen size. Rendered
            through the shared AppNav drawer component (Phase 7 of the UI refactor). */}
        <AppNav
          compactTrigger
          items={[
            { id: 'lobby', icon: NAV_TAB_ICON.lobby, label: t.navLobby },
            { id: 'game', icon: NAV_TAB_ICON.game, label: t.navGame },
            { id: 'replay', icon: NAV_TAB_ICON.replay, label: t.navReplay },
            { id: 'benchmark', icon: NAV_TAB_ICON.benchmark, label: t.navBenchmark },
            { id: 'hall_of_fame', icon: NAV_TAB_ICON.hall_of_fame, label: t.navHallOfFame },
            ...(isLocalEnvironment()
              ? [
                  {
                    id: 'sandbox',
                    icon: NAV_TAB_ICON.sandbox,
                    label: locale === 'ro' ? 'Mediu de Test' : 'Sandbox Mode'
                  },
                  {
                    id: 'ui_showcase',
                    icon: NAV_TAB_ICON.ui_showcase,
                    label: locale === 'ro' ? 'Galerie Componente' : 'UI Showcase'
                  }
                ]
              : [])
          ]}
          activeId={activeTab}
          onNavigate={(id) => {
            switch (id) {
              case 'game':
                // No game to jump into yet — send them to the lobby to create/join an
                // online game instead of silently starting a local one.
                setActiveTab(recorder || onlineSession ? 'game' : 'lobby');
                break;
              case 'replay':
                openGameReplay();
                break;
              default:
                setActiveTab(id as ActiveTab);
            }
          }}
          footer={(closeNav) => (
            <>
              <button
                type="button"
                className="flex min-h-[44px] w-full items-center gap-2 text-left text-ink hover:bg-surfaceMuted"
                onClick={() => {
                  setActiveModal('full_rules');
                  closeNav();
                }}
              >
                📖 {locale === 'ro' ? 'Regulament' : 'Rulebook'}
              </button>
              <ThemeToggle theme={theme} setTheme={setTheme} />
            </>
          )}
        />

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
          <button type="button" className="btn btn-primary" onClick={() => {
              // A plain reload can be answered by the service worker's cached index.html (old
              // bundle) so the banner would never go away: drop the SW + its caches first.
              const cleanup: Promise<unknown>[] = [];
              if ('serviceWorker' in navigator) {
                cleanup.push(navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister()))));
              }
              if ('caches' in window) {
                cleanup.push(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
              }
              Promise.allSettled(cleanup).finally(() => window.location.reload());
            }}
          >
            {locale === 'ro' ? '↻ Reîncarcă' : '↻ Reload'}
          </button>
        </div>
      )}

      {/* TAB 1: LOBBY & GAME CONFIGURATION (Fully Responsive, Vertical Scroll on Mobile) */}
      {activeTab === 'lobby' && (
        <LobbyView
          locale={locale}
          onlineSession={onlineSession}
          onRejoinOnlineGame={() => {
            if (onlineSession?.gameId) {
              enterOnlineGame(onlineSession.gameId, onlineSession.sessionToken, onlineSession.playerId, onlineSession.lobbyId);
            }
          }}
          onLeaveOnlineSession={() => {
            setOnlineSession(null);
            saveOnlineSession(null);
            setOnlinePlayerView(null);
          }}
          joinCodeInput={joinCodeInput}
          onJoinCodeInputChange={setJoinCodeInput}
          joinPlayerName={joinPlayerName}
          onJoinPlayerNameChange={(value) => {
            setJoinPlayerName(value);
            savePlayerName(value);
          }}
          joinLoading={joinLoading}
          joinError={joinError}
          onJoinWithCode={handleJoinWithCode}
          publicLobbies={publicLobbies}
          onCopyPublicLobbyCode={(code) => {
            navigator.clipboard.writeText(code);
            setJoinCodeInput(code);
            setServerStatusMsg(locale === 'ro' ? `Codul ${code} a fost copiat în casetă!` : `Code ${code} copied to box!`);
          }}
          onSpectate={handleSpectate}
          onStopLobbyOrGame={handleStopLobbyOrGame}
          serverStatusMsg={serverStatusMsg}
          participants={participants}
          setParticipants={setParticipants}
          colorPickerIdx={colorPickerIdx}
          setColorPickerIdx={setColorPickerIdx}
          onSwapColor={handleSwapColor}
          rules={rules}
          setRules={setRules}
          customSeed={customSeed}
          onCustomSeedChange={setCustomSeed}
          turnTimerEnabled={turnTimerEnabled}
          setTurnTimerEnabled={setTurnTimerEnabled}
          turnTimerSec={turnTimerSec}
          setTurnTimerSec={setTurnTimerSec}
          onOpenFullRules={() => setActiveModal('full_rules')}
          onlineBusy={onlineBusy}
          onlineError={onlineError}
          onCreateOnlineLobby={handleCreateOnlineLobby}
          onQuickAiSimulation={handleQuick4AiSimulation}
        />
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
                      <div style={STYLE_PLAYER_ROW_HEADER}>
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
                              style={STYLE_PLAYER_RENAME_BTN}
                              title={locale === 'ro' ? 'Schimbă numele tău' : 'Change your name'}
                              onClick={() => handlePromptRenameInGame(p.name)}
                            >
                              ✏️
                            </button>
                          )}
                          <span style={STYLE_PLAYER_TYPE_TAG}>
                            [{p.type.toUpperCase()}]
                          </span>
                        </span>
                        <span style={STYLE_GOLD_BOLD}>
                          {p.totalScore !== undefined ? `${p.totalScore} VP` : `${p.publicScore} VP`}
                          {!!p.specialVictoryPoints && p.specialVictoryPoints > 0 && (
                            <span
                              style={STYLE_SPECIAL_VP_BADGE}
                              title={locale === 'ro' ? `+${p.specialVictoryPoints} Puncte Speciale de Victorie (Catan Chits / Insule)` : `+${p.specialVictoryPoints} Special VP (Catan Chits)`}
                            >
                              +{p.specialVictoryPoints}🪙
                            </span>
                          )}
                        </span>
                      </div>

                      {p.resources ? (
                        <div style={STYLE_RESOURCE_ROW}>
                          {ALL_RESOURCES.map((r) => {
                            const gain = resourceGainFlash[p.id]?.[r];
                            return (
                              <div key={r} data-player-id={p.id} data-resource={r} style={STYLE_RESOURCE_SLOT}>
                                <ResourceCardSprite resource={r} count={p.resources![r]} locale={locale} size="xs" />
                                {gain ? <span className="resource-gain-flash">+{gain}</span> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={STYLE_MUTED_SMALL_TEXT}>
                          🎴 {p.resourceCount} resurse · 🃏 {p.devCardCount} dezvoltare
                        </div>
                      )}

                      {/* Piece Counts: Settlements, Cities, Roads */}
                      <div className="player-grid-pieces" style={STYLE_PIECES_ROW}>
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
                              style={STYLE_PIECE_PILL}
                            >
                              {icon} {used}/{total}
                            </span>
                          );
                        })}
                      </div>

                      <div style={STYLE_PLAYER_STATS_ROW}>
                        <span>🛣️ Drum: {p.longestRoadLength}</span>
                        <span>⚔️ Cavaleri: {p.knightsPlayed}</span>
                        {hasLongestRoad && (
                          <span style={STYLE_GOLD_BOLD}>🏅 +2 Drum</span>
                        )}
                        {hasLargestArmy && (
                          <span style={STYLE_GOLD_BOLD}>🛡️ +2 Armată</span>
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
                    <ResourceIcon resource={r} /> {playerView.bank[r]}
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
                  📜 Jurnal ({currentEvents.length})
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
              {/* Moved here from the header bar — the header has no room to show this without
                  truncating it unreadably, especially on mobile; the board overlay does. */}
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
              {/* Action row: Scor & Bancă (left), Dice (center), Jurnal & Timer (right) */}
              <div className="board-top-controls">
                <button
                  type="button"
                  className="btn btn-primary top-ctrl-btn"
                  onClick={() => setActiveModal('score_bank')}
                  title={locale === 'ro' ? 'Vezi Clasament & Bancă' : 'View Scores & Bank'}
                >
                  👥 {locale === 'ro' ? 'Scor & Bancă' : 'Scores & Bank'}
                </button>

                {/* Animated Dice Roll Widget centered between the two buttons */}
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'auto' }}>
                  <button
                    type="button"
                    className="btn top-ctrl-btn"
                    onClick={() => setActiveModal('event_log')}
                    title={locale === 'ro' ? 'Deschide Jurnalul de acțiuni' : 'Open Event Log'}
                  >
                    📜 {locale === 'ro' ? 'Jurnal' : 'Log'} ({currentEvents.length})
                  </button>

                  {turnTimeLeft !== null && (
                    <div
                      className="turn-timer-badge"
                      style={{
                        borderColor: turnTimeLeft <= 10 ? 'var(--accent-red)' : 'var(--accent-gold)',
                        color: turnTimeLeft <= 10 ? 'var(--accent-red)' : 'var(--accent-gold-bright)'
                      }}
                    >
                      ⏱️ {turnTimeLeft}s
                    </div>
                  )}
                </div>
              </div>
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
              <div className={`action-feedback-card-container ${isFeedbackFading ? 'fading' : ''}`}>
                <div className="action-feedback-card">
                  <div className="action-feedback-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.05rem' }}>📢</span>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--accent-gold)' }}>
                        {locale === 'ro' ? 'Evenimente Recente' : 'Recent Events'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="action-feedback-journal-btn"
                        title={locale === 'ro' ? 'Deschide Jurnalul Complet' : 'Open Full Event Log'}
                        onClick={() => setActiveModal('event_log')}
                      >
                        📜 {locale === 'ro' ? 'Jurnal' : 'Log'} ({currentEvents.length})
                      </button>
                      <button
                        type="button"
                        className="action-feedback-close-btn"
                        title={locale === 'ro' ? 'Închide notificarea' : 'Dismiss notification'}
                        onClick={dismissFeedbackQueue}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="action-feedback-card-body">
                    {actionFeedbackQueue.map((item) => (
                      <div key={item.id} className="action-feedback-row">
                        <span className="action-feedback-dot">•</span>
                        <div className="action-feedback-row-content">{item.content}</div>
                      </div>
                    ))}
                  </div>
                  <div className="action-feedback-progress-bar">
                    <div
                      key={`fill-${actionFeedbackQueue.length}-${actionFeedbackQueue[actionFeedbackQueue.length - 1]?.id}`}
                      className="action-feedback-progress-fill"
                    />
                  </div>
                </div>
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
              <div className="dock-player-name" style={STYLE_DOCK_PLAYER_NAME}>
                <div>
                  <span>Cărțile lui</span> <strong>{(viewerPlayerObj ?? activePlayerObj)?.name}</strong>{' '}
                  {/* Larger + gold so the hand size actually draws the eye, not just a muted
                      aside next to the name - piece counts moved onto their own build buttons
                      below instead of living here as a separate row. */}
                  <span style={STYLE_DOCK_RESOURCE_COUNT}>
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
                        style={STYLE_RESOURCE_SLOT}
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
                    style={STYLE_RESOURCE_SLOT}
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

                  <CostCardThumb
                    size="xs"
                    locale={locale}
                    onClick={() => setActiveModal('costs_help')}
                  />
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
                          style={STYLE_FONT_WEIGHT_BOLD}
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
        <AdaptiveSurface
          open
          onClose={() => setActiveModal('none')}
          title={`🏆 ${locale === 'ro' ? 'Clasament, Participanți & Bancă' : 'Leaderboard, Players & Bank'} (Țintă: ${gameState.rules.victoryPointsToWin} VP)`}
        >
            <ScoreBank
              locale={locale}
              playerView={playerView}
              resourceGainFlash={resourceGainFlash}
              hasShipsInScenario={hasShipsInScenario}
              isGameOver={gameState.phase === 'game_over'}
              isHumanTurn={isHumanTurn}
              autoPlayAi={autoPlayAi}
              onToggleAutoPlayAi={() => setAutoPlayAi((a) => !a)}
              onStepAi={executeOneAiStep}
              eventCount={currentEvents.length}
              onOpenEventLog={() => setActiveModal('event_log')}
              onOpenCostsHelp={() => setActiveModal('costs_help')}
            />
        </AdaptiveSurface>
      )}

      {/* MODAL A: DEVELOPMENT CARDS HAND & PLAY ACTIONS */}
          {activeModal === 'dev_cards' && activePlayerObj && (
            <AdaptiveSurface
              open
              onClose={() => setActiveModal('none')}
              title={`🃏 ${t.devCardsTitle} — ${(viewerPlayerObj ?? activePlayerObj).name} (${unplayedDevCards.length})`}
            >
                  <DevCardsPanel
                    locale={locale}
                    gameState={gameState}
                    activePlayer={activePlayerObj}
                    unplayedDevCards={unplayedDevCards}
                    devCardCountsByType={devCardCountsByType}
                    isHumanTurn={isHumanTurn}
                    onActivateKnight={() => {
                      setBuildMode('knight');
                      setActiveModal('none');
                    }}
                    onPlayRoadBuilding={() => {
                      executeAction(activePlayerObj.id, { type: 'play_road_building' });
                      setActiveModal('none');
                    }}
                    onOpenMonopoly={() => setActiveModal('play_monopoly')}
                    onOpenYearOfPlenty={() => setActiveModal('play_year_of_plenty')}
                  />
            </AdaptiveSurface>
          )}

          {/* MODAL SPECIAL: PLAY MONOPOLY - SELECT RESOURCE INTERACTIVELY */}
          {activeModal === 'play_monopoly' && activePlayerObj && (
            <Dialog
              open
              onClose={() => setActiveModal('dev_cards')}
              title="👑 Declară Monopol"
              footer={
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
              }
            >
                  <PlayMonopolyDialog
                    locale={locale}
                    activePlayer={activePlayerObj}
                    selectedResource={monopolyResource}
                    onSelectResource={setMonopolyResource}
                  />
            </Dialog>
          )}

          {/* MODAL SPECIAL: PLAY YEAR OF PLENTY - SELECT 2 RESOURCES */}
          {activeModal === 'play_year_of_plenty' && activePlayerObj && (() => {
            const confirmYearOfPlenty = () => {
              executeAction(activePlayerObj.id, {
                type: 'play_year_of_plenty',
                resources: yopResources
              });
              setActiveModal('none');
            };
            return (
              <Dialog
                open
                onClose={() => setActiveModal('dev_cards')}
                title="🎁 Joacă: Anul Abundenței"
                footer={
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.6rem', fontWeight: 700 }}
                    onClick={confirmYearOfPlenty}
                  >
                    🎁 Ia {RESOURCE_LABELS[locale][yopResources[0]]} + {RESOURCE_LABELS[locale][yopResources[1]]}
                  </button>
                }
              >
                    <PlayYearOfPlentyDialog
                      locale={locale}
                      gameState={gameState}
                      activePlayer={activePlayerObj}
                      selected={yopResources}
                      onSelectedChange={setYopResources}
                      onConfirm={confirmYearOfPlenty}
                    />
              </Dialog>
            );
          })()}

          {/* MODAL A: STARTING ORDER — each player's opening 2d6 roll, highest goes first */}
          {activeModal === 'starting_order' && gameState?.startingOrderRolls && (
            <AdaptiveSurface open onClose={() => setActiveModal('none')} title="🎲 Cine Începe Partida">
                  <StartingOrder
                    players={gameState.players}
                    rolls={gameState.startingOrderRolls}
                    onClose={() => setActiveModal('none')}
                  />
            </AdaptiveSurface>
          )}

          {/* MODAL B: MARITIME / BANK TRADE & PLAYER-TO-PLAYER TRADE */}
          {activeModal === 'trade' && activePlayerObj && (
            <AdaptiveSurface
              open
              onClose={() => setActiveModal('none')}
              title="⚓ Comerț Maritim (Bancă / Porturi) & Schimb între Jucători"
            >
                  <TradeOfferBuilder
                    locale={locale}
                    gameState={gameState}
                    activePlayer={activePlayerObj}
                    bankGiveRes={bankGiveRes}
                    bankReceiveRes={bankReceiveRes}
                    onBankGiveResChange={setBankGiveRes}
                    onBankReceiveResChange={setBankReceiveRes}
                    onBankTrade={(give, giveAmount, receive) =>
                      executeAction(activePlayerObj.id, { type: 'trade_bank', give, giveAmount, receive })
                    }
                    p2pOffer={p2pOffer}
                    p2pRequest={p2pRequest}
                    onP2pOfferChange={setP2pOffer}
                    onP2pRequestChange={setP2pRequest}
                    onProposeTrade={() => {
                      executeAction(activePlayerObj.id, {
                        type: 'propose_trade',
                        offering: p2pOffer,
                        requesting: p2pRequest
                      });
                      setP2pOffer(createEmptyResources());
                      setP2pRequest(createEmptyResources());
                      setActiveModal('none');
                    }}
                  />
            </AdaptiveSurface>
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
                <Dialog
                  open
                  onClose={closeCounterModal}
                  title={locale === 'ro' ? 'Contra-ofertă' : 'Counter-offer'}
                  footer={
                    <button type="button" className="btn btn-primary" onClick={closeCounterModal}>
                      {locale === 'ro' ? 'Închide' : 'Close'}
                    </button>
                  }
                >
                  <p style={{ textAlign: 'center', margin: 0 }}>
                    {locale === 'ro'
                      ? 'Oferta originală nu mai este activă.'
                      : 'The original offer is no longer active.'}
                  </p>
                </Dialog>
              );
            }
            return (
              <AdaptiveSurface
                open
                onClose={closeCounterModal}
                title={`🔄 ${locale === 'ro' ? 'Contra-ofertă către' : 'Counter-offer to'} ${originalProposer?.name ?? originalOffer.fromPlayerId}`}
              >
                    <CounterTradeOffer
                      locale={locale}
                      originalOffer={originalOffer}
                      viewerPlayer={viewerPlayerObj}
                      p2pOffer={p2pOffer}
                      p2pRequest={p2pRequest}
                      onP2pOfferChange={setP2pOffer}
                      onP2pRequestChange={setP2pRequest}
                      onSendCounterOffer={() => {
                        executeAction(viewerId, {
                          type: 'counter_trade',
                          offerId: originalOffer.id,
                          offering: p2pOffer,
                          requesting: p2pRequest
                        });
                        closeCounterModal();
                      }}
                    />
              </AdaptiveSurface>
            );
          })()}

          {/* MODAL C: EVENT LOG — gated on gameState (true for both recorder-driven local play
              and online play, via the adapter at the gameState declaration above), not recorder
              directly: that previously made this surface a no-op for online games, the only way
              to actually play (see Phase 0's "local hot-seat is dead code" finding). */}
          {activeModal === 'event_log' && gameState && (
            <AdaptiveSurface
              open
              onClose={() => setActiveModal('none')}
              title={`📜 ${t.eventLogTitle} (${currentEvents.length} acțiuni)`}
            >
                  <EventLog locale={locale} gameState={gameState} events={currentEvents} />
            </AdaptiveSurface>
          )}

          {/* MODAL D: BUILDING COSTS REFERENCE (/cost.jpg) */}
          {activeModal === 'costs_help' && (
            <AdaptiveSurface
              open
              onClose={() => setActiveModal('none')}
              title={locale === 'ro' ? '📋 Tabel Costuri Construcții & Puncte de Victorie' : '📋 Building Costs & Victory Point Table'}
              scrollable={false}
            >
              <CostsHelp
                locale={locale}
                hasShipsInScenario={Boolean(gameState && isScenarioWithShips(gameState.rules.boardScenario))}
              />
            </AdaptiveSurface>
          )}

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
                <Dialog
                  key={discardPid}
                  open
                  onClose={() => setMinimizedDiscard(true)}
                  title={`⚠️ S-a dat 7! ${p.name} trebuie să decarteze ${needed} cărți (${currentSelected}/${needed})`}
                  footer={
                    <>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.78rem' }}
                        title="Minimizează pentru a analiza harta"
                        onClick={() => setMinimizedDiscard(true)}
                      >
                        👁️ Vezi Harta
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
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
                    </>
                  }
                >
                      <DiscardDialog
                        locale={locale}
                        player={p}
                        selection={discardSelection}
                        onSelectionChange={setDiscardSelection}
                      />
                </Dialog>
              );
            })}

          {/* AUTOMATIC MODAL F: STEAL RESOURCE TARGET SELECTION - shows each candidate's own
              card (VP, resource/dev-card counts, pieces...) same as the sidebar, since the
              board behind this modal is dimmed/blurred and isn't a usable reference while
              deciding; sourced from playerView (not gameState directly) so an online opponent's
              hidden resource count shows correctly instead of the local adapter's 0 placeholder. */}
          {gameState.phase === 'steal_resource' && isHumanTurn && (
            <Dialog open onClose={() => {}} title="🥷 Alege adversarul de la care furi 1 resursă">
                <StealResourceDialog
                  locale={locale}
                  gameState={gameState}
                  playerView={playerView}
                  onStealFromPlayer={(targetPlayerId) =>
                    executeAction(gameState.activePlayerId, {
                      type: 'steal_from_player',
                      targetPlayerId
                    })
                  }
                />
            </Dialog>
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
            // Requirement 1: If viewer cannot afford, auto-reject immediately and notify user!
            if (!canAfford) {
              dismissTradeOffer(incomingOffer.id, locale === 'ro' ? 'Nu am resursa cerută' : 'Missing requested resource');
              const reqText = ALL_RESOURCES.filter((r) => incomingOffer.requesting[r] > 0)
                .map((r) => `${incomingOffer.requesting[r]}x ${RESOURCE_LABELS[locale][r]}`)
                .join(', ');
              const offText = ALL_RESOURCES.filter((r) => incomingOffer.offering[r] > 0)
                .map((r) => `${incomingOffer.offering[r]}x ${RESOURCE_LABELS[locale][r]}`)
                .join(', ');
              showActionFeedback(
                locale === 'ro'
                  ? `📢 ${proposer?.name ?? incomingOffer.fromPlayerId} a cerut ${reqText} pentru ${offText}. Refuzat automat (nu ai resursele cerute).`
                  : `📢 ${proposer?.name ?? incomingOffer.fromPlayerId} requested ${reqText} for ${offText}. Auto-declined (insufficient resources).`
              );
              return null;
            }

            // Requirements 2, 3, 4, 5: Viewer has resources -> 30s countdown modal, non-dismissible on backdrop, auto-rejects at 0s!
            return (
              <IncomingTradeOfferModal
                key={incomingOffer.id}
                incomingOffer={incomingOffer}
                proposerName={proposer?.name ?? incomingOffer.fromPlayerId}
                locale={locale}
                viewerResources={myRes}
                canAfford={canAfford}
                onAccept={() => {
                  setDismissedTradeOfferIds((prev) => new Set(prev).add(incomingOffer.id));
                  executeAction(viewerId, {
                    type: 'respond_trade',
                    offerId: incomingOffer.id,
                    response: 'accept'
                  });
                }}
                onReject={(reason) => {
                  dismissTradeOffer(incomingOffer.id, reason);
                }}
                onCounter={() => {
                  setP2pOffer(createEmptyResources());
                  setP2pRequest(createEmptyResources());
                  setCounterOfferOriginalId(incomingOffer.id);
                  setActiveModal('counter_trade');
                }}
              />
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
            const resourceList = (counts: ResourceCount) => {
              const items = ALL_RESOURCES.filter((r) => counts[r] > 0);
              if (items.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
              return (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', padding: '2px 0' }}>
                  {items.map((r) => (
                    <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ResourceIcon resource={r} height={52} />
                      <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#f8fafc', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                        {counts[r]}
                      </span>
                    </span>
                  ))}
                </div>
              );
            };

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
                  width: 460,
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
                <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
                  <div
                    style={{
                      flex: 1,
                      background: 'rgba(34, 197, 94, 0.14)',
                      border: '1px solid rgba(34, 197, 94, 0.45)',
                      borderRadius: 8,
                      padding: '0.5rem 0.4rem',
                      minHeight: 80,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: '#4ade80', fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>oferă</div>
                    <div>{resourceList(offer.offering)}</div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: 'rgba(239, 68, 68, 0.14)',
                      border: '1px solid rgba(239, 68, 68, 0.45)',
                      borderRadius: 8,
                      padding: '0.5rem 0.4rem',
                      minHeight: 80,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>cere</div>
                    <div>{resourceList(offer.requesting)}</div>
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
          {gameState.winnerId && (
            <Dialog
              open
              onClose={() => {}}
              title="🎉 Partidă Finalizată & Salvată Automat!"
              footer={
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
              }
            >
              <GameOverDialog locale={locale} gameState={gameState} />
            </Dialog>
          )}
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
                    playerColors={spectatePlayerColors}
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
                      <ResourceIcon resource={r} /> {spectateView.bank[r]}
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

      {/* TAB 6: UI SHOWCASE — dev-only gallery of every game-specific modal/panel component,
          rendered immediately with sample data instead of only appearing once a live game
          reaches the exact state that normally triggers it (Available locally). */}
      {activeTab === 'ui_showcase' && (
        <UiShowcase locale={locale} onExit={() => setActiveTab('lobby')} />
      )}

      {/* Modal Confirmare Închidere Partidă pentru Jucătorii Umani din Joc */}
      {inGameTermination && onlineSession && (
        <Dialog
          open
          onClose={() => {}}
          title="⚠️ Cerere de Închidere a Partidei"
            footer={
              <>
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
              </>
            }
          >
              <InGameTerminationDialog countdown={inGameTerminationCountdown} />
          </Dialog>
      )}

      {/* Online Waiting Room — shown from the moment a lobby is created/joined until the game
          actually starts. The roster here is polled live (no lobby push yet), and the Start
          button stays disabled while any seat is still "open" — the game cannot begin until
          every intended human has actually joined from their own device. */}
      {onlineLobby && onlineSession && (
        <AdaptiveSurface
          open
          onClose={() => {
            setOnlineLobby(null);
            setOnlineSession(null);
            setOnlineError(null);
          }}
          title="🌐 Sală de Așteptare"
        >
              <WaitingRoomPanel
                lobby={onlineLobby}
                session={onlineSession}
                onShareInvite={handleShareInvite}
                isRenaming={isRenamingInWaitingRoom}
                renameDraft={waitingRoomNewName}
                onRenameDraftChange={setWaitingRoomNewName}
                onRenamingChange={setIsRenamingInWaitingRoom}
                onRenameSeat={handleRenameWaitingRoomSeat}
                error={onlineError}
                busy={onlineBusy}
                onStartGame={handleStartOnlineLobby}
              />
        </AdaptiveSurface>
      )}

      {/* Release Notes — commit log read live from the server, opened by clicking the version
          badge in the header. Available from any tab, not just in-game. */}
      {showReleaseNotes && versionInfo && (
        <AdaptiveSurface
          open
          onClose={() => setShowReleaseNotes(false)}
          title={`📋 Note de Lansare — ${versionInfo.version}`}
        >
              <ReleaseNotes
                commitCount={versionInfo.commitCount}
                shortHash={versionInfo.shortHash}
                releaseNotes={versionInfo.releaseNotes}
              />
        </AdaptiveSurface>
      )}

      {/* Full rulebook — reachable from the lobby's card gallery button, for players who have
          never played Catan and want to learn the game before (or during) their first game. */}
      {activeModal === 'full_rules' && (() => {
        const activeScenario = gameState?.rules?.boardScenario ?? rules.boardScenario ?? 'classic';

        return (
          <AdaptiveSurface
            open
            onClose={() => setActiveModal('none')}
            title={`📖 ${locale === 'ro' ? 'Regulament Oficial' : 'Official Rules'}`}
          >
                <FullRules locale={locale} scenario={activeScenario} />
          </AdaptiveSurface>
        );
      })()}
    </div>
  );
};
