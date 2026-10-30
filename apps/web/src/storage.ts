import {
  GameRulesConfig,
  PLAYER_COLORS,
  ParticipantConfig,
  PlayerColor,
  ReplayFile,
  calculateScore,
  createRulesConfig,
  getPlayerById
} from '@catan/core';

export interface SavedReplaySummary {
  gameId: string;
  seed: string;
  savedAt: string;
  turns: number;
  eventsCount: number;
  winnerId: string | null;
  winnerName: string | null;
  participants: Array<{
    id: string;
    name: string;
    type: string;
    color: string;
    finalScore: number;
  }>;
  // Only populated for an entry built in this page load (see saveReplayToHistory) - a full
  // ReplayFile is routinely multi-megabyte, so history entries loaded back from localStorage
  // never carry one. Callers missing it should fetch `/api/games/:gameId/replay` instead.
  replay?: ReplayFile;
}

const STORAGE_KEY = 'catan_saved_replays_v2';
const MAX_SAVED_REPLAYS = 25;

export const STORAGE_KEY_PARTICIPANTS = 'catan_lobby_participants_v2';
export const STORAGE_KEY_RULES = 'catan_lobby_rules_v2';
export const STORAGE_KEY_TIMER = 'catan_lobby_timer_v2';
export const STORAGE_KEY_PLAYER_NAME = 'catan_player_name';
export const STORAGE_KEY_ONLINE_SESSION = 'catan_active_online_session_v1';

export interface SavedOnlineSession {
  lobbyId: string;
  gameId: string | null;
  sessionToken: string;
  playerId: string;
}

export function loadSavedOnlineSession(): SavedOnlineSession | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY_ONLINE_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.sessionToken !== 'string' || !parsed.sessionToken) return null;
    if (typeof parsed.playerId !== 'string' || !parsed.playerId) return null;
    return {
      lobbyId: parsed.lobbyId ?? '',
      gameId: parsed.gameId ?? null,
      sessionToken: parsed.sessionToken,
      playerId: parsed.playerId
    };
  } catch {
    return null;
  }
}

export function saveOnlineSession(session: SavedOnlineSession | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY_ONLINE_SESSION);
    } else {
      window.localStorage.setItem(STORAGE_KEY_ONLINE_SESSION, JSON.stringify(session));
    }
  } catch {
    // ignore
  }
}

export function loadSavedPlayerName(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const saved = window.localStorage.getItem(STORAGE_KEY_PLAYER_NAME) || window.localStorage.getItem('catan_last_player_name');
    return saved && saved.trim() ? saved.trim() : null;
  } catch {
    return null;
  }
}

export function savePlayerName(name: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (name && name.trim()) {
      window.localStorage.setItem(STORAGE_KEY_PLAYER_NAME, name.trim());
    }
  } catch {
    // ignore
  }
}

