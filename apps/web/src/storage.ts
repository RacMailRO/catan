import { ReplayFile, calculateScore, getPlayerById } from '@catan/core';

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
  replay: ReplayFile;
}

const STORAGE_KEY = 'catan_saved_replays_v2';
const MAX_SAVED_REPLAYS = 25;

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
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // If quota exceeded, keep top 8
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(0, 8)));
      } catch {
        // ignore storage quota error
      }
    }
  }

  if (syncToServer && typeof fetch !== 'undefined') {
    fetch('/api/replays/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(replay)
    }).catch(() => {
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
