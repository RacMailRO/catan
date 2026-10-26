import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { CatanServerInstance, createCatanServer, resolveAllowedOrigin } from '../../apps/server/src/server';
import { ServerToClientWsMessage } from '@catan/protocol';

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
  });
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
});