export function loadSavedParticipants(defaultParticipants: ParticipantConfig[]): ParticipantConfig[] {
  if (typeof window === 'undefined' || !window.localStorage) return defaultParticipants;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PARTICIPANTS);
    if (!raw) return defaultParticipants;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultParticipants;

    const validParticipants: ParticipantConfig[] = [];
    const usedColors = new Set<string>();

    for (let i = 0; i < parsed.length && i < 6; i++) {
      const item = parsed[i];
      if (!item || typeof item !== 'object') continue;

      const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `p${i + 1}`;
      const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Participant ${i + 1}`;
      const type = item.type === 'human' ? 'human' : 'ai';

      let color = item.color as PlayerColor;
      if (!PLAYER_COLORS.includes(color) || usedColors.has(color)) {
        color = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[i % PLAYER_COLORS.length]!;
      }
      usedColors.add(color);

      const aiDifficulty = ['beginner', 'medium', 'advanced', 'expert'].includes(item.aiDifficulty)
        ? item.aiDifficulty
        : 'medium';

      const aiStyle = ['balanced', 'expansion', 'development', 'commercial', 'competitive', 'adaptive'].includes(item.aiStyle)
        ? item.aiStyle
        : 'balanced';

      validParticipants.push({
        id,
        name,
        type,
        color,
        ...(type !== 'human' ? { aiDifficulty, aiStyle } : {})
      });
    }

    return validParticipants.length > 0 ? validParticipants : defaultParticipants;
  } catch {
    return defaultParticipants;
  }
}

export function saveLobbyParticipants(participants: ParticipantConfig[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(participants));
    if (participants.length > 0 && participants[0]?.name) {
      savePlayerName(participants[0].name);
    }
  } catch {
    // ignore
  }
}

export function loadSavedRules(defaultRules: GameRulesConfig): GameRulesConfig {
  if (typeof window === 'undefined' || !window.localStorage) return defaultRules;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_RULES);
    if (!raw) return defaultRules;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultRules;
    return createRulesConfig(parsed);
  } catch {
    return defaultRules;
  }
}

export function saveLobbyRules(rules: GameRulesConfig): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

export function loadSavedTimerConfig(): { enabled: boolean; sec: number } | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TIMER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      enabled: Boolean(parsed.enabled),
      sec: typeof parsed.sec === 'number' && parsed.sec > 0 ? parsed.sec : 60
    };
  } catch {
    return null;
  }
}

export function saveLobbyTimer(enabled: boolean, sec: number): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_TIMER, JSON.stringify({ enabled, sec }));
  } catch {
    // ignore
  }
}

export function buildReplaySummary(replay: ReplayFile): SavedReplaySummary {
  const finalState =
    replay.snapshots.length > 0
      ? replay.snapshots[replay.snapshots.length - 1]!.state
      : replay.initialState;

  const winnerId = finalState.winnerId ?? null;
  const winnerPlayer = winnerId ? getPlayerById(finalState, winnerId) : undefined;
  const lastTurn =
    replay.events.length > 0
      ? replay.events[replay.events.length - 1]!.turn
      : finalState.turn;

  const participants = finalState.players.map((p) => {
    const score = calculateScore(finalState, p.id);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      color: p.color,
      finalScore: score.totalScore
    };
  });

  return {
    gameId: replay.gameId,
    seed: replay.seed,
    savedAt: new Date().toISOString(),
    turns: lastTurn,
    eventsCount: replay.events.length,
    winnerId,
    winnerName: winnerPlayer?.name ?? null,
    participants,
    replay
  };
}

export function loadSavedReplays(): SavedReplaySummary[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedReplaySummary[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveReplayToHistory(replay: ReplayFile, syncToServer = true): SavedReplaySummary[] {
  const summary = buildReplaySummary(replay);
  const existing = loadSavedReplays().filter((item) => item.gameId !== replay.gameId);
  const updated = [summary, ...existing].slice(0, MAX_SAVED_REPLAYS);

  if (typeof window !== 'undefined' && window.localStorage) {
    // A full ReplayFile (every event/snapshot/AI-decision candidate) is routinely several
    // megabytes; keeping one per history entry blew past localStorage's ~5-10MB quota after
    // just one or two games, silently dropping the rest. The server is the durable, now
    // gzip-compressed store for the full data - persist metadata only here, and let callers
    // without a cached `replay` fetch it back via `/api/games/:gameId/replay` on demand.
    const metadataOnly = updated.map(({ replay: _replay, ...meta }) => meta);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(metadataOnly));
    } catch {
      // ignore storage quota error
    }
  }

  if (syncToServer && typeof fetch !== 'undefined') {
    fetch('/api/replays/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(replay)
    })
      .then((res) => {
        // fetch() only rejects on network failure, not on a non-2xx status, so a rejected
        // import (e.g. previously the server's request-body size cap) would otherwise look
        // identical to success - log it instead of silently losing the game.
        if (!res.ok) {
          console.warn(
            `[catan] server rejected replay sync for game ${replay.gameId} (HTTP ${res.status}); it was kept locally only.`
          );
        }
      })
      .catch(() => {
        // Backend server optional when playing purely in browser
      });
  }

  return updated;
}

export function deleteSavedReplay(gameId: string): SavedReplaySummary[] {
  const existing = loadSavedReplays().filter((item) => item.gameId !== gameId);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch {
      // ignore
    }
  }
  return existing;
}
