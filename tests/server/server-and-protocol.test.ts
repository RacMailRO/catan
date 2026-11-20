import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { CatanServerInstance, createCatanServer, resolveAllowedOrigin } from '../../apps/server/src/server';
import { GameActionSchema, ServerToClientWsMessage } from '@catan/protocol';
import { ReplayRecorder, createGame, createRulesConfig } from '@catan/core';

describe('Authoritative LAN/Online Server, Protocol Validation & WebSocket Sync', () => {
  let server: CatanServerInstance;
  let baseUrl: string;
  let wsUrl: string;

  beforeEach(async () => {
    server = createCatanServer({ dbPath: ':memory:' });
    const bound = await server.listen(0, '127.0.0.1');
    baseUrl = bound.url;
    wsUrl = baseUrl.replace('http://', 'ws://');
  });

  afterEach(async () => {
    await server.close();
  });

  it('creates a private lobby, enforces invite token, starts mixed Human + AI game, and prevents private data leaks', async () => {
    // 1. Host creates a private online lobby with 2 human seats + 2 AI seats
    const createRes = await fetch(`${baseUrl}/api/lobbies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Seara de Catan',
        hostName: 'Andrei',
        mode: 'online',
        isPrivate: true,
        // Play order is now decided by each player's opening dice roll rather than seat
        // order; this seed is verified to put the host (p1) first, which the rest of this
        // test's narrative (host acts, then guest, then AI) depends on.
        seed: 'server-test-seed-0',
        rules: {
          victoryPointsToWin: 12,
          knightStealRule: 'all_adjacent',
          devCardsPerTurnRule: 'one_per_type'
        },
        seats: [
          { seatIndex: 0, name: 'Andrei', type: 'human', color: 'red' },
          { seatIndex: 1, name: 'Loc Invitat', type: 'open', color: 'blue' },
          { seatIndex: 2, name: 'Bot Avansat', type: 'ai', color: 'orange', aiDifficulty: 'advanced', aiStyle: 'expansion' },
          { seatIndex: 3, name: 'Bot Mediu', type: 'ai', color: 'green', aiDifficulty: 'medium', aiStyle: 'commercial' }
        ]
      })
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      lobby: { lobbyId: string };
      sessionToken: string;
      playerId: string;
      inviteCode: string;
    };

    const lobbyId = created.lobby.lobbyId;
    const hostToken = created.sessionToken;
    const inviteCode = created.inviteCode;

    // 2. Guest tries to join WITHOUT inviteCode -> rejected with 403
    const badJoinRes = await fetch(`${baseUrl}/api/lobbies/${lobbyId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: 'Intrus', inviteCode: 'wrong-code' })
    });
    expect(badJoinRes.status).toBe(403);

    // 3. Guest joins WITH valid inviteCode -> succeeds and gets sessionToken for p2
    const goodJoinRes = await fetch(`${baseUrl}/api/lobbies/${lobbyId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: 'Elena', inviteCode })
    });
    expect(goodJoinRes.status).toBe(200);
    const guestJoined = (await goodJoinRes.json()) as {
      sessionToken: string;
      playerId: string;
    };
    expect(guestJoined.playerId).toBe('p2');

    // 3b. Guest renames herself in the waiting room
    const renameRes = await fetch(`${baseUrl}/api/lobbies/${lobbyId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: guestJoined.sessionToken, newName: 'Elena-VIP' })
    });
    expect(renameRes.status).toBe(200);
    const renamedData = (await renameRes.json()) as { lobby: { seats: Array<{ playerId: string; name: string }> } };
    const p2Seat = renamedData.lobby.seats.find((s) => s.playerId === 'p2');
    expect(p2Seat?.name).toBe('Elena-VIP');

    // 4. Start the game
    const startRes = await fetch(`${baseUrl}/api/lobbies/${lobbyId}/start`, {
      method: 'POST'
    });
    expect(startRes.status).toBe(200);
    const started = (await startRes.json()) as {
      gameId: string;
      playerView: { activePlayerId: string; sequence: number; rules: { victoryPointsToWin: number } };
      legalActions: Array<{ type: string; vertexId?: string }>;
    };

    const gameId = started.gameId;
    expect(started.playerView.rules.victoryPointsToWin).toBe(12);
    expect(started.playerView.activePlayerId).toBe('p1');

    // 5. Guest (p2) tries to submit an action using Host's playerId ('p1') -> rejected with 403
    const spoofRes = await fetch(`${baseUrl}/api/games/${gameId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: guestJoined.sessionToken,
        playerId: 'p1',
        action: started.legalActions[0]
      })
    });
    expect(spoofRes.status).toBe(403);

    // 6. Host (p1) submits initial settlement + road, then Guest (p2) submits initial settlement + road,
    // and server automatically executes AI p3 & p4 setup turns!
    const p1Action1 = started.legalActions[0]!;
    const act1Res = await fetch(`${baseUrl}/api/games/${gameId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: hostToken,
        playerId: 'p1',
        expectedSequence: 0,
        action: p1Action1
      })
    });
    expect(act1Res.status).toBe(200);
    const afterAct1 = (await act1Res.json()) as {
      playerView: { sequence: number };
      legalActions: Array<{ type: string }>;
    };

    // Duplicate/stale sequence number (expectedSequence: 0 when sequence is now 1) -> rejected with 409!
    const staleRes = await fetch(`${baseUrl}/api/games/${gameId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: hostToken,
        playerId: 'p1',
        expectedSequence: 0,
        action: afterAct1.legalActions[0]
      })
    });
    expect(staleRes.status).toBe(409);

    // Host places initial road
    const act2Res = await fetch(`${baseUrl}/api/games/${gameId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: hostToken,
        playerId: 'p1',
        expectedSequence: 1,
        action: afterAct1.legalActions[0]
      })
    });
    expect(act2Res.status).toBe(200);

    // Reconnect check for Guest using existing sessionToken
    const reconnectRes = await fetch(`${baseUrl}/api/lobbies/${lobbyId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: 'Elena',
        sessionToken: guestJoined.sessionToken
      })
    });
    expect(reconnectRes.status).toBe(200);
    const reconnected = (await reconnectRes.json()) as { gameId: string; playerId: string };
    expect(reconnected.gameId).toBe(gameId);
    expect(reconnected.playerId).toBe('p2');
  });

  it('synchronizes game state over WebSocket and serves Replay & Strategic Analysis endpoints', async () => {
    // Run a single simulated AI game via /api/simulations/run
    const simRes = await fetch(`${baseUrl}/api/simulations/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gamesCount: 1,
        seed: 'server-sim-seed-1'
      })
    });
    expect(simRes.status).toBe(200);
    const simData = (await simRes.json()) as {
      mode: string;
      result: { gameId: string; winnerId: string };
    };
    const gameId = simData.result.gameId;
    expect(simData.result.winnerId).toBeTruthy();

    // Fetch full replay and strategic analysis report
    const repRes = await fetch(`${baseUrl}/api/games/${gameId}/replay`);
    expect(repRes.status).toBe(200);
    const repData = (await repRes.json()) as { replay: { events: unknown[] } };
    expect(repData.replay.events.length).toBeGreaterThan(20);

    const anRes = await fetch(`${baseUrl}/api/games/${gameId}/analysis`);
    expect(anRes.status).toBe(200);
    const anData = (await anRes.json()) as { report: { winnerId: string } };
    expect(anData.report.winnerId).toBe(simData.result.winnerId);

    // Also test WebSocket ping/pong & authentication on a newly created lobby game
    const lobRes = await fetch(`${baseUrl}/api/lobbies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'WS Test', hostName: 'WSPlayer' })
    });
    const lob = (await lobRes.json()) as {
      lobby: { lobbyId: string };
      sessionToken: string;
    };
    const startRes = await fetch(`${baseUrl}/api/lobbies/${lob.lobby.lobbyId}/start`, {
      method: 'POST'
    });
    const started = (await startRes.json()) as { gameId: string };

    const wsMessages: ServerToClientWsMessage[] = [];
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'authenticate',
            gameId: started.gameId,
            sessionToken: lob.sessionToken
          })
        );
      });
      ws.on('message', (data) => {
        const msg = JSON.parse(String(data)) as ServerToClientWsMessage;
        wsMessages.push(msg);
        if (msg.type === 'state_sync') {
          resolve();
        }
      });
      ws.on('error', reject);
    });

    expect(wsMessages[0]!.type).toBe('state_sync');
    ws.close();
  }, 60000);
  it('allows WebSocket connections with catan.d10.ro, same-origin, LAN, and rejects untrusted origins', async () => {
    // 1. Verify unit logic of resolveAllowedOrigin
    expect(resolveAllowedOrigin('https://catan.d10.ro', 'catan.d10.ro')).toBe('https://catan.d10.ro');
    expect(resolveAllowedOrigin('https://catan.d10.ro', 'any-host.com')).toBe('https://catan.d10.ro');
    expect(resolveAllowedOrigin('https://test.d10.ro', 'test.d10.ro')).toBe('https://test.d10.ro');
    expect(resolveAllowedOrigin('http://localhost:5173', 'localhost:3001')).toBe('http://localhost:5173');
    expect(resolveAllowedOrigin('http://192.168.1.150:3001', '192.168.1.150:3001')).toBe('http://192.168.1.150:3001');
    expect(resolveAllowedOrigin('https://my-custom-domain.com', 'my-custom-domain.com')).toBe('https://my-custom-domain.com');
    expect(resolveAllowedOrigin('https://evil-untrusted-site.com', 'catan.d10.ro')).toBeUndefined();

    // 2. Real WebSocket connection to our test server with Origin: https://catan.d10.ro -> Must connect!
    const validWs = new WebSocket(wsUrl, {
      headers: { Origin: 'https://catan.d10.ro' }
    });
    await new Promise<void>((resolve, reject) => {
      validWs.on('open', () => {
        validWs.close();
        resolve();
      });
      validWs.on('error', reject);
      validWs.on('unexpected-response', (_, res) => {
        reject(new Error(`Unexpected response ${res.statusCode}`));
      });
    });

    // 3. Real WebSocket connection with an untrusted origin -> Must be rejected with 403 Forbidden!
    const untrustedWs = new WebSocket(wsUrl, {
      headers: { Origin: 'https://evil-phishing-domain.com' }
    });
    const rejected = await new Promise<boolean>((resolve) => {
      untrustedWs.on('unexpected-response', (_, res) => {
        resolve(res.statusCode === 403);
      });
      untrustedWs.on('open', () => {
        untrustedWs.close();
        resolve(false);
      });
      untrustedWs.on('error', () => {
        resolve(true);
      });
    });
    expect(rejected).toBe(true);
  });

  it('removes terminated games from public lobby listings upon termination', async () => {
    // 1. Create a public lobby
    const createRes = await fetch(`${baseUrl}/api/lobbies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Partida Publica Test',
        hostName: 'SpectatorHost',
        mode: 'online',
        isPrivate: false,
        rules: { victoryPointsToWin: 10 },
        seats: [
          { seatIndex: 0, name: 'AI 1', type: 'ai', color: 'red' },
          { seatIndex: 1, name: 'AI 2', type: 'ai', color: 'blue' }
        ]
      })
    });
    expect(createRes.status).toBe(201);
    const { lobby } = (await createRes.json()) as { lobby: { lobbyId: string } };

    // 2. Start the lobby
    const startRes = await fetch(`${baseUrl}/api/lobbies/${lobby.lobbyId}/start`, {
      method: 'POST'
    });
    expect(startRes.status).toBe(200);
    const { gameId } = (await startRes.json()) as { gameId: string };
    expect(gameId).toBeTruthy();

    // 3. Verify public lobbies list includes this active game
    const listRes1 = await fetch(`${baseUrl}/api/lobbies`);
    const data1 = (await listRes1.json()) as { lobbies: Array<{ lobbyId: string; gameId?: string; status: string }> };
    expect(data1.lobbies.some((l) => l.lobbyId === lobby.lobbyId && l.gameId === gameId)).toBe(true);

    // 4. Terminate the game as spectator/host
    const termRes = await fetch(`${baseUrl}/api/games/${gameId}/terminate`, {
      method: 'POST'
    });
    expect(termRes.status).toBe(200);

    // 5. Verify public lobbies list NO LONGER contains this game
    const listRes2 = await fetch(`${baseUrl}/api/lobbies`);
    const data2 = (await listRes2.json()) as { lobbies: Array<{ lobbyId: string; gameId?: string; status: string }> };
    expect(data2.lobbies.some((l) => l.lobbyId === lobby.lobbyId || l.gameId === gameId)).toBe(false);
  });

  it('terminates and cancels a waiting lobby before it starts', async () => {
    // 1. Create a waiting public lobby
    const createRes = await fetch(`${baseUrl}/api/lobbies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lobby In Asteptare',
        hostName: 'TestHost',
        mode: 'online',
        isPrivate: false,
        rules: { victoryPointsToWin: 10 },
        seats: [
          { seatIndex: 0, name: 'TestHost', type: 'human', color: 'red' },
          { seatIndex: 1, name: 'AI Bot', type: 'ai', color: 'blue' }
        ]
      })
    });
    expect(createRes.status).toBe(201);
    const { lobby } = (await createRes.json()) as { lobby: { lobbyId: string } };

    // 2. Verify it is listed under /api/lobbies
    const listRes1 = await fetch(`${baseUrl}/api/lobbies`);
    const data1 = (await listRes1.json()) as { lobbies: Array<{ lobbyId: string; status: string }> };
    expect(data1.lobbies.some((l) => l.lobbyId === lobby.lobbyId)).toBe(true);

    // 3. Terminate the waiting lobby
    const termRes = await fetch(`${baseUrl}/api/lobbies/${lobby.lobbyId}/terminate`, {
      method: 'POST'
    });
    expect(termRes.status).toBe(200);

    // 4. Verify it is no longer listed under /api/lobbies
    const listRes2 = await fetch(`${baseUrl}/api/lobbies`);
    const data2 = (await listRes2.json()) as { lobbies: Array<{ lobbyId: string; status: string }> };
    expect(data2.lobbies.some((l) => l.lobbyId === lobby.lobbyId)).toBe(false);
  });

  it('notifies human players of termination and cancels termination if human denies', async () => {
    // 1. Create a public game with a human player and AI
    const createRes = await fetch(`${baseUrl}/api/lobbies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Partida Uman vs AI',
        hostName: 'JucatorUman',
        mode: 'online',
        isPrivate: false,
        rules: { victoryPointsToWin: 10 },
        seats: [
          { seatIndex: 0, name: 'JucatorUman', type: 'human', color: 'red' },
          { seatIndex: 1, name: 'AI Bot', type: 'ai', color: 'blue' }
        ]
      })
    });
    const { lobby, sessionToken, playerId } = (await createRes.json()) as {
      lobby: { lobbyId: string };
      sessionToken: string;
      playerId: string;
    };

    // 2. Start the game
    const startRes = await fetch(`${baseUrl}/api/lobbies/${lobby.lobbyId}/start`, {
      method: 'POST'
    });
    const { gameId } = (await startRes.json()) as { gameId: string };

    // 3. Attempt to terminate (e.g. from spectator or lobby) -> Should request confirmation from human!
    const termRes1 = await fetch(`${baseUrl}/api/games/${gameId}/terminate`, {
      method: 'POST'
    });
    expect(termRes1.status).toBe(200);
    const termData1 = (await termRes1.json()) as { pendingConfirmation: boolean; expiresAtMs: number };
    expect(termData1.pendingConfirmation).toBe(true);
    expect(termData1.expiresAtMs).toBeGreaterThan(Date.now());

    // 4. Verify game state reflects pending termination
    const stateRes1 = await fetch(`${baseUrl}/api/games/${gameId}/state?sessionToken=${sessionToken}`);
    const stateData1 = (await stateRes1.json()) as { pendingTermination?: { remainingSec: number } | null };
    expect(stateData1.pendingTermination).toBeTruthy();
    expect(stateData1.pendingTermination?.remainingSec).toBeGreaterThan(0);

    // 5. Human player responds with 'deny' (rejects termination)
    const denyRes = await fetch(`${baseUrl}/api/games/${gameId}/terminate-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken,
        playerId,
        response: 'deny'
      })
    });
    expect(denyRes.status).toBe(200);
    const denyData = (await denyRes.json()) as { status: string };
    expect(denyData.status).toBe('denied');

    // 6. Verify pending termination is cleared and terminationDismissed is true
    const stateRes2 = await fetch(`${baseUrl}/api/games/${gameId}/state?sessionToken=${sessionToken}`);
    const stateData2 = (await stateRes2.json()) as {
      pendingTermination?: unknown;
      terminationDismissed?: boolean;
    };
    expect(stateData2.pendingTermination).toBeNull();
    expect(stateData2.terminationDismissed).toBe(true);

    // 7. Subsequent termination attempt must be rejected because players dismissed it
    const termRes2 = await fetch(`${baseUrl}/api/games/${gameId}/terminate`, {
      method: 'POST'
    });
    expect(termRes2.status).toBe(403);
    const termData2 = (await termRes2.json()) as { dismissed: boolean };
    expect(termData2.dismissed).toBe(true);
  });

  it('enforces maximum concurrent games limit when starting new games', async () => {
    // Create custom server with limit of 1 game
    const customServer = createCatanServer({ dbPath: ':memory:', maxConcurrentGames: 1 });
    const bound = await customServer.listen(0, '127.0.0.1');
    const customUrl = bound.url;

    try {
      // 1. Create and start game 1
      const c1 = await fetch(`${customUrl}/api/lobbies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Game 1',
          hostName: 'P1',
          seats: [{ seatIndex: 0, name: 'AI 1', type: 'ai', color: 'red' }]
        })
      });
      const d1 = (await c1.json()) as { lobby: { lobbyId: string } };
      const s1 = await fetch(`${customUrl}/api/lobbies/${d1.lobby.lobbyId}/start`, { method: 'POST' });
      expect(s1.status).toBe(200);

      // 2. Create and attempt to start game 2 -> Must exceed limit (429)!
      const c2 = await fetch(`${customUrl}/api/lobbies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Game 2',
          hostName: 'P2',
          seats: [{ seatIndex: 0, name: 'AI 2', type: 'ai', color: 'blue' }]
        })
      });
      const d2 = (await c2.json()) as { lobby: { lobbyId: string } };
      const s2 = await fetch(`${customUrl}/api/lobbies/${d2.lobby.lobbyId}/start`, { method: 'POST' });
      expect(s2.status).toBe(429);
      const err = (await s2.json()) as { error: string };
      expect(err.error).toContain('Serverul a atins limita maximă de partide active simultan');
    } finally {
      await customServer.close();
    }
  });

  it('validates Seafarers and counter-trade actions in GameActionSchema and lets a human build_ship in world_map', async () => {
    const schemaSamples = [
      { type: 'build_ship', edgeId: 'E12' },
      { type: 'place_initial_ship', edgeId: 'E14' },
      { type: 'move_ship', fromEdgeId: 'E12', toEdgeId: 'E18' },
      { type: 'pass_special_building' },
      { type: 'counter_trade', offerId: 'TR_5', offering: { wood: 1 }, requesting: { sheep: 1 } }
    ];
    for (const sample of schemaSamples) {
      expect(GameActionSchema.safeParse(sample).success).toBe(true);
    }

    const createRes = await fetch(`${baseUrl}/api/lobbies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'World Map Ship E2E',
        hostName: 'Navigator',
        mode: 'online',
        seed: 'world-map-ship-e2e',
        rules: {
          boardScenario: 'world_map',
          boardLayout: 'beginner_fixed',
          startingResourcesRule: 'both_settlements'
        },
        seats: [
          { seatIndex: 0, name: 'Navigator', type: 'human', color: 'red' },
          { seatIndex: 1, name: 'AI Mariner', type: 'ai', color: 'blue', aiDifficulty: 'medium', aiStyle: 'expansion' }
        ]
      })
    });
    expect(createRes.status).toBe(201);
    const { lobby, sessionToken } = (await createRes.json()) as {
      lobby: { lobbyId: string };
      sessionToken: string;
    };

    const startRes = await fetch(`${baseUrl}/api/lobbies/${lobby.lobbyId}/start`, {
      method: 'POST'
    });
    expect(startRes.status).toBe(200);
    let sync = (await startRes.json()) as {
      gameId: string;
      playerView: {
        sequence: number;
        phase: string;
        activePlayerId: string;
        board: {
          pirateHexId?: string;
          hexes: Record<string, { terrain: string }>;
          vertices: Record<string, { id: string; adjacentHexIds: string[]; adjacentVertexIds: string[]; adjacentEdgeIds: string[] }>;
          edges: Record<string, { adjacentHexIds: string[] }>;
          ships?: Record<string, { ownerId: string }>;
        };
      };
      legalActions: Array<{ type: string; vertexId?: string; edgeId?: string; hexId?: string }>;
    };
    const gameId = sync.gameId;

    const submit = async (action: unknown) => {
      const res = await fetch(`${baseUrl}/api/games/${gameId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          playerId: 'p1',
          expectedSequence: sync.playerView.sequence,
          action
        })
      });
      const body = await res.json();
      expect(res.status, JSON.stringify(body)).toBe(200);
      sync = body as typeof sync;
    };

    // Helper to check if a vertex has a non-pirate adjacent sea edge
    const hasLegalSeaEdge = (vId: string) => {
      const v = sync.playerView.board.vertices[vId]!;
      return v.adjacentEdgeIds.some((eId) => {
        const edge = sync.playerView.board.edges[eId]!;
        return (
          edge.adjacentHexIds.some((hId) => sync.playerView.board.hexes[hId]?.terrain === 'sea') &&
          (!sync.playerView.board.pirateHexId || !edge.adjacentHexIds.includes(sync.playerView.board.pirateHexId))
        );
      });
    };

    // Complete setup phases for p1: pick forest on 1st settlement and pasture+sea on 2nd settlement
    for (let guard = 0; guard < 8 && sync.playerView.phase.startsWith('setup_'); guard++) {
      if (sync.playerView.phase === 'setup_settlement_1') {
        const forestVertex =
          sync.legalActions.find(
            (a) =>
              a.type === 'place_initial_settlement' &&
              sync.playerView.board.vertices[a.vertexId!]!.adjacentHexIds.some(
                (hId) => sync.playerView.board.hexes[hId]?.terrain === 'forest'
              )
          ) ?? sync.legalActions.find((a) => a.type === 'place_initial_settlement')!;
        await submit(forestVertex);
      } else if (sync.playerView.phase === 'setup_settlement_2') {
        const pastureSeaVertex =
          sync.legalActions.find(
            (a) =>
              a.type === 'place_initial_settlement' &&
              hasLegalSeaEdge(a.vertexId!) &&
              sync.playerView.board.vertices[a.vertexId!]!.adjacentHexIds.some(
                (hId) => sync.playerView.board.hexes[hId]?.terrain === 'pasture'
              )
          ) ??
          sync.legalActions.find(
            (a) => a.type === 'place_initial_settlement' && hasLegalSeaEdge(a.vertexId!)
          )!;
        expect(pastureSeaVertex).toBeDefined();
        await submit(pastureSeaVertex);
      } else {
        const roadAct = sync.legalActions.find((a) => a.type === 'place_initial_road') ?? sync.legalActions[0]!;
        await submit(roadAct);
      }
    }

    expect(sync.playerView.phase).toBe('turn_start');
    expect(sync.playerView.activePlayerId).toBe('p1');

    // Roll dice to enter main_actions (handling robber if 7 was rolled)
    await submit({ type: 'roll_dice' });
    if (sync.playerView.phase === 'move_robber') {
      const moveRobberAct = sync.legalActions.find((a) => a.type === 'move_robber')!;
      await submit(moveRobberAct);
    }
    expect(sync.playerView.phase).toBe('main_actions');

    const buildShipAct = sync.legalActions.find((a) => a.type === 'build_ship');
    expect(buildShipAct).toBeDefined();
    await submit(buildShipAct!);

    expect(sync.playerView.board.ships?.[buildShipAct!.edgeId!]?.ownerId).toBe('p1');
  });

  it('expires stale open trade offers via GET /state and timer wakeup without manual step-ai clicks', async () => {
    // Obtain a valid sessionToken for p1 via a lobby
    const lobRes = await fetch(`${baseUrl}/api/lobbies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Trade Expiry Test',
        hostName: 'HumanP1',
        mode: 'online',
        seats: [
          { seatIndex: 0, name: 'HumanP1', type: 'human', color: 'red' },
          { seatIndex: 1, name: 'BotP2', type: 'ai', color: 'blue' }
        ]
      })
    });
    const { sessionToken } = (await lobRes.json()) as { sessionToken: string };

    const makeBaseState = (gameId: string) => {
      const base = createGame({
        gameId,
        seed: 'trade-expiry-seed',
        rules: createRulesConfig({ tradeOfferTimeoutSec: 5, autoFillPassiveBotsMinPlayers: 2 }),
        participants: [
          { id: 'p1', name: 'HumanP1', type: 'human' },
          { id: 'p2', name: 'BotP2', type: 'ai', aiDifficulty: 'medium', aiStyle: 'balanced' }
        ]
      });
      base.phase = 'main_actions';
      base.turn = 2;
      base.activePlayerId = 'p2';
      base.playerOrder = ['p1', 'p2'];
      base.players[0]!.resources = { wood: 0, brick: 2, sheep: 0, wheat: 0, ore: 0 };
      base.players[1]!.resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
      base.activeTradeOffers = [
        {
          id: 'TR_PREV',
          fromPlayerId: 'p2',
          toPlayerId: 'p1',
          offering: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 },
          requesting: { wood: 0, brick: 1, sheep: 0, wheat: 0, ore: 0 },
          createdAtMs: 1,
          expiresAtMs: 2,
          rejectedByPlayerIds: [],
          status: 'cancelled'
        }
      ];
      return base;
    };

    // Case A: Already-expired open offer -> GET /api/games/:id/state expires it & finishes p2 AI turn
    const gameA = makeBaseState('game_expired_poll');
    const recA = new ReplayRecorder(gameA, 1);
    recA.recordAndApply(
      'p2',
      {
        type: 'propose_trade',
        toPlayerId: 'p1',
        offering: { wood: 1 },
        requesting: { brick: 1 }
      },
      { nowMs: Date.now() - 6000 }
    );
    const impARes = await fetch(`${baseUrl}/api/replays/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recA.toReplayFile())
    });
    expect(impARes.status).toBe(200);

    const stateARes = await fetch(`${baseUrl}/api/games/game_expired_poll/state?sessionToken=${sessionToken}`);
    expect(stateARes.status).toBe(200);
    const stateA = (await stateARes.json()) as {
      playerView: { activePlayerId: string; phase: string; activeTradeOffers: unknown[] };
    };
    expect(stateA.playerView.activePlayerId).toBe('p1');
    expect(stateA.playerView.phase).toBe('turn_start');

    // Case B: Offer expiring in ~450ms -> timer wakes up, finishes p2 AI turn, and pushes state_sync over WS
    const gameB = makeBaseState('game_timer_wakeup');
    const recB = new ReplayRecorder(gameB, 1);
    recB.recordAndApply(
      'p2',
      {
        type: 'propose_trade',
        toPlayerId: 'p1',
        offering: { wood: 1 },
        requesting: { brick: 1 }
      },
      { nowMs: Date.now() - 4550 }
    );
    const impBRes = await fetch(`${baseUrl}/api/replays/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recB.toReplayFile())
    });
    expect(impBRes.status).toBe(200);

    const ws = new WebSocket(wsUrl);
    const resumedPromise = new Promise<ServerToClientWsMessage>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for trade expiry state_sync')), 4000);
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'authenticate', gameId: 'game_timer_wakeup', sessionToken }));
      });
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as ServerToClientWsMessage;
        if (msg.type === 'state_sync' && msg.playerView.activePlayerId === 'p1') {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Trigger initial GET /state to schedule the trade expiry wakeup while offer is still open
    const stateBRes = await fetch(`${baseUrl}/api/games/game_timer_wakeup/state?sessionToken=${sessionToken}`);
    expect(stateBRes.status).toBe(200);
    const stateB = (await stateBRes.json()) as { playerView: { activePlayerId: string } };
    expect(stateB.playerView.activePlayerId).toBe('p2');

    const pushed = await resumedPromise;
    expect(pushed.type).toBe('state_sync');
    if (pushed.type === 'state_sync') {
      expect(pushed.playerView.activePlayerId).toBe('p1');
      expect(pushed.playerView.phase).toBe('turn_start');
    }
    ws.close();
  });

  it('broadcasts immediate state_sync after human end_turn before stepping AI turns', async () => {
    const lobRes = await fetch(`${baseUrl}/api/lobbies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Immediate End Turn WS Test',
        hostName: 'HumanP1',
        mode: 'online',
        seats: [
          { seatIndex: 0, name: 'HumanP1', type: 'human', color: 'red' },
          { seatIndex: 1, name: 'BotP2', type: 'ai', color: 'blue' }
        ]
      })
    });
    const { sessionToken } = (await lobRes.json()) as { sessionToken: string };

    const game = createGame({
      gameId: 'game_ws_immediate_end_turn',
      seed: 'ws-immediate-end-turn-seed',
      rules: createRulesConfig({ autoFillPassiveBotsMinPlayers: 2 }),
      participants: [
        { id: 'p1', name: 'HumanP1', type: 'human' },
        { id: 'p2', name: 'BotP2', type: 'ai', aiDifficulty: 'medium', aiStyle: 'balanced' }
      ]
    });
    game.phase = 'main_actions';
    game.turn = 2;
    game.activePlayerId = 'p1';
    game.playerOrder = ['p1', 'p2'];

    const rec = new ReplayRecorder(game, 1);
    const impRes = await fetch(`${baseUrl}/api/replays/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec.toReplayFile())
    });
    expect(impRes.status).toBe(200);

    const ws = new WebSocket(wsUrl);
    const syncSnapshots: Array<{ sequence: number; activePlayerId: string; phase: string }> = [];
    let authDoneResolve!: () => void;
    const authDone = new Promise<void>((r) => {
      authDoneResolve = r;
    });
    let bothBroadcastsResolve!: () => void;
    const bothBroadcasts = new Promise<void>((resolve, reject) => {
      bothBroadcastsResolve = resolve;
      setTimeout(() => reject(new Error(`Timed out waiting for pre-AI + post-AI state_sync; got ${JSON.stringify(syncSnapshots)}`)), 5000);
    });

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'authenticate', gameId: 'game_ws_immediate_end_turn', sessionToken }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as ServerToClientWsMessage;
      if (msg.type === 'state_sync') {
        syncSnapshots.push({
          sequence: msg.playerView.sequence,
          activePlayerId: msg.playerView.activePlayerId,
          phase: msg.playerView.phase
        });
        if (syncSnapshots.length === 1) {
          authDoneResolve();
        }
        const sawPreAi = syncSnapshots.some((s) => s.sequence >= 1 && s.activePlayerId === 'p2' && s.phase === 'turn_start');
        const sawPostAi = syncSnapshots.some((s) => s.sequence >= 2 && s.activePlayerId === 'p1' && s.phase === 'turn_start');
        if (sawPreAi && sawPostAi) {
          bothBroadcastsResolve();
        }
      }
    });

    await authDone;

    const actRes = await fetch(`${baseUrl}/api/games/game_ws_immediate_end_turn/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken,
        playerId: 'p1',
        expectedSequence: game.sequence,
        action: { type: 'end_turn' }
      })
    });
    expect(actRes.status).toBe(200);

    await bothBroadcasts;

    const preAiIdx = syncSnapshots.findIndex((s) => s.sequence === 1 && s.activePlayerId === 'p2' && s.phase === 'turn_start');
    const postAiIdx = syncSnapshots.findIndex((s) => s.sequence > 1 && s.activePlayerId === 'p1' && s.phase === 'turn_start');
    expect(preAiIdx).toBeGreaterThan(0);
    expect(postAiIdx).toBeGreaterThan(preAiIdx);

    ws.close();
  });
});
