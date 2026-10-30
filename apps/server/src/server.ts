import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { WebSocket, WebSocketServer } from 'ws';
import {
  AIDecisionRecord,
  GameAction,
  GameEvent,
  GameState,
  PLAYER_COLORS,
  ParticipantConfig,
  ReplayFile,
  ReplayRecorder,
  applyAction,
  createGame,
  createRulesConfig,
  expireStaleTradesInPlace,
  getLegalActions,
  getPlayerById,
  getPlayerView,
  hasResources,
  importReplayJson,
  validateAction
} from '@catan/core';
import {
  analyzeDecisionAtSequence,
  analyzeReplayGame,
  chooseAIAction,
  runBenchmarkSuite,
  runSimulatedGame
} from '@catan/ai';
import {
  ClientToServerWsMessageSchema,
  ConfigureLobbyRequestSchema,
  CreateLobbyRequestSchema,
  JoinLobbyRequestSchema,
  LobbySeatState,
  LobbyState,
  ServerToClientWsMessage,
  SubmitActionRequestSchema
} from '@catan/protocol';
import { CatanStorage } from './db';

interface TerminationRequest {
  requestedAtMs: number;
  expiresAtMs: number;
  humanPlayerIds: string[];
  confirmations: Set<string>;
  denials: Set<string>;
  timer: NodeJS.Timeout;
}

interface ActiveGameRuntime {
  gameId: string;
  lobbyId?: string;
  state: GameState;
  events: GameEvent[];
  aiDecisions: AIDecisionRecord[];
  replay: ReplayFile;
  pendingTermination?: TerminationRequest;
  terminationDismissed?: boolean;
}

function serializePendingTermination(req?: TerminationRequest) {
  if (!req) return null;
  return {
    requestedAtMs: req.requestedAtMs,
    expiresAtMs: req.expiresAtMs,
    remainingSec: Math.max(0, Math.ceil((req.expiresAtMs - Date.now()) / 1000)),
    humanPlayerIds: req.humanPlayerIds,
    confirmedCount: req.confirmations.size,
    deniedCount: req.denials.size
  };
}

interface WsClientConnection {
  ws: WebSocket;
  gameId: string;
  playerId: string;
  sessionToken: string;
}

// Matches localhost and private LAN addresses (RFC 1918 + loopback)
const PRIVATE_NETWORK_HOSTNAME_RE =
  /^(localhost|127\.0\.0\.1|\[?::1\]?|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;

export function resolveAllowedOrigin(
  originHeader: string | undefined,
  hostHeader?: string
): string | undefined {
  if (!originHeader) return undefined;
  try {
    const originUrl = new URL(originHeader);
    const originHostname = originUrl.hostname.toLowerCase();

    // 1. Same-Origin check: if origin hostname matches the server's Host header
    if (hostHeader) {
      const hostWithoutPort = hostHeader.split(':')[0]?.trim().toLowerCase();
      if (hostWithoutPort && originHostname === hostWithoutPort) {
        return originHeader;
      }
    }

    // 2. Private LAN & Localhost
    if (PRIVATE_NETWORK_HOSTNAME_RE.test(originHostname)) {
      return originHeader;
    }

    // 3. Known production domains & custom configured ALLOWED_ORIGINS env var
    // Default allowed domains include catan.d10.ro and d10.ro
    const rawAllowed = process.env.ALLOWED_ORIGINS ?? 'catan.d10.ro,d10.ro';
    const customAllowed = rawAllowed
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    for (const allowed of customAllowed) {
      if (
        allowed === '*' ||
        originHostname === allowed ||
        originHostname.endsWith(`.${allowed}`)
      ) {
        return originHeader;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

// Repo root, resolved from this file's own location (apps/server/src/server.ts) rather than
// process.cwd(), which varies depending on how the server is launched (npm workspace script
// vs vitest vs cli-server.ts).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface VersionInfo {
  version: string;
  commitCount: number;
  shortHash: string;
  releaseNotes: { hash: string; date: string; message: string }[];
}

function readStaticVersionFile(): VersionInfo | null {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(REPO_ROOT, 'version.json'),
    path.resolve(REPO_ROOT, 'apps/server/dist/version.json'),
    path.resolve(REPO_ROOT, 'apps/web/dist/version.json'),
    path.resolve(currentDir, 'version.json'),
    path.resolve(currentDir, '../version.json'),
    path.resolve(process.cwd(), 'version.json'),
    path.resolve(process.cwd(), 'dist/version.json'),
    path.resolve(process.cwd(), 'apps/server/dist/version.json'),
    path.resolve(process.cwd(), 'apps/web/dist/version.json')
  ];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        if (parsed && typeof parsed.version === 'string' && Array.isArray(parsed.releaseNotes)) {
          return {
            version: parsed.version,
            commitCount: typeof parsed.commitCount === 'number' ? parsed.commitCount : 0,
            shortHash: typeof parsed.shortHash === 'string' ? parsed.shortHash : 'dist',
            releaseNotes: parsed.releaseNotes
          };
        }
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

// Version/release-notes are read live from git when available (e.g. during local dev),
// and fallback smoothly to the pre-generated version.json artifact when deployed to production
// environments (e.g. shared cPanel / FTP) where .git and git binary are absent.
function getVersionInfo(): VersionInfo {
  try {
    const commitCount = parseInt(
      execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf-8' }).trim(),
      10
    );
    const shortHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8'
    }).trim();
    const logRaw = execFileSync(
      'git',
      ['log', '-50', '--pretty=format:%h%x1f%ad%x1f%s', '--date=short'],
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    const releaseNotes = logRaw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, date, message] = line.split('\x1f');
        return { hash: hash ?? '', date: date ?? '', message: message ?? '' };
      });
    if (Number.isFinite(commitCount) && commitCount > 0) {
      return {
        version: `v1.${commitCount}`,
        commitCount,
        shortHash,
        releaseNotes
      };
    }
  } catch {
    // Git is not available (e.g. production FTP deployment, container, or missing .git)
  }

  const staticInfo = readStaticVersionFile();
  if (staticInfo) {
    return staticInfo;
  }

  return { version: 'v1.0-dev', commitCount: 0, shortHash: 'n/a', releaseNotes: [] };
}

export interface CatanServerInstance {
  httpServer: http.Server;
  storage: CatanStorage;
  listen(port?: number, host?: string): Promise<{ port: number; url: string }>;
  close(): Promise<void>;
}

