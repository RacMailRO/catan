// Client-side glue for real cross-device multiplayer: creating/joining a lobby on the
// authoritative server (apps/server), polling its roster while waiting for players, and
// keeping gameplay state in sync via REST + WebSocket once the game has started.
//
// The server already redacts opponents' hands into a PlayerView (packages/core/src/engine.ts
// getPlayerView) — resources/devCards are only populated for the viewing player themselves,
// everyone else just gets a count. playerViewToGameState() below adapts that into a
// GameState-shaped object so the existing (local hot-seat) rendering code in App.tsx can be
// reused as-is for the online path too, with opponents' hidden resource types zero-filled
// (never read directly for anyone but the viewer — see the players sidebar's
// `p.resources ? <breakdown> : <count only>` branch).
import type {
  DevCardType,
  GameAction,
  GameEvent,
  GameRulesConfig,
  GameState,
  PlayerState,
  PlayerView,
  ResourceCount
} from '@catan/core';
import { createEmptyResources } from '@catan/core';

export interface LobbySeatState {
  seatIndex: number;
  playerId: string;
  name: string;
  type: 'human' | 'ai' | 'llm' | 'passive' | 'open';
  color: string;
  aiDifficulty?: string;
  aiStyle?: string;
  connected: boolean;
  claimedByPlayerName?: string;
}

export interface LobbyState {
  lobbyId: string;
  name: string;
  mode: 'local' | 'lan' | 'online';
  hostPlayerId: string;
  isPrivate: boolean;
  inviteCode?: string;
  seats: LobbySeatState[];
  status: 'waiting' | 'in_progress' | 'finished';
  gameId?: string;
}

export interface OnlineSession {
  lobbyId: string;
  gameId: string | null;
  sessionToken: string;
  playerId: string;
}

export interface GameSyncPayload {
  gameId: string;
  playerView: PlayerView;
  legalActions: GameAction[];
  recentEvents?: GameEvent[];
  aiDecisions?: unknown[];
}

async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export async function createOnlineLobby(params: {
  hostName: string;
  seats: { seatIndex: number; name: string; type: string; color?: string; aiDifficulty?: string; aiStyle?: string }[];
  rules?: GameRulesConfig;
  seed?: string;
}): Promise<{ lobby: LobbyState; sessionToken: string; playerId: string; inviteCode: string }> {
  const res = await fetch('/api/lobbies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Partidă Catan',
      hostName: params.hostName,
      mode: 'lan',
      isPrivate: true,
      seed: params.seed,
      rules: params.rules,
      seats: params.seats
    })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error ?? 'Nu s-a putut crea lobby-ul.');
  return data;
}

export async function joinOnlineLobbyByCode(
  inviteCode: string,
  playerName: string
): Promise<{ lobby: LobbyState; sessionToken: string; playerId: string; gameId?: string }> {
  const res = await fetch('/api/lobbies/join-by-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode, playerName })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error ?? 'Nu s-a putut realiza conectarea la partidă.');
  return data;
}

export async function fetchLobby(lobbyId: string): Promise<LobbyState> {
  const res = await fetch(`/api/lobbies/${lobbyId}`);
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error ?? 'Lobby negăsit.');
  return data.lobby;
}

export async function startOnlineLobby(lobbyId: string): Promise<GameSyncPayload & { lobby: LobbyState }> {
  const res = await fetch(`/api/lobbies/${lobbyId}/start`, { method: 'POST' });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error ?? 'Nu s-a putut porni partida.');
  return data;
}

export async function fetchGameState(gameId: string, sessionToken: string): Promise<GameSyncPayload> {
  const res = await fetch(`/api/games/${gameId}/state?sessionToken=${encodeURIComponent(sessionToken)}`);
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error ?? 'Nu s-a putut încărca starea partidei.');
  return data;
}

export async function submitOnlineAction(params: {
  gameId: string;
  sessionToken: string;
  playerId: string;
  expectedSequence?: number;
  action: unknown;
}): Promise<GameSyncPayload> {
  const res = await fetch(`/api/games/${params.gameId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionToken: params.sessionToken,
      playerId: params.playerId,
      expectedSequence: params.expectedSequence,
      action: params.action
    })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error ?? 'Mutare invalidă.');
  return data;
}

export function wsUrlForGame(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // The vite dev server (port 5173) serves the page but doesn't proxy WebSocket upgrades to
  // the backend, so local `npm run dev:web` + a separate `npm run dev:server` needs an
  // explicit port. Everywhere else — the backend serving itself on its own port, or a
  // reverse-proxied production domain (e.g. cPanel's "Setup Node.js App", which maps the
  // public domain/port 443 to an internal port chosen by the host, never 3001 publicly) —
  // HTTP and WebSocket already terminate on the same origin the page itself loaded from.
  if (window.location.port === '5173') {
    return `${protocol}://${window.location.hostname}:3001`;
  }
  return `${protocol}://${window.location.host}`;
}

export function playerViewToGameState(view: PlayerView): GameState {
  const players: PlayerState[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    type: p.type,
    aiDifficulty: p.aiDifficulty,
    aiStyle: p.aiStyle,
    connected: p.connected,
    resources: p.resources ? { ...p.resources } : createEmptyResources(),
    devCards: p.devCards ? [...p.devCards] : [],
    playedDevCardTypesThisTurn: p.playedDevCardTypesThisTurn,
    hasPlayedDevCardThisTurn: p.hasPlayedDevCardThisTurn,
    knightsPlayed: p.knightsPlayed,
    longestRoadLength: p.longestRoadLength,
    remainingPieces: p.remainingPieces
  }));

  return {
    gameId: view.gameId,
    engineVersion: 'online',
    seed: 'online',
    prngState: 0,
    sequence: view.sequence,
    turn: view.turn,
    rules: view.rules,
    board: view.board,
    players,
    playerOrder: view.playerOrder,
    activePlayerId: view.activePlayerId,
    phase: view.phase,
    setupStepIndex: 0,
    lastDiceRoll: view.lastDiceRoll,
    bank: view.bank,
    // Only .length is ever read on this (to disable "buy dev card" when empty) — the actual
    // card types aren't knowable from a redacted view, so this is a same-length placeholder.
    devCardDeck: Array(view.devCardDeckCount).fill('knight') as DevCardType[],
    pendingDiscards: view.pendingDiscards,
    robberContext: view.robberEligibleTargetIds
      ? { source: 'dice_7', returnPhase: 'turn_start', eligibleTargetIds: view.robberEligibleTargetIds }
      : undefined,
    freeRoadsRemaining: view.freeRoadsRemaining,
    activeTradeOffers: view.activeTradeOffers,
    longestRoadOwnerId: view.longestRoadOwnerId,
    largestArmyOwnerId: view.largestArmyOwnerId,
    winnerId: view.winnerId,
    startedAtMs: 0
  };
}

export function emptyResourceCount(): ResourceCount {
  return createEmptyResources();
}