export function createCatanServer(options?: {
  dbPath?: string;
  assetsDir?: string;
  autoStepAiMaxBatch?: number;
  maxConcurrentGames?: number;
  /** apps/web's built output (vite build). When present, this one server also serves the
   * frontend — so deploying just means running this process on the host, no separate static
   * host or vite process needed. Defaults to apps/web/dist next to this file's own repo. */
  webDistDir?: string;
}): CatanServerInstance {
  const storage = new CatanStorage(options?.dbPath ?? ':memory:');
  const activeGames = new Map<string, ActiveGameRuntime>();
  const wsClients = new Set<WsClientConnection>();
  const rateLimits = new Map<string, { count: number; windowStartMs: number }>();
  const autoStepAiMaxBatch = options?.autoStepAiMaxBatch ?? 80;
  const maxConcurrentGames = options?.maxConcurrentGames ?? Number(process.env.MAX_CONCURRENT_GAMES ?? 10);

  function countActiveConcurrentGames(): number {
    let count = 0;
    for (const runtime of activeGames.values()) {
      if (runtime.state.phase !== 'game_over') {
        count++;
      }
    }
    return count;
  }
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateWebDistDirs = [
    options?.webDistDir,
    path.resolve(currentDir, 'public'),
    path.resolve(currentDir, '../public'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(REPO_ROOT, 'apps/web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), 'public_html'),
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'dist/public'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(currentDir, '../../web/dist'),
    path.resolve(currentDir, '../web/dist'),
    process.cwd()
  ].filter((d): d is string => Boolean(d && fs.existsSync(path.join(d, 'index.html'))));
  const webDistDir = candidateWebDistDirs[0] ?? path.resolve(REPO_ROOT, 'apps/web/dist');

  function checkRateLimit(key: string, maxPerWindow = 120, windowMs = 5000): boolean {
    const now = Date.now();
    const entry = rateLimits.get(key);
    if (!entry || now - entry.windowStartMs > windowMs) {
      rateLimits.set(key, { count: 1, windowStartMs: now });
      return true;
    }
    entry.count += 1;
    return entry.count <= maxPerWindow;
  }

  function loadOrGetGameRuntime(gameId: string): ActiveGameRuntime | undefined {
    const mem = activeGames.get(gameId);
    if (mem) return mem;
    const stored = storage.getGameAndReplay(gameId);
    if (!stored) return undefined;
    const runtime: ActiveGameRuntime = {
      gameId,
      lobbyId: stored.lobbyId ?? storage.getLobbyByGameId(gameId)?.lobbyId,
      state: stored.state,
      events: stored.replay.events,
      aiDecisions: stored.replay.aiDecisions,
      replay: stored.replay
    };
    activeGames.set(gameId, runtime);
    return runtime;
  }

  function persistRuntime(runtime: ActiveGameRuntime): void {
    runtime.replay.events = structuredClone(runtime.events);
    runtime.replay.aiDecisions = structuredClone(runtime.aiDecisions);
    if (
      runtime.state.sequence % 15 === 0 ||
      runtime.state.phase === 'game_over'
    ) {
      const existingSnap = runtime.replay.snapshots.some(
        (s) => s.sequence === runtime.state.sequence
      );
      if (!existingSnap) {
        const lastEv = runtime.events[runtime.events.length - 1];
        runtime.replay.snapshots.push({
          sequence: runtime.state.sequence,
          turn: runtime.state.turn,
          stateHash: lastEv?.stateHashAfter ?? '00000000',
          state: structuredClone(runtime.state)
        });
      }
    }
    storage.saveGameAndReplay(runtime.state, runtime.replay, runtime.lobbyId);

    // Mark the lobby finished once the game ends, so the public lobby/spectator list (which
    // otherwise only ever sees 'waiting' -> 'in_progress') stops offering a dead game to join
    // or watch.
    if (runtime.state.phase === 'game_over') {
      if (runtime.lobbyId) {
        storage.markLobbyFinished(runtime.lobbyId);
      }
      storage.markLobbyFinished(runtime.gameId);
      storage.recordHallOfFameResultIfNew(runtime.state);
    }
  }

  function executeBotStepsUntilHumanNeeded(
    runtime: ActiveGameRuntime,
    maxSteps = autoStepAiMaxBatch
  ): void {
    let steps = 0;
    while (runtime.state.phase !== 'game_over' && steps < maxSteps) {
      // Determine which player needs to act right now
      let nextActorId: string | undefined;

      if (runtime.state.phase === 'discard_resources') {
        const pendingIds = Object.keys(runtime.state.pendingDiscards);
        // Find if any AI or passive bot has pending discards
        const botDiscardId = pendingIds.find((id) => {
          const p = getPlayerById(runtime.state, id);
          return p && p.type !== 'human';
        });
        if (botDiscardId) {
          nextActorId = botDiscardId;
        } else {
          // Waiting on human player to discard
          break;
        }
      } else {
        // Also check if any AI needs to respond to an open trade offer proposed by a human
        if (runtime.state.phase === 'main_actions') {
          const openOffer = runtime.state.activeTradeOffers.find((o) => o.status === 'open');
          if (openOffer) {
            const responderBot = runtime.state.players.find(
              (p) =>
                p.id !== openOffer.fromPlayerId &&
                p.type !== 'human' &&
                (!openOffer.toPlayerId || openOffer.toPlayerId === p.id) &&
                !openOffer.rejectedByPlayerIds.includes(p.id)
            );
            if (responderBot) {
              nextActorId = responderBot.id;
            } else {
              // An open trade offer exists and no bots are left to respond.
              // If any human player has not yet responded, stop AI stepping and wait for human input!
              const pendingHuman = runtime.state.players.find(
                (p) =>
                  p.id !== openOffer.fromPlayerId &&
                  p.type === 'human' &&
                  (!openOffer.toPlayerId || openOffer.toPlayerId === p.id) &&
                  !openOffer.rejectedByPlayerIds.includes(p.id)
              );
              if (pendingHuman) {
                // A human who can't even afford what's being asked is never shown the accept/
                // reject modal client-side (see App.tsx) - waiting on them to act would stall
                // every other player's turn forever, since nothing else ever nudges this loop
                // again. Answer on their behalf instead of blocking; a human who CAN afford it
                // still gets a real say below.
                if (!hasResources(pendingHuman.resources, openOffer.requesting)) {
                  const { state: nextState, event } = applyAction(
                    runtime.state,
                    pendingHuman.id,
                    { type: 'respond_trade', offerId: openOffer.id, response: 'reject', reason: 'Resurse insuficiente' },
                    { nowMs: Date.now() }
                  );
                  runtime.state = nextState;
                  runtime.events.push(event);
                  steps++;
                  continue;
                }
                break;
              }
            }
          }
        }

        if (!nextActorId) {
          const activePlayer = getPlayerById(runtime.state, runtime.state.activePlayerId);
          if (activePlayer && activePlayer.type !== 'human') {
            nextActorId = activePlayer.id;
          }
        }
      }

      if (!nextActorId) {
        break;
      }

      const decision = chooseAIAction(runtime.state, nextActorId);
      runtime.aiDecisions.push(decision.decisionRecord);
      const { state: nextState, event } = applyAction(
        runtime.state,
        nextActorId,
        decision.action,
        {
          nowMs: Date.now(),
          aiDecisionId: decision.decisionRecord.id
        }
      );
      runtime.state = nextState;
      runtime.events.push(event);
      steps++;
    }

    if (steps > 0) {
      persistRuntime(runtime);
    }
  }

  function broadcastGameSync(runtime: ActiveGameRuntime): void {
    for (const client of wsClients) {
      if (client.gameId !== runtime.gameId) continue;
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      const msg: ServerToClientWsMessage = {
        type: 'state_sync',
        gameId: runtime.gameId,
        playerView: getPlayerView(runtime.state, client.playerId),
        legalActions: getLegalActions(runtime.state, client.playerId),
        recentEvents: runtime.events.slice(-25),
        aiDecisions: runtime.aiDecisions.slice(-15),
        pendingTermination: serializePendingTermination(runtime.pendingTermination),
        terminationDismissed: Boolean(runtime.terminationDismissed)
      };
      client.ws.send(JSON.stringify(msg));
    }
  }

  // 24MB: lobby/action payloads are tiny, but a full replay import (initial state + every
  // event/snapshot/AI-decision for a long game) has been observed up to ~8MB raw JSON before
  // gzip compression at rest - keep real headroom above that instead of silently dropping imports.
  const MAX_REQUEST_BODY_BYTES = 24 * 1024 * 1024;

  async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_REQUEST_BODY_BYTES) {
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(raw ? JSON.parse(raw) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(payload));
  }

  const httpServer = http.createServer(async (req, res) => {
    const allowedOrigin = resolveAllowedOrigin(req.headers.origin, req.headers.host);
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
    }
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
      }

      const urlObj = new URL(req.url ?? '/', 'http://localhost');
      const pathname = urlObj.pathname;

      // Serve static image assets from /poze/*
      if (req.method === 'GET' && pathname.startsWith('/poze/')) {
        const relFile = decodeURIComponent(pathname.slice('/poze/'.length));
        const baseDir = options?.assetsDir ?? path.resolve(process.cwd(), 'poze');
        const safePath = path.resolve(baseDir, path.basename(relFile));
        if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
          const ext = path.extname(safePath).toLowerCase();
          const mimeMap: Record<string, string> = {
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.gif': 'image/gif'
          };
          res.writeHead(200, {
            'Content-Type': mimeMap[ext] ?? 'application/octet-stream'
          });
          fs.createReadStream(safePath).pipe(res);
          return;
        }
        sendJson(res, 404, { error: 'Asset not found' });
        return;
      }

      // Health check
      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { status: 'ok', timestampMs: Date.now() });
        return;
      }

      // App version (commit count) + recent commit log, read live from git — see getVersionInfo
      if (req.method === 'GET' && pathname === '/api/version') {
        sendJson(res, 200, getVersionInfo());
        return;
      }

      // This machine's LAN IPv4 addresses — so an invite link built on the host (who usually
      // opens the game via http://localhost:5173) can point guests at an address that actually
      // reaches this machine from elsewhere on the network, instead of their own "localhost".
      if (req.method === 'GET' && pathname === '/api/lan-info') {
        const lanIps: string[] = [];
        for (const list of Object.values(os.networkInterfaces())) {
          if (!list) continue;
          for (const iface of list) {
            if (iface.family === 'IPv4' && !iface.internal) lanIps.push(iface.address);
          }
        }
        sendJson(res, 200, { lanIps });
        return;
      }


      // Join lobby by invite code or lobby ID directly
      if (req.method === 'POST' && pathname === '/api/lobbies/join-by-code') {
        const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
        const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
        const playerName = typeof body.playerName === 'string' && body.playerName.trim() ? body.playerName.trim() : 'Jucător Oaspete';

        if (!inviteCode) {
          sendJson(res, 400, { error: 'Codul de invitație este obligatoriu' });
          return;
        }

        const lobby = storage.getLobbyByInviteCode(inviteCode);
        if (!lobby) {
          sendJson(res, 404, { error: 'Partida nu a fost găsită. Verifică codul de invitație.' });
          return;
        }

        const cleanName = playerName.trim();
        // 1. Check if this player is reconnecting to their existing seat in this lobby
        let targetSeat = lobby.seats.find(
          (s) =>
            (s.claimedByPlayerName && s.claimedByPlayerName.trim().toLowerCase() === cleanName.toLowerCase()) ||
            (s.name && s.name.trim().toLowerCase() === cleanName.toLowerCase())
        );

        // 2. Otherwise find an open or unclaimed seat
        if (!targetSeat) {
          targetSeat = lobby.seats.find(
            (s) => s.type === 'open' || (s.type === 'human' && !s.claimedByPlayerName)
          ) ?? (lobby.status === 'waiting' ? lobby.seats.find((s) => s.type === 'human' && s.playerId !== lobby.hostPlayerId) : undefined);
        }

        if (!targetSeat) {
          sendJson(res, 400, { error: 'Nu mai sunt locuri libere în această partidă.' });
          return;
        }

        targetSeat.type = 'human';
        targetSeat.name = playerName;
        targetSeat.claimedByPlayerName = playerName;
        targetSeat.connected = true;

        const sessionToken = `sess_${crypto.randomBytes(12).toString('hex')}`;
        storage.saveLobby(lobby);
        storage.saveSession({
          sessionToken,
          lobbyId: lobby.lobbyId,
          playerId: targetSeat.playerId,
          playerName: targetSeat.name,
          createdAtMs: Date.now()
        });

        sendJson(res, 200, {
          lobby,
          sessionToken,
          playerId: targetSeat.playerId,
          gameId: lobby.gameId
        });
        return;
      }

      // List lobbies
      if (req.method === 'GET' && pathname === '/api/lobbies') {
        const now = Date.now();
        const maxAgeMs = 24 * 3600 * 1000;
        const lobbies = storage.listLobbies().filter((l) => {
          if (l.isPrivate) return false;
          if (l.status === 'finished') return false;
          if (l.createdAtMs && now - l.createdAtMs > maxAgeMs) return false;
          if (l.status === 'in_progress' && l.gameId) {
            const mem = activeGames.get(l.gameId);
            if (mem && mem.state.phase === 'game_over') {
              storage.markLobbyFinished(l.lobbyId);
              return false;
            }
            const stored = storage.getGameAndReplay(l.gameId);
            if (stored && stored.state.phase === 'game_over') {
              storage.markLobbyFinished(l.lobbyId);
              return false;
            }
          }
          return true;
        }).map((l) => {
          const mem = l.gameId ? activeGames.get(l.gameId) : undefined;
          return {
            ...l,
            pendingTermination: Boolean(mem?.pendingTermination),
            terminationDismissed: Boolean(mem?.terminationDismissed)
          };
        });
        sendJson(res, 200, {
          lobbies,
          activeGamesCount: countActiveConcurrentGames(),
          maxConcurrentGames
        });
        return;
      }

      // Create lobby
      if (req.method === 'POST' && pathname === '/api/lobbies') {
        const body = await readJsonBody(req);
        const parsed = CreateLobbyRequestSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid lobby parameters', issues: parsed.error.issues });
          return;
        }

        const data = parsed.data;
        const lobbyId = `lob_${crypto.randomBytes(5).toString('hex')}`;
        const inviteCode = crypto.randomBytes(6).toString('hex');
        const rules = createRulesConfig(data.rules);

        const defaultSeats = data.seats ?? [
          { seatIndex: 0, name: data.hostName, type: 'human' as const, color: 'red' as const },
          {
            seatIndex: 1,
            name: 'Adversar Tactic',
            type: 'ai' as const,
            color: 'blue' as const,
            aiDifficulty: 'advanced' as const,
            aiStyle: 'expansion' as const
          },
          {
            seatIndex: 2,
            name: 'Adversar Comercial',
            type: 'ai' as const,
            color: 'orange' as const,
            aiDifficulty: 'medium' as const,
            aiStyle: 'commercial' as const
          },
          {
            seatIndex: 3,
            name: 'Adversar Strategic',
            type: 'ai' as const,
            color: 'green' as const,
            aiDifficulty: 'expert' as const,
            aiStyle: 'adaptive' as const
          }
        ];

        const seats: LobbySeatState[] = defaultSeats.map((s, idx) => ({
          ...s,
          seatIndex: idx,
          playerId: `p${idx + 1}`,
          color: s.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
          connected: s.type !== 'open',
          claimedByPlayerName: s.type === 'human' && idx === 0 ? data.hostName : undefined
        }));

        const hostSeat = seats.find((s) => s.type === 'human') ?? seats[0]!;
        const hostPlayerId = hostSeat.playerId;

        const lobby: LobbyState = {
          lobbyId,
          name: data.name,
          mode: data.mode,
          hostPlayerId,
          isPrivate: data.isPrivate,
          inviteCode,
          disconnectPolicy: data.disconnectPolicy,
          rules,
          seed: data.seed,
          seats,
          status: 'waiting',
          createdAtMs: Date.now()
        };

        const sessionToken = `sess_${crypto.randomBytes(12).toString('hex')}`;
        storage.saveLobby(lobby);
        storage.saveSession({
          sessionToken,
          lobbyId,
          playerId: hostPlayerId,
          playerName: hostSeat.name,
          createdAtMs: Date.now()
        });

        sendJson(res, 201, {
          lobby,
          sessionToken,
          playerId: hostPlayerId,
          inviteCode
        });
        return;
      }

      // Get specific lobby
      const lobbyMatch = pathname.match(/^\/api\/lobbies\/([^/]+)$/);
      if (req.method === 'GET' && lobbyMatch) {
        const lobby = storage.getLobby(lobbyMatch[1]!);
        if (!lobby) {
          sendJson(res, 404, { error: 'Lobby not found' });
          return;
        }
        sendJson(res, 200, { lobby });
        return;
      }

      // Terminate / Delete an active or waiting lobby
      const terminateLobbyMatch = pathname.match(/^\/api\/lobbies\/([^/]+)\/terminate$/);
      if ((req.method === 'POST' && terminateLobbyMatch) || (req.method === 'DELETE' && lobbyMatch)) {
        const lobbyId = terminateLobbyMatch ? terminateLobbyMatch[1]! : lobbyMatch![1]!;
        const lobby = storage.getLobby(lobbyId);
        if (!lobby) {
          sendJson(res, 404, { error: 'Lobby not found' });
          return;
        }

        lobby.status = 'finished';
        storage.saveLobby(lobby);

        // If the lobby already spawned a game, terminate the game runtime as well
        if (lobby.gameId) {
          const runtime = loadOrGetGameRuntime(lobby.gameId);
          if (runtime) {
            runtime.state.phase = 'game_over';
            persistRuntime(runtime);
            activeGames.delete(lobby.gameId);
            broadcastGameSync(runtime);
          }
        }

        sendJson(res, 200, { success: true, lobbyId, status: 'finished' });
        return;
      }

      // Configure lobby
      const configMatch = pathname.match(/^\/api\/lobbies\/([^/]+)\/configure$/);
      if (req.method === 'POST' && configMatch) {
        const lobby = storage.getLobby(configMatch[1]!);
        if (!lobby) {
          sendJson(res, 404, { error: 'Lobby not found' });
          return;
        }
        if (lobby.status !== 'waiting') {
          sendJson(res, 400, { error: 'Lobby already started' });
          return;
        }
        const body = await readJsonBody(req);
        const parsed = ConfigureLobbyRequestSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid configuration', issues: parsed.error.issues });
          return;
        }
        const session = storage.getSession(parsed.data.sessionToken);
        if (!session || session.lobbyId !== lobby.lobbyId || session.playerId !== lobby.hostPlayerId) {
          sendJson(res, 403, { error: 'Only the host can configure the lobby' });
          return;
        }

        if (parsed.data.rules) {
          lobby.rules = createRulesConfig({ ...lobby.rules, ...parsed.data.rules });
        }
        if (parsed.data.disconnectPolicy) {
          lobby.disconnectPolicy = parsed.data.disconnectPolicy;
        }
        if (parsed.data.seed !== undefined) {
          lobby.seed = parsed.data.seed;
        }
        if (parsed.data.seats) {
          lobby.seats = parsed.data.seats.map((s, idx) => ({
            ...s,
            seatIndex: idx,
            playerId: `p${idx + 1}`,
            color: s.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
            connected: s.type !== 'open'
          }));
        }

        storage.saveLobby(lobby);
        sendJson(res, 200, { lobby });
        return;
      }

      // Join lobby
      const joinMatch = pathname.match(/^\/api\/lobbies\/([^/]+)\/join$/);
      if (req.method === 'POST' && joinMatch) {
        const lobby = storage.getLobby(joinMatch[1]!);
        if (!lobby) {
          sendJson(res, 404, { error: 'Lobby not found' });
          return;
        }

        const body = await readJsonBody(req);
        const parsed = JoinLobbyRequestSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid join request', issues: parsed.error.issues });
          return;
        }

        // Check reconnect with existing sessionToken
        if (parsed.data.sessionToken) {
          const existingSession = storage.getSession(parsed.data.sessionToken);
          if (existingSession && existingSession.lobbyId === lobby.lobbyId) {
            sendJson(res, 200, {
              lobby,
              sessionToken: existingSession.sessionToken,
              playerId: existingSession.playerId,
              gameId: lobby.gameId
            });
            return;
          }
        }

        if (lobby.isPrivate && parsed.data.inviteCode !== lobby.inviteCode) {
          sendJson(res, 403, { error: 'Invalid or missing invite code for private lobby' });
          return;
        }

        const targetSeat =
          parsed.data.seatIndex !== undefined
            ? lobby.seats[parsed.data.seatIndex]
            : lobby.seats.find(
                (s) => s.type === 'open' || (s.type === 'human' && !s.claimedByPlayerName)
              );

        if (!targetSeat) {
          sendJson(res, 400, { error: 'No available seat in lobby' });
          return;
        }

        targetSeat.type = 'human';
        targetSeat.name = parsed.data.playerName;
        targetSeat.claimedByPlayerName = parsed.data.playerName;
        targetSeat.connected = true;

        const sessionToken = `sess_${crypto.randomBytes(12).toString('hex')}`;
        storage.saveLobby(lobby);
        storage.saveSession({
          sessionToken,
          lobbyId: lobby.lobbyId,
          gameId: lobby.gameId,
          playerId: targetSeat.playerId,
          playerName: parsed.data.playerName,
          createdAtMs: Date.now()
        });

        sendJson(res, 200, {
          lobby,
          sessionToken,
          playerId: targetSeat.playerId
        });
        return;
      }

      // Rename seat in lobby
      const renameMatch = pathname.match(/^\/api\/lobbies\/([^/]+)\/rename$/);
      if (req.method === 'POST' && renameMatch) {
        const lobby = storage.getLobby(renameMatch[1]!);
        if (!lobby) {
          sendJson(res, 404, { error: 'Lobby not found' });
          return;
        }
        const body = (await readJsonBody(req)) as { sessionToken?: string; newName?: string };
        const newName = body.newName?.trim();
        if (!newName || newName.length > 40) {
          sendJson(res, 400, { error: 'Invalid name. Name must be between 1 and 40 characters.' });
          return;
        }
        const session = body.sessionToken ? storage.getSession(body.sessionToken) : null;
        if (!session || session.lobbyId !== lobby.lobbyId) {
          sendJson(res, 403, { error: 'Invalid or missing session' });
          return;
        }
        const seat = lobby.seats.find((s) => s.playerId === session.playerId);
        if (seat) {
          seat.name = newName;
          seat.claimedByPlayerName = newName;
        }
        session.playerName = newName;
        storage.saveSession(session);
        storage.saveLobby(lobby);

        if (lobby.gameId) {
          const runtime = loadOrGetGameRuntime(lobby.gameId);
          if (runtime) {
            const player = runtime.state.players.find((p) => p.id === session.playerId);
            if (player) {
              player.name = newName;
              persistRuntime(runtime);
              broadcastGameSync(runtime);
            }
          }
        }

        sendJson(res, 200, { lobby });
        return;
      }

      // Rename player in active game
      const gameRenameMatch = pathname.match(/^\/api\/games\/([^/]+)\/rename$/);
      if (req.method === 'POST' && gameRenameMatch) {
        const gameId = gameRenameMatch[1]!;
        const runtime = loadOrGetGameRuntime(gameId);
        if (!runtime) {
          sendJson(res, 404, { error: 'Game not found' });
          return;
        }
        const body = (await readJsonBody(req)) as { sessionToken?: string; newName?: string };
        const newName = body.newName?.trim();
        if (!newName || newName.length > 40) {
          sendJson(res, 400, { error: 'Invalid name. Must be 1-40 characters.' });
          return;
        }
        const session = body.sessionToken ? storage.getSession(body.sessionToken) : null;
        if (!session) {
          sendJson(res, 403, { error: 'Invalid session token' });
          return;
        }
        const player = runtime.state.players.find((p) => p.id === session.playerId);
        if (!player) {
          sendJson(res, 404, { error: 'Player not in this game' });
          return;
        }
        player.name = newName;
        session.playerName = newName;
        storage.saveSession(session);
        persistRuntime(runtime);
        broadcastGameSync(runtime);
        sendJson(res, 200, { success: true, newName });
        return;
      }

      // Start game from lobby
      const startMatch = pathname.match(/^\/api\/lobbies\/([^/]+)\/start$/);
      if (req.method === 'POST' && startMatch) {
        const lobby = storage.getLobby(startMatch[1]!);
        if (!lobby) {
          sendJson(res, 404, { error: 'Lobby not found' });
          return;
        }
        if (lobby.gameId) {
          const existingRuntime = loadOrGetGameRuntime(lobby.gameId);
          if (existingRuntime) {
            sendJson(res, 200, {
              lobby,
              gameId: lobby.gameId,
              playerView: getPlayerView(existingRuntime.state, lobby.hostPlayerId),
              legalActions: getLegalActions(existingRuntime.state, lobby.hostPlayerId)
            });
            return;
          }
        }

        if (countActiveConcurrentGames() >= maxConcurrentGames) {
          sendJson(res, 429, {
            error: `Serverul a atins limita maximă de partide active simultan (${maxConcurrentGames}). Te rugăm să aștepți finalizarea unei partide existente.`
          });
          return;
        }

        const activeSeats = lobby.seats.filter((s) => s.type !== 'open');
        if (activeSeats.length === 0) {
          sendJson(res, 400, { error: 'Lobby must have at least 1 active participant' });
          return;
        }

        const participants: ParticipantConfig[] = activeSeats.map((s) => ({
          id: s.playerId,
          name: s.name,
          type: s.type === 'open' ? 'passive' : s.type,
          color: s.color,
          aiDifficulty: s.aiDifficulty,
          aiStyle: s.aiStyle
        }));

        const gameId = `game_${crypto.randomBytes(5).toString('hex')}`;
        const initialState = createGame({
          gameId,
          seed: lobby.seed ?? `seed-${gameId}`,
          participants,
          rules: lobby.rules
        });

        const recorder = new ReplayRecorder(initialState, 15);
        const runtime: ActiveGameRuntime = {
          gameId,
          lobbyId: lobby.lobbyId,
          state: initialState,
          events: [],
          aiDecisions: [],
          replay: recorder.toReplayFile()
        };

        lobby.status = 'in_progress';
        lobby.gameId = gameId;
        storage.saveLobby(lobby);
        storage.updateSessionsGameId(lobby.lobbyId, gameId);
        activeGames.set(gameId, runtime);
        persistRuntime(runtime);

        // If first player is an AI and there is at least 1 human player in the game, advance until human's turn
        const hasAnyHuman = runtime.state.players.some((p) => p.type === 'human');
        if (hasAnyHuman) {
          executeBotStepsUntilHumanNeeded(runtime);
        } else {
          // All-AI / Spectator mode: advance initial batch so setup phase begins autonomously
          executeBotStepsUntilHumanNeeded(runtime, 8);
        }

        sendJson(res, 200, {
          lobby,
          gameId,
          playerView: getPlayerView(runtime.state, lobby.hostPlayerId),
          legalActions: getLegalActions(runtime.state, lobby.hostPlayerId),
          recentEvents: runtime.events.slice(-25),
          aiDecisions: runtime.aiDecisions.slice(-15)
        });
        return;
      }

      // Get game state projection for a player
      const stateMatch = pathname.match(/^\/api\/games\/([^/]+)\/state$/);
      if (req.method === 'GET' && stateMatch) {
        const gameId = stateMatch[1]!;
        const runtime = loadOrGetGameRuntime(gameId);
        if (!runtime) {
          sendJson(res, 404, { error: 'Game not found' });
          return;
        }

        expireStaleTradesInPlace(runtime.state);

        const hasAnyHuman = runtime.state.players.some((p) => p.type === 'human');
        if (!hasAnyHuman && runtime.state.phase !== 'game_over') {
          executeBotStepsUntilHumanNeeded(runtime, 4);
          persistRuntime(runtime);
          broadcastGameSync(runtime);
        }

        const sessionToken = urlObj.searchParams.get('sessionToken');
        const queryViewerId = urlObj.searchParams.get('viewerId');
        let viewerId = queryViewerId ?? runtime.state.activePlayerId;

        if (sessionToken) {
          const session = storage.getSession(sessionToken);
          if (session) {
            viewerId = session.playerId;
          }
        }

        sendJson(res, 200, {
          gameId,
          playerView: getPlayerView(runtime.state, viewerId),
          legalActions: getLegalActions(runtime.state, viewerId),
          recentEvents: runtime.events.slice(-30),
          aiDecisions: runtime.aiDecisions.slice(-20),
          pendingTermination: serializePendingTermination(runtime.pendingTermination),
          terminationDismissed: Boolean(runtime.terminationDismissed)
        });
        return;
      }

      // Submit player action
      const actionMatch = pathname.match(/^\/api\/games\/([^/]+)\/action$/);
      if (req.method === 'POST' && actionMatch) {
        const gameId = actionMatch[1]!;
        const runtime = loadOrGetGameRuntime(gameId);
        if (!runtime) {
          sendJson(res, 404, { error: 'Game not found' });
          return;
        }

        const body = await readJsonBody(req);
        const parsed = SubmitActionRequestSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, {
            error: 'Invalid action payload',
            code: 'INVALID_PAYLOAD',
            issues: parsed.error.issues
          });
          return;
        }

        const { sessionToken, playerId, expectedSequence, action } = parsed.data;
        if (!checkRateLimit(sessionToken)) {
          sendJson(res, 429, { error: 'Too many requests', code: 'RATE_LIMITED' });
          return;
        }

        const session = storage.getSession(sessionToken);
        if (!session || session.playerId !== playerId) {
          sendJson(res, 403, {
            error: 'Unauthorized session for playerId',
            code: 'UNAUTHORIZED_SESSION'
          });
          return;
        }

        if (
          expectedSequence !== undefined &&
          expectedSequence !== runtime.state.sequence
        ) {
          expireStaleTradesInPlace(runtime.state);
          const isTradeResponse = action.type === 'respond_trade' || action.type === 'cancel_trade';
          if (!isTradeResponse || !validateAction(runtime.state, playerId, action).valid) {
            sendJson(res, 409, {
              error: 'Secvență desincronizată (acțiune duplicată sau întârziată)',
              code: 'SEQUENCE_MISMATCH',
              currentSequence: runtime.state.sequence,
              playerView: getPlayerView(runtime.state, playerId),
              legalActions: getLegalActions(runtime.state, playerId)
            });
            return;
          }
          // If action is still completely valid despite sequence drift (e.g. trade response or background events), allow execution!
        }

        expireStaleTradesInPlace(runtime.state);
        const validation = validateAction(runtime.state, playerId, action);
        if (!validation.valid) {
          sendJson(res, 400, {
            error: validation.reason,
            code: validation.code ?? 'ILLEGAL_ACTION',
            currentSequence: runtime.state.sequence
          });
          return;
        }

        const applied = applyAction(runtime.state, playerId, action);
        runtime.state = applied.state;
        runtime.events.push(applied.event);
        persistRuntime(runtime);

        // Automatically run AI / passive bot turns if needed
        executeBotStepsUntilHumanNeeded(runtime);
        broadcastGameSync(runtime);

        sendJson(res, 200, {
          gameId,
          playerView: getPlayerView(runtime.state, playerId),
          legalActions: getLegalActions(runtime.state, playerId),
          recentEvents: runtime.events.slice(-30),
          aiDecisions: runtime.aiDecisions.slice(-20)
        });
        return;
      }

      // Step AI manually or in batches (useful for 4-AI spectating or fast-forwarding)
      const stepAiMatch = pathname.match(/^\/api\/games\/([^/]+)\/step-ai$/);
      if (req.method === 'POST' && stepAiMatch) {
        const gameId = stepAiMatch[1]!;
        const runtime = loadOrGetGameRuntime(gameId);
        if (!runtime) {
          sendJson(res, 404, { error: 'Game not found' });
          return;
        }

        const body = (await readJsonBody(req)) as { steps?: number; viewerId?: string };
        const maxSteps = Math.min(500, Math.max(1, body.steps ?? 1));
        executeBotStepsUntilHumanNeeded(runtime, maxSteps);
        broadcastGameSync(runtime);

        const viewerId = body.viewerId ?? runtime.state.activePlayerId;
        sendJson(res, 200, {
          gameId,
          playerView: getPlayerView(runtime.state, viewerId),
          legalActions: getLegalActions(runtime.state, viewerId),
          recentEvents: runtime.events.slice(-30),
          aiDecisions: runtime.aiDecisions.slice(-20),
          pendingTermination: serializePendingTermination(runtime.pendingTermination),
          terminationDismissed: Boolean(runtime.terminationDismissed)
        });
        return;
      }

      // Terminate response from human player (confirm or deny)
      const termResponseMatch = pathname.match(/^\/api\/games\/([^/]+)\/terminate-response$/);
      if (req.method === 'POST' && termResponseMatch) {
        const gameId = termResponseMatch[1]!;
        const runtime = loadOrGetGameRuntime(gameId);
        if (!runtime) {
          sendJson(res, 404, { error: 'Game not found' });
          return;
        }

        const body = ((await readJsonBody(req)) ?? {}) as {
          sessionToken?: string;
          playerId?: string;
          response?: 'confirm' | 'deny';
        };

        if (body.response !== 'confirm' && body.response !== 'deny') {
          sendJson(res, 400, { error: 'Răspuns invalid. Alege "confirm" sau "deny".' });
          return;
        }

        let respondingPlayerId = body.playerId;
        if (body.sessionToken) {
          const session = storage.getSession(body.sessionToken);
          if (session) respondingPlayerId = session.playerId;
        }

        if (!runtime.pendingTermination) {
          sendJson(res, 400, { error: 'Nu există nicio cerere activă de oprire a partidei.' });
          return;
        }

        if (body.response === 'deny') {
          clearTimeout(runtime.pendingTermination.timer);
          runtime.pendingTermination = undefined;
          runtime.terminationDismissed = true; // Button disappears for everyone!
          broadcastGameSync(runtime);
          sendJson(res, 200, {
            success: true,
            status: 'denied',
            message: 'Oprirea partidei a fost refuzată. Jocul continuă.'
          });
          return;
        }

        if (body.response === 'confirm') {
          if (respondingPlayerId) {
            runtime.pendingTermination.confirmations.add(respondingPlayerId);
          }
          const allConfirmed = runtime.pendingTermination.humanPlayerIds.every((id) =>
            runtime.pendingTermination!.confirmations.has(id)
          );

          if (allConfirmed || runtime.pendingTermination.humanPlayerIds.length <= 1) {
            clearTimeout(runtime.pendingTermination.timer);
            runtime.pendingTermination = undefined;
            runtime.state.phase = 'game_over';
            persistRuntime(runtime);
            if (runtime.lobbyId) storage.markLobbyFinished(runtime.lobbyId);
            storage.markLobbyFinished(gameId);
            activeGames.delete(gameId);
            broadcastGameSync(runtime);
            sendJson(res, 200, {
              success: true,
              status: 'finished',
              message: 'Partida a fost închisă cu acordul jucătorilor.'
            });
            return;
          }

          broadcastGameSync(runtime);
          sendJson(res, 200, {
            success: true,
            status: 'waiting_others',
            confirmedCount: runtime.pendingTermination.confirmations.size
          });
          return;
        }
      }

      // Terminate / Stop an in-progress game
      const terminateMatch = pathname.match(/^\/api\/games\/([^/]+)\/terminate$/);
      if (req.method === 'POST' && terminateMatch) {
        const gameId = terminateMatch[1]!;
        const runtime = loadOrGetGameRuntime(gameId);
        if (!runtime) {
          sendJson(res, 404, { error: 'Game not found' });
          return;
        }

        // If termination was dismissed by human players, refuse termination!
        if (runtime.terminationDismissed) {
          sendJson(res, 403, {
            error: 'Oprirea partidei a fost refuzată de jucători.',
            dismissed: true
          });
          return;
        }

        const humanPlayers = runtime.state.players.filter((p) => p.type === 'human');
        const hasHumanPlayers = humanPlayers.length > 0 && runtime.state.phase !== 'game_over';

        if (hasHumanPlayers) {
          if (!runtime.pendingTermination) {
            const requestedAtMs = Date.now();
            const expiresAtMs = requestedAtMs + 30000;
            const humanPlayerIds = humanPlayers.map((h) => h.id);

            const timer = setTimeout(() => {
              if (runtime.pendingTermination && runtime.pendingTermination.denials.size === 0) {
                runtime.pendingTermination = undefined;
                runtime.state.phase = 'game_over';
                persistRuntime(runtime);
                if (runtime.lobbyId) storage.markLobbyFinished(runtime.lobbyId);
                storage.markLobbyFinished(gameId);
                activeGames.delete(gameId);
                broadcastGameSync(runtime);
              }
            }, 30000);

            runtime.pendingTermination = {
              requestedAtMs,
              expiresAtMs,
              humanPlayerIds,
              confirmations: new Set(),
              denials: new Set(),
              timer
            };

            broadcastGameSync(runtime);
          }

          sendJson(res, 200, {
            success: true,
            pendingConfirmation: true,
            expiresAtMs: runtime.pendingTermination.expiresAtMs,
            message: 'Cererea de oprire a fost trimisă jucătorilor din partidă. Dacă nimeni nu confirmă sau refuză în 30 de secunde, partida se va închide automat.'
          });
          return;
        }

        // If no human players in the game (e.g. 4 AI match), terminate immediately
        if (runtime.pendingTermination) {
          clearTimeout(runtime.pendingTermination.timer);
          runtime.pendingTermination = undefined;
        }

        runtime.state.phase = 'game_over';
        persistRuntime(runtime);

        if (runtime.lobbyId) {
          storage.markLobbyFinished(runtime.lobbyId);
        }
        storage.markLobbyFinished(gameId);

        activeGames.delete(gameId);
        broadcastGameSync(runtime);
        sendJson(res, 200, { success: true, gameId, status: 'finished' });
        return;
      }

      // List all saved replays
      if (req.method === 'GET' && pathname === '/api/replays') {
        sendJson(res, 200, { replays: storage.listReplays() });
        return;
      }

      // Hall of Fame: per-player win/game tallies across all finished games
      if (req.method === 'GET' && pathname === '/api/hall-of-fame') {
        sendJson(res, 200, { players: storage.listHallOfFame() });
        return;
      }

      // Get full replay for a game
      const replayMatch = pathname.match(/^\/api\/games\/([^/]+)\/replay$/);
      if (req.method === 'GET' && replayMatch) {
        const gameId = replayMatch[1]!;
        const runtime = loadOrGetGameRuntime(gameId);
        if (!runtime) {
          sendJson(res, 404, { error: 'Replay not found' });
          return;
        }
        sendJson(res, 200, { replay: runtime.replay });
        return;
      }

      // Get strategic analysis report for a game's replay
      const analysisMatch = pathname.match(/^\/api\/games\/([^/]+)\/analysis$/);
      if (req.method === 'GET' && analysisMatch) {
        const gameId = analysisMatch[1]!;
        const runtime = loadOrGetGameRuntime(gameId);
        if (!runtime) {
          sendJson(res, 404, { error: 'Replay not found' });
          return;
        }
        const report = analyzeReplayGame(runtime.replay);
        sendJson(res, 200, { report });
        return;
      }

      // Analyze a specific step in a game's replay
      const stepAnalysisMatch = pathname.match(
        /^\/api\/games\/([^/]+)\/analysis\/(\d+)$/
      );
      if (req.method === 'GET' && stepAnalysisMatch) {
        const gameId = stepAnalysisMatch[1]!;
        const seq = Number(stepAnalysisMatch[2]);
        const runtime = loadOrGetGameRuntime(gameId);
        if (!runtime) {
          sendJson(res, 404, { error: 'Replay not found' });
          return;
        }
        const comparison = analyzeDecisionAtSequence(runtime.replay, seq);
        sendJson(res, 200, { comparison });
        return;
      }

      // Import a replay JSON file
      if (req.method === 'POST' && pathname === '/api/replays/import') {
        const body = (await readJsonBody(req)) as { replayJson?: string; replay?: ReplayFile } | ReplayFile;
        const rawJson =
          typeof (body as { replayJson?: string }).replayJson === 'string'
            ? (body as { replayJson: string }).replayJson
            // The client (storage.ts) posts the ReplayFile directly as the body, not wrapped —
            // fall back to it, then to an explicit `{ replay }` wrapper for other callers.
            : JSON.stringify((body as { replay?: ReplayFile }).replay ?? body);
        const imported = importReplayJson(rawJson);
        const finalState =
          imported.snapshots[imported.snapshots.length - 1]?.state ?? imported.initialState;
        storage.saveGameAndReplay(finalState, imported);
        storage.recordHallOfFameResultIfNew(finalState);
        activeGames.set(imported.gameId, {
          gameId: imported.gameId,
          state: finalState,
          events: imported.events,
          aiDecisions: imported.aiDecisions,
          replay: imported
        });
        sendJson(res, 200, { gameId: imported.gameId, replay: imported });
        return;
      }

      // Run AI vs AI simulation or benchmark
      if (req.method === 'POST' && pathname === '/api/simulations/run') {
        const body = (await readJsonBody(req)) as {
          gamesCount?: number;
          seed?: string;
          participants?: ParticipantConfig[];
        };
        const gamesCount = Math.min(20, Math.max(1, body.gamesCount ?? 1));
        const seed = body.seed ?? `sim-seed-${Date.now()}`;
        const participants: ParticipantConfig[] = body.participants ?? [
          { id: 'p1', name: 'AI Expert Adaptiv', type: 'ai', aiDifficulty: 'expert', aiStyle: 'adaptive' },
          { id: 'p2', name: 'AI Avansat Dezvoltare', type: 'ai', aiDifficulty: 'advanced', aiStyle: 'development' },
          { id: 'p3', name: 'AI Mediu Expansiune', type: 'ai', aiDifficulty: 'medium', aiStyle: 'expansion' },
          { id: 'p4', name: 'AI Începător Comercial', type: 'ai', aiDifficulty: 'beginner', aiStyle: 'commercial' }
        ];

        if (gamesCount === 1) {
          const sim = runSimulatedGame({
            seed,
            participants,
            recordReplay: true
          });
          if (sim.replay) {
            const finalState =
              sim.replay.snapshots[sim.replay.snapshots.length - 1]?.state ??
              sim.replay.initialState;
            storage.saveGameAndReplay(finalState, sim.replay);
            storage.recordHallOfFameResultIfNew(finalState);
            activeGames.set(sim.gameId, {
              gameId: sim.gameId,
              state: finalState,
              events: sim.replay.events,
              aiDecisions: sim.replay.aiDecisions,
              replay: sim.replay
            });
          }
          sendJson(res, 200, { mode: 'single', result: sim });
          return;
        }

        const { report: benchmark, replays } = runBenchmarkSuite({
          baseSeed: seed,
          gamesCount,
          participants,
          recordReplays: true
        });
        // Previously only the aggregate benchmark stats were kept - each individual game's
        // replay (and its AI decision log) was discarded, so a benchmark run could never be
        // revisited in the Replay/Analysis view. Persist every game now that it's available.
        for (const replay of replays) {
          const finalState =
            replay.snapshots[replay.snapshots.length - 1]?.state ?? replay.initialState;
          storage.saveGameAndReplay(finalState, replay);
          storage.recordHallOfFameResultIfNew(finalState);
        }
        sendJson(res, 200, { mode: 'benchmark', benchmark });
        return;
      }

      // Serve the built web app (apps/web/dist) for everything else — lets one process serve
      // both the API/WebSocket and the frontend. Falls back to index.html for unknown paths
      // (client-side routes like /?join=CODE, or a direct refresh) rather than 404ing them.
      if (req.method === 'GET' && fs.existsSync(webDistDir)) {
        const STATIC_MIME: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.mjs': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.ico': 'image/x-icon',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
          '.webmanifest': 'application/manifest+json'
        };

        const cleanPathname = pathname.split('?')[0]!;
        const candidate = path.resolve(webDistDir, '.' + cleanPathname);
        const isInsideDist = candidate === webDistDir || candidate.startsWith(webDistDir + path.sep);

        // 1. If static file exists, serve with correct MIME and caching
        let resolvedCandidate =
          isInsideDist && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
            ? candidate
            : null;

        // Fallback for case-insensitive matches (e.g. Linux server where FTP client converted filenames to lowercase)
        if (!resolvedCandidate && isInsideDist) {
          const dir = path.dirname(candidate);
          if (fs.existsSync(dir)) {
            const baseLower = path.basename(candidate).toLowerCase();
            try {
              const entries = fs.readdirSync(dir);
              const matchedEntry = entries.find((e) => e.toLowerCase() === baseLower);
              if (matchedEntry) {
                const fullPath = path.join(dir, matchedEntry);
                if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                  resolvedCandidate = fullPath;
                }
              }
            } catch {
              // ignore
            }
          }
        }

        if (resolvedCandidate) {
          const ext = path.extname(resolvedCandidate).toLowerCase();
          const mime = STATIC_MIME[ext] ?? 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': cleanPathname.startsWith('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'no-cache'
          });
          fs.createReadStream(resolvedCandidate).pipe(res);
          return;
        }

        // 2. CRITICAL: NEVER serve index.html for static assets or files with an extension!
        // Returning index.html (text/html) for a missing .js file causes browser "Strict MIME type checking" crash!
        const ext = path.extname(cleanPathname);
        if (cleanPathname.startsWith('/assets/') || (ext && ext !== '.html')) {
          sendJson(res, 404, {
            error: `Static asset not found: ${cleanPathname}`,
            code: 'ASSET_NOT_FOUND'
          });
          return;
        }

        // 3. SPA Navigation fallback: Client-side routes (e.g. /, /?join=..., /replay) load index.html
        const indexPath = path.join(webDistDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache'
          });
          fs.createReadStream(indexPath).pipe(res);
          return;
        }
      }

      sendJson(res, 404, { error: `Route not found: ${req.method} ${pathname}` });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Internal server error'
      });
    }
  });

  // WebSocket Server
  // Reject only when an Origin header is present and untrusted (a malicious page's browser-issued
  // WebSocket always sends Origin); non-browser clients that send none are still allowed through.
  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, callback) => {
      const origin = info.req.headers.origin;
      if (origin && !resolveAllowedOrigin(origin, info.req.headers.host)) {
        callback(false, 403, 'Forbidden origin');
        return;
      }
      callback(true);
    }
  });

  wss.on('connection', (ws) => {
    let clientRecord: WsClientConnection | undefined;

    ws.on('message', (raw) => {
      try {
        const parsedJson = JSON.parse(String(raw));
        const validated = ClientToServerWsMessageSchema.safeParse(parsedJson);
        if (!validated.success) {
          ws.send(
            JSON.stringify({
              type: 'action_rejected',
              gameId: 'unknown',
              code: 'INVALID_WS_MESSAGE',
              reason: 'Format de mesaj WebSocket invalid.',
              currentSequence: 0
            } satisfies ServerToClientWsMessage)
          );
          return;
        }

        const msg = validated.data;

        if (msg.type === 'ping') {
          ws.send(
            JSON.stringify({
              type: 'pong',
              timestampMs: Date.now()
            } satisfies ServerToClientWsMessage)
          );
          return;
        }

        if (msg.type === 'authenticate') {
          const session = storage.getSession(msg.sessionToken);
          const runtime = loadOrGetGameRuntime(msg.gameId);
          if (!session || !runtime) {
            ws.send(
              JSON.stringify({
                type: 'action_rejected',
                gameId: msg.gameId,
                code: 'AUTH_FAILED',
                reason: 'Sesiune sau partidă inexistentă.',
                currentSequence: 0
              } satisfies ServerToClientWsMessage)
            );
            return;
          }

          clientRecord = {
            ws,
            gameId: msg.gameId,
            playerId: session.playerId,
            sessionToken: msg.sessionToken
          };
          wsClients.add(clientRecord);

          const p = getPlayerById(runtime.state, session.playerId);
          if (p) p.connected = true;

          ws.send(
            JSON.stringify({
              type: 'state_sync',
              gameId: runtime.gameId,
              playerView: getPlayerView(runtime.state, session.playerId),
              legalActions: getLegalActions(runtime.state, session.playerId),
              recentEvents: runtime.events.slice(-25),
              aiDecisions: runtime.aiDecisions.slice(-15)
            } satisfies ServerToClientWsMessage)
          );
          return;
        }

        if (msg.type === 'submit_action') {
          const session = storage.getSession(msg.sessionToken);
          const runtime = loadOrGetGameRuntime(msg.gameId);
          if (!session || !runtime) {
            ws.send(
              JSON.stringify({
                type: 'action_rejected',
                gameId: msg.gameId,
                code: 'AUTH_FAILED',
                reason: 'Sesiune invalidă.',
                currentSequence: 0
              } satisfies ServerToClientWsMessage)
            );
            return;
          }

          if (
            msg.expectedSequence !== undefined &&
            msg.expectedSequence !== runtime.state.sequence
          ) {
            ws.send(
              JSON.stringify({
                type: 'action_rejected',
                gameId: msg.gameId,
                code: 'SEQUENCE_MISMATCH',
                reason: 'Secvență de stare depășită.',
                currentSequence: runtime.state.sequence
              } satisfies ServerToClientWsMessage)
            );
            return;
          }

          const check = validateAction(runtime.state, session.playerId, msg.action);
          if (!check.valid) {
            ws.send(
              JSON.stringify({
                type: 'action_rejected',
                gameId: msg.gameId,
                code: check.code ?? 'ILLEGAL_ACTION',
                reason: check.reason ?? 'Mutare ilegală.',
                currentSequence: runtime.state.sequence
              } satisfies ServerToClientWsMessage)
            );
            return;
          }

          const applied = applyAction(runtime.state, session.playerId, msg.action);
          runtime.state = applied.state;
          runtime.events.push(applied.event);
          persistRuntime(runtime);

          executeBotStepsUntilHumanNeeded(runtime);
          broadcastGameSync(runtime);
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      if (clientRecord) {
        wsClients.delete(clientRecord);
      }
    });
  });

  return {
    httpServer,
    storage,
    listen(port = 0, host = '0.0.0.0') {
      return new Promise((resolve) => {
        httpServer.listen(port, host, () => {
          const addr = httpServer.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : port;
          resolve({
            port: actualPort,
            url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}`
          });
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        for (const c of wsClients) {
          c.ws.close();
        }
        wsClients.clear();
        wss.close(() => {
          httpServer.close(() => {
            storage.close();
            resolve();
          });
        });
      });
    }
  };
}
