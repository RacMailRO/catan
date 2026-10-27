import { describe, expect, it } from 'vitest';
import {
  ALL_RESOURCES,
  GameAction,
  ReplayRecorder,
  applyAction,
  calculatePlayerLongestRoad,
  calculateScore,
  canPlayDevCardType,
  createGame,
  createRulesConfig,
  expireStaleTradesInPlace,
  exportReplayJson,
  getLegalActions,
  getPlayerBankTradeRatio,
  getPlayerById,
  getPlayerView,
  importReplayJson,
  reconstructStateAtSequence,
  totalResourceCount,
  validateAction,
  verifyReplayDeterminism
} from '@catan/core';
import { chooseAIAction } from '@catan/ai';

describe('Catan Core Engine & Replay System', () => {
  it('generates standard board with 19 hexes, 54 vertices, 72 edges, 9 harbors and balanced red numbers', () => {
    const state = createGame({
      gameId: 'test-board',
      seed: 'board-seed-1',
      participants: [
        { id: 'p1', name: 'Alice', type: 'human' },
        { id: 'p2', name: 'Bob', type: 'ai' },
        { id: 'p3', name: 'Carol', type: 'ai' },
        { id: 'p4', name: 'Dave', type: 'ai' }
      ]
    });

    expect(Object.keys(state.board.hexes)).toHaveLength(19);
    expect(Object.keys(state.board.vertices)).toHaveLength(54);
    expect(Object.keys(state.board.edges)).toHaveLength(72);
    expect(state.board.harbors).toHaveLength(9);

    const desertHexes = Object.values(state.board.hexes).filter((h) => h.terrain === 'desert');
    expect(desertHexes).toHaveLength(1);
    expect(state.board.robberHexId).toBe(desertHexes[0]!.id);
    expect(desertHexes[0]!.numberToken).toBeNull();

    // Check 6 and 8 are not adjacent in random_balanced mode
    const redHexes = Object.values(state.board.hexes).filter(
      (h) => h.numberToken === 6 || h.numberToken === 8
    );
    expect(redHexes).toHaveLength(4);
    for (let i = 0; i < redHexes.length; i++) {
      for (let j = i + 1; j < redHexes.length; j++) {
        const h1 = redHexes[i]!;
        const h2 = redHexes[j]!;
        const dist =
          (Math.abs(h1.q - h2.q) +
            Math.abs(h1.r - h2.r) +
            Math.abs(-h1.q - h1.r - (-h2.q - h2.r))) /
          2;
        expect(dist).toBeGreaterThan(1);
      }
    }
  });

  it('generates a valid board under the random_pure layout (independently shuffled tokens, no spiral constraint)', () => {
    const state = createGame({
      gameId: 'test-board-pure',
      seed: 'pure-seed-1',
      participants: [
        { id: 'p1', name: 'Alice', type: 'human' },
        { id: 'p2', name: 'Bob', type: 'ai' },
        { id: 'p3', name: 'Carol', type: 'ai' },
        { id: 'p4', name: 'Dave', type: 'ai' }
      ],
      rules: createRulesConfig({ boardLayout: 'random_pure' })
    });

    expect(Object.keys(state.board.hexes)).toHaveLength(19);
    expect(state.board.harbors).toHaveLength(9);

    const hexes = Object.values(state.board.hexes);
    const desertHexes = hexes.filter((h) => h.terrain === 'desert');
    expect(desertHexes).toHaveLength(1);
    expect(desertHexes[0]!.numberToken).toBeNull();

    // Every non-desert hex gets exactly one of the 18 standard number tokens, none repeated
    // beyond their normal counts, and letters are NOT assigned (A-R letters are specific to
    // the official alphabetical spiral procedure, not meaningful for a pure-random table).
    const nonDesertTokens = hexes.filter((h) => h.terrain !== 'desert').map((h) => h.numberToken);
    expect(nonDesertTokens).toHaveLength(18);
    expect(nonDesertTokens.every((t) => t !== null)).toBe(true);
    expect(hexes.every((h) => h.tokenLetter === null)).toBe(true);

    // Same seed -> same board (deterministic), matching the engine's reproducibility guarantee.
    const replayState = createGame({
      gameId: 'test-board-pure-2',
      seed: 'pure-seed-1',
      participants: [
        { id: 'p1', name: 'Alice', type: 'human' },
        { id: 'p2', name: 'Bob', type: 'ai' },
        { id: 'p3', name: 'Carol', type: 'ai' },
        { id: 'p4', name: 'Dave', type: 'ai' }
      ],
      rules: createRulesConfig({ boardLayout: 'random_pure' })
    });
    expect(replayState.board.hexes).toEqual(state.board.hexes);
  });

  it('supports the 5-6 Player Expansion board scenario: 30 hexes, 11 harbors, 6 players, 2 deserts', () => {
    const participants = [
      { id: 'p1', name: 'Alice', type: 'human' as const },
      { id: 'p2', name: 'Bob', type: 'ai' as const },
      { id: 'p3', name: 'Carol', type: 'ai' as const },
      { id: 'p4', name: 'Dave', type: 'ai' as const },
      { id: 'p5', name: 'Eve', type: 'ai' as const },
      { id: 'p6', name: 'Frank', type: 'ai' as const }
    ];

    const state = createGame({
      gameId: 'test-expansion-1',
      seed: 'expansion-seed-1',
      participants,
      rules: createRulesConfig({ boardScenario: 'expansion' })
    });

    expect(state.players).toHaveLength(6);
    expect(new Set(state.players.map((p) => p.color)).size).toBe(6); // all distinct colors

    expect(Object.keys(state.board.hexes)).toHaveLength(30);
    expect(state.board.harbors).toHaveLength(11);

    const hexes = Object.values(state.board.hexes);
    const desertHexes = hexes.filter((h) => h.terrain === 'desert');
    expect(desertHexes).toHaveLength(2);
    expect(['classic', 'expansion']).toContain(state.rules.boardScenario);
    expect(state.rules.boardScenario).toBe('expansion');

    const nonDesertTokens = hexes.filter((h) => h.terrain !== 'desert').map((h) => h.numberToken);
    expect(nonDesertTokens).toHaveLength(28);
    expect(nonDesertTokens.every((t) => t !== null)).toBe(true);

    // The real 5-6 Player Expansion places its (fixed, pre-printed) tokens so 6s and 8s are
    // never adjacent, same guarantee as the classic board — reproduced here via a balanced
    // shuffle rather than the (unpublished) official letter sequence. Check across several
    // seeds since this isn't structurally guaranteed by construction the way the classic
    // board's fixed A-R sequence is — it's a shuffle-and-reject loop that could in principle
    // fail, so this also covers that the loop is actually doing its job.
    for (const seed of ['expansion-seed-1', 'expansion-seed-2', 'expansion-seed-3', 'expansion-seed-4']) {
      const seededState = createGame({
        gameId: `test-expansion-balance-${seed}`,
        seed,
        participants,
        rules: createRulesConfig({ boardScenario: 'expansion' })
      });
      const hotHexes = Object.values(seededState.board.hexes).filter(
        (h) => h.numberToken === 6 || h.numberToken === 8
      );
      for (let i = 0; i < hotHexes.length; i++) {
        for (let j = i + 1; j < hotHexes.length; j++) {
          const h1 = hotHexes[i]!;
          const h2 = hotHexes[j]!;
          const dist =
            (Math.abs(h1.q - h2.q) + Math.abs(h1.r - h2.r) + Math.abs(-h1.q - h1.r - (-h2.q - h2.r))) / 2;
          expect(dist).toBeGreaterThan(1);
        }
      }
    }

    // A 7th participant must be rejected on the expansion board (max 6), and a 5th must be
    // rejected on the classic board (max 4) — the scenario's player cap is actually enforced.
    expect(() =>
      createGame({
        gameId: 'test-expansion-overflow',
        seed: 'overflow-seed',
        participants: [...participants, { id: 'p7', name: 'Grace', type: 'ai' as const }],
        rules: createRulesConfig({ boardScenario: 'expansion' })
      })
    ).toThrow();

    expect(() =>
      createGame({
        gameId: 'test-classic-overflow',
        seed: 'overflow-seed-2',
        participants,
        rules: createRulesConfig({ boardScenario: 'classic' })
      })
    ).toThrow();
  });

  it('automatically adds passive bots up to 3 players when 1 or 2 participants are configured', () => {
    const soloGame = createGame({
      gameId: 'solo-1',
      seed: 'solo-seed',
      participants: [{ id: 'p1', name: 'SoloPlayer', type: 'human' }]
    });

    expect(soloGame.players).toHaveLength(3);
    expect(soloGame.rules.presetId).toBe('small_group');
    expect(soloGame.players[1]!.type).toBe('passive');
    expect(soloGame.players[2]!.type).toBe('passive');
  });

  it('enforces snake draft setup, distance rule, road connection, and starting resources options', () => {
    // Test standard second_settlement vs both_settlements
    let state = createGame({
      gameId: 'setup-test',
      seed: 'setup-seed-42',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'ai' },
        { id: 'p3', name: 'P3', type: 'ai' }
      ],
      rules: {
        startingResourcesRule: 'second_settlement'
      }
    });

    expect(state.phase).toBe('setup_settlement_1');
    expect(state.activePlayerId).toBe('p1');

    // Place P1 first settlement on V0
    state = applyAction(state, 'p1', {
      type: 'place_initial_settlement',
      vertexId: 'V0'
    }).state;
    expect(state.phase).toBe('setup_road_1');
    // P1 should have 0 resources after 1st settlement in standard mode
    expect(totalResourceCount(getPlayerById(state, 'p1')!.resources)).toBe(0);

    // Try placing road on a disconnected edge -> should fail validation
    const v0 = state.board.vertices['V0']!;
    const disconnectedEdge = Object.keys(state.board.edges).find(
      (eId) => !v0.adjacentEdgeIds.includes(eId)
    )!;
    expect(
      validateAction(state, 'p1', { type: 'place_initial_road', edgeId: disconnectedEdge }).valid
    ).toBe(false);

    // Place valid road for P1
    state = applyAction(state, 'p1', {
      type: 'place_initial_road',
      edgeId: v0.adjacentEdgeIds[0]!
    }).state;

    // Now P2's turn: test distance rule violation on V0 and its neighbor
    expect(state.activePlayerId).toBe('p2');
    expect(
      validateAction(state, 'p2', { type: 'place_initial_settlement', vertexId: 'V0' }).valid
    ).toBe(false);
    expect(
      validateAction(state, 'p2', {
        type: 'place_initial_settlement',
        vertexId: v0.adjacentVertexIds[0]!
      }).valid
    ).toBe(false);

    // Finish remaining setup steps using first legal action
    const expectedOrder = ['p2', 'p2', 'p3', 'p3', 'p3', 'p3', 'p2', 'p2', 'p1', 'p1'];
    for (const expectedPlayer of expectedOrder) {
      expect(state.activePlayerId).toBe(expectedPlayer);
      const legal = getLegalActions(state, expectedPlayer);
      expect(legal.length).toBeGreaterThan(0);
      state = applyAction(state, expectedPlayer, legal[0]!).state;
    }

    expect(state.phase).toBe('turn_start');
    expect(state.turn).toBe(1);
    expect(state.activePlayerId).toBe('p1');

    // Verify both_settlements starting resource rule grants resources on 1st settlement too
    let bothState = createGame({
      gameId: 'setup-both',
      seed: 'setup-seed-42',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'ai' },
        { id: 'p3', name: 'P3', type: 'ai' }
      ],
      rules: {
        startingResourcesRule: 'both_settlements'
      }
    });
    // Pick an interior vertex with 3 adjacent hexes
    const interiorVertex = Object.values(bothState.board.vertices).find(
      (v) => v.adjacentHexIds.length === 3
    )!;
    bothState = applyAction(bothState, 'p1', {
      type: 'place_initial_settlement',
      vertexId: interiorVertex.id
    }).state;
    expect(totalResourceCount(getPlayerById(bothState, 'p1')!.resources)).toBeGreaterThan(0);
  });

  it('handles dice 7 discard rule (9 cards -> discard 4), robber movement, single and multi-steal rules', () => {
    let state = createGame({
      gameId: 'robber-test',
      seed: 'robber-seed',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'human' },
        { id: 'p3', name: 'P3', type: 'human' }
      ],
      rules: {
        knightStealRule: 'all_adjacent'
      }
    });

    // Complete setup automatically
    while (state.phase !== 'turn_start') {
      const pId = state.activePlayerId;
      const act = getLegalActions(state, pId)[0]!;
      state = applyAction(state, pId, act).state;
    }

    // Give p2 9 wood cards and p3 5 brick cards
    const p2 = getPlayerById(state, 'p2')!;
    const p3 = getPlayerById(state, 'p3')!;
    p2.resources = { wood: 9, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    p3.resources = { wood: 0, brick: 5, sheep: 0, wheat: 0, ore: 0 };

    // Simulate entering discard_resources phase as if 7 was rolled
    state.phase = 'discard_resources';
    state.pendingDiscards = { p2: 4 };
    state.robberContext = {
      source: 'dice_7',
      returnPhase: 'main_actions',
      eligibleTargetIds: []
    };

    // Trying to discard 3 instead of 4 must fail
    expect(
      validateAction(state, 'p2', { type: 'discard_cards', resources: { wood: 3 } }).valid
    ).toBe(false);

    // Discarding 4 succeeds and transitions to move_robber
    state = applyAction(state, 'p2', {
      type: 'discard_cards',
      resources: { wood: 4 }
    }).state;
    expect(getPlayerById(state, 'p2')!.resources.wood).toBe(5);
    expect(state.phase).toBe('move_robber');

    // Place p2 and p3 buildings on the same hex H0 (distinct vertices) and test multi-steal Knight
    const h0Vertices = Object.values(state.board.vertices).filter((v) =>
      v.adjacentHexIds.includes('H0')
    );
    state.board.buildings[h0Vertices[0]!.id] = {
      ownerId: 'p2',
      type: 'settlement',
      vertexId: h0Vertices[0]!.id
    };
    state.board.buildings[h0Vertices[2]!.id] = {
      ownerId: 'p3',
      type: 'settlement',
      vertexId: h0Vertices[2]!.id
    };
    state.board.robberHexId = 'H5';

    // Complete move_robber to H1 first (passing targetPlayerId if targets exist)
    state = applyAction(state, 'p1', { type: 'move_robber', hexId: 'H18' }).state;
    if (state.phase === 'steal_resource') {
      const targetId = state.robberContext!.eligibleTargetIds[0]!;
      state = applyAction(state, 'p1', { type: 'steal_from_player', targetPlayerId: targetId }).state;
    }
    expect(state.phase).toBe('main_actions');

    // Reset p1, p2, p3 resources before testing multi-steal Knight on H0
    const p1 = getPlayerById(state, 'p1')!;
    p1.resources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    getPlayerById(state, 'p2')!.resources = { wood: 5, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    getPlayerById(state, 'p3')!.resources = { wood: 0, brick: 5, sheep: 0, wheat: 0, ore: 0 };
    p1.devCards.push({
      id: 'DC_TEST_KNIGHT',
      type: 'knight',
      boughtAtTurn: 0,
      played: false
    });

    // Play Knight targeting H0 where both p2 (wood) and p3 (brick) are present!
    // Since knightStealRule is 'all_adjacent', p1 should steal 1 wood from p2 AND 1 brick from p3!
    state = applyAction(state, 'p1', {
      type: 'play_knight',
      hexId: 'H0'
    }).state;

    const p1After = getPlayerById(state, 'p1')!;
    expect(p1After.resources.wood).toBe(1);
    expect(p1After.resources.brick).toBe(1);
    expect(getPlayerById(state, 'p2')!.resources.wood).toBe(4);
    expect(getPlayerById(state, 'p3')!.resources.brick).toBe(4);
  });

  it('calculates Longest Road accurately and detects road breakage by opponent settlement', () => {
    const state = createGame({
      gameId: 'road-test',
      seed: 'road-seed',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'human' },
        { id: 'p3', name: 'P3', type: 'human' }
      ]
    });

    // Build a continuous path of 5 edges around Hex H0 for p1
    const h0Edges = Object.values(state.board.edges).filter((e) =>
      e.adjacentHexIds.includes('H0')
    );
    // Order edges along the perimeter of H0
    const orderedEdges: typeof h0Edges = [h0Edges[0]!];
    while (orderedEdges.length < 5) {
      const last = orderedEdges[orderedEdges.length - 1]!;
      const next = h0Edges.find(
        (e) =>
          !orderedEdges.includes(e) &&
          (e.v1 === last.v1 || e.v1 === last.v2 || e.v2 === last.v1 || e.v2 === last.v2)
      )!;
      orderedEdges.push(next);
    }

    for (const e of orderedEdges) {
      state.board.roads[e.id] = { ownerId: 'p1', edgeId: e.id };
    }

    expect(calculatePlayerLongestRoad(state.board, 'p1')).toBe(5);

    // Find the shared vertex between edge[1] and edge[2] (middle of the 5-road chain)
    const e1 = orderedEdges[1]!;
    const e2 = orderedEdges[2]!;
    const midVertexId = e1.v1 === e2.v1 || e1.v1 === e2.v2 ? e1.v1 : e1.v2;

    // Place an opponent (p2) settlement on midVertexId -> splits the 5-edge road into 2 and 3!
    state.board.buildings[midVertexId] = {
      ownerId: 'p2',
      type: 'settlement',
      vertexId: midVertexId
    };

    expect(calculatePlayerLongestRoad(state.board, 'p1')).toBe(3);
  });

  it('supports bank/harbor trades (4:1, 3:1, 2:1), P2P trades with timeout, and dev card rules', () => {
    let state = createGame({
      gameId: 'trade-dev-test',
      seed: 'trade-seed',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'human' },
        { id: 'p3', name: 'P3', type: 'human' }
      ],
      rules: {
        devCardsPerTurnRule: 'one_per_type',
        tradeOfferTimeoutSec: 30
      }
    });

    while (state.phase !== 'turn_start') {
      const pId = state.activePlayerId;
      state = applyAction(state, pId, getLegalActions(state, pId)[0]!).state;
    }

    // Move to main_actions, with p1 as actor — play order is now decided by each player's
    // opening dice roll rather than seat order, so force it rather than assume p1 is active.
    state.phase = 'main_actions';
    state.activePlayerId = 'p1';
    const p1 = getPlayerById(state, 'p1')!;
    const p2 = getPlayerById(state, 'p2')!;
    p1.resources = { wood: 6, brick: 2, sheep: 2, wheat: 2, ore: 2 };
    p2.resources = { wood: 0, brick: 0, sheep: 0, wheat: 3, ore: 0 };

    // Find a 2:1 wood harbor vertex and place a p1 settlement on it
    const woodHarbor = state.board.harbors.find((h) => h.type === 'wood')!;
    state.board.buildings[woodHarbor.vertexIds[0]] = {
      ownerId: 'p1',
      type: 'settlement',
      vertexId: woodHarbor.vertexIds[0]
    };

    expect(getPlayerBankTradeRatio(state.board, 'p1', 'wood')).toBe(2);

    // Trade 2 wood for 1 ore using the 2:1 harbor
    state = applyAction(state, 'p1', {
      type: 'trade_bank',
      give: 'wood',
      giveAmount: 2,
      receive: 'ore'
    }).state;
    expect(getPlayerById(state, 'p1')!.resources.wood).toBe(4);
    expect(getPlayerById(state, 'p1')!.resources.ore).toBe(3);

    // Propose P2P trade at t = 1000ms
    state = applyAction(
      state,
      'p1',
      {
        type: 'propose_trade',
        toPlayerId: 'p2',
        offering: { wood: 1 },
        requesting: { wheat: 1 }
      },
      { nowMs: 1000 }
    ).state;

    const offerId = state.activeTradeOffers[0]!.id;

    // Test trade expiration after 31 seconds
    const expiredClone = structuredClone(state);
    expireStaleTradesInPlace(expiredClone, 32000);
    expect(expiredClone.activeTradeOffers[0]!.status).toBe('expired');

    // Accept trade before expiration at t = 5000ms
    state = applyAction(
      state,
      'p2',
      {
        type: 'respond_trade',
        offerId,
        response: 'accept'
      },
      { nowMs: 5000 }
    ).state;
    expect(getPlayerById(state, 'p1')!.resources.wheat).toBe(3);
    expect(getPlayerById(state, 'p2')!.resources.wood).toBe(1);

    // Test playing two different dev cards in the same turn under 'one_per_type' rule
    const p1Ref = getPlayerById(state, 'p1')!;
    p1Ref.devCards.push(
      { id: 'dc1', type: 'year_of_plenty', boughtAtTurn: 0, played: false },
      { id: 'dc2', type: 'monopoly', boughtAtTurn: 0, played: false },
      { id: 'dc3', type: 'monopoly', boughtAtTurn: 0, played: false }
    );

    state = applyAction(state, 'p1', {
      type: 'play_year_of_plenty',
      resources: ['brick', 'sheep']
    }).state;

    // Give opponents some wheat to verify monopoly collects all of it
    getPlayerById(state, 'p2')!.resources.wheat = 3;
    getPlayerById(state, 'p3')!.resources.wheat = 2;
    const p1WheatBefore = getPlayerById(state, 'p1')!.resources.wheat;

    // Can play monopoly in same turn because devCardsPerTurnRule === 'one_per_type'
    expect(
      validateAction(state, 'p1', { type: 'play_monopoly', resource: 'wheat' }).valid
    ).toBe(true);
    const monopolyResult = applyAction(state, 'p1', {
      type: 'play_monopoly',
      resource: 'wheat'
    });
    state = monopolyResult.state;
    expect(getPlayerById(state, 'p2')!.resources.wheat).toBe(0);
    expect(getPlayerById(state, 'p3')!.resources.wheat).toBe(0);
    expect(getPlayerById(state, 'p1')!.resources.wheat).toBe(p1WheatBefore + 5);
    expect(monopolyResult.event.details?.totalTaken).toBe(5);

    // Cannot play a SECOND monopoly in the same turn
    expect(
      validateAction(state, 'p1', { type: 'play_monopoly', resource: 'wood' }).valid
    ).toBe(false);
  });

  it('protects hidden information in getPlayerView and verifies deterministic Replay & Snapshots', () => {
    const initial = createGame({
      gameId: 'replay-game',
      seed: 'deterministic-seed-99',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'ai' },
        { id: 'p3', name: 'P3', type: 'ai' }
      ]
    });

    const recorder = new ReplayRecorder(initial, 5);

    // Execute 35 deterministic steps
    for (let step = 0; step < 35; step++) {
      const cur = recorder.getState();
      if (cur.phase === 'game_over') break;

      // Determine who needs to act
      let actorId = cur.activePlayerId;
      if (cur.phase === 'discard_resources') {
        actorId = Object.keys(cur.pendingDiscards)[0]!;
      }

      const legal = getLegalActions(cur, actorId);
      expect(legal.length).toBeGreaterThan(0);
      // Pick end_turn or roll_dice or first action so turns advance cleanly
      const action =
        legal.find((a) => a.type === 'roll_dice') ??
        legal.find((a) => a.type === 'build_settlement') ??
        legal.find((a) => a.type === 'build_road') ??
        legal[0]!;

      recorder.recordAndApply(actorId, action, { nowMs: 1000 + step * 100 });
    }

    // Add a hidden VP card to p2 and verify p1's PlayerView cannot see it
    const currentState = recorder.getState();
    const p2 = getPlayerById(currentState, 'p2')!;
    p2.devCards.push({
      id: 'hidden-vp',
      type: 'victory_point',
      boughtAtTurn: 1,
      played: false
    });

    const p1View = getPlayerView(currentState, 'p1');
    const p2InP1View = p1View.players.find((p) => p.id === 'p2')!;
    expect(p2InP1View.resources).toBeUndefined();
    expect(p2InP1View.totalScore).toBeUndefined();
    expect(p2InP1View.devCards).toHaveLength(0);

    const p2SelfView = getPlayerView(currentState, 'p2');
    const p2InSelfView = p2SelfView.players.find((p) => p.id === 'p2')!;
    expect(p2InSelfView.resources).toBeDefined();
    expect(p2InSelfView.totalScore).toBe(p2InSelfView.publicScore + 1);

    // Export and re-import replay JSON
    const replayFile = recorder.toReplayFile();
    const json = exportReplayJson(replayFile);
    const imported = importReplayJson(json);

    const verification = verifyReplayDeterminism(imported);
    expect(verification.valid).toBe(true);
    expect(verification.totalEvents).toBe(35);

    // Reconstruct state at mid-game sequence 17 and final sequence 35
    const stateAt17 = reconstructStateAtSequence(imported, 17, true);
    expect(stateAt17.sequence).toBe(17);

    const stateAt35 = reconstructStateAtSequence(imported, 35, true);
    expect(stateAt35.sequence).toBe(35);
    expect(
      ALL_RESOURCES.every((r) => stateAt35.bank[r] >= 0)
    ).toBe(true);
  });

  it('declares victory at custom victoryPointsToWin (10, 12, 14)', () => {
    const state = createGame({
      gameId: 'vp-12-test',
      seed: 'vp-seed',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'ai' },
        { id: 'p3', name: 'P3', type: 'ai' }
      ],
      rules: {
        victoryPointsToWin: 12
      }
    });

    // Give p1 5 cities (10 pts) + 1 VP card (1 pt) = 11 pts -> not yet winner at 12 VP
    const vIds = Object.keys(state.board.vertices);
    for (let i = 0; i < 5; i++) {
      state.board.buildings[vIds[i * 5]!] = {
        ownerId: 'p1',
        type: 'city',
        vertexId: vIds[i * 5]!
      };
    }
    const p1 = getPlayerById(state, 'p1')!;
    p1.devCards.push({ id: 'vp1', type: 'victory_point', boughtAtTurn: 0, played: false });

    expect(calculateScore(state, 'p1').totalScore).toBe(11);
    state.phase = 'main_actions';
    state.activePlayerId = 'p1';

    // Give p1 a second VP card -> 12 pts
    p1.devCards.push({ id: 'vp2', type: 'victory_point', boughtAtTurn: 0, played: false });
    const afterEnd = applyAction(state, 'p1', { type: 'end_turn' }).state;
    expect(afterEnd.winnerId).toBe('p1');
    expect(afterEnd.phase).toBe('game_over');
  });
  it('allows proposer to cancel a trade offer even after all players rejected it', () => {
    let state = createGame({
      gameId: 'trade-cancel-test',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'ai' },
        { id: 'p3', name: 'P3', type: 'ai' }
      ]
    });
    state.phase = 'main_actions';
    state.activePlayerId = 'p1';
    const p1 = getPlayerById(state, 'p1')!;
    p1.resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };

    state = applyAction(state, 'p1', {
      type: 'propose_trade',
      offering: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      requesting: { wood: 0, brick: 1, sheep: 0, wheat: 0, ore: 0 }
    }).state;

    const offerId = state.activeTradeOffers[0]!.id;
    expect(state.activeTradeOffers[0]!.status).toBe('open');

    state = applyAction(state, 'p2', {
      type: 'respond_trade',
      offerId,
      response: 'reject',
      reason: 'No brick'
    }).state;

    state = applyAction(state, 'p3', {
      type: 'respond_trade',
      offerId,
      response: 'reject',
      reason: 'No brick either'
    }).state;

    expect(state.activeTradeOffers[0]!.status).toBe('rejected');

    const validation = validateAction(state, 'p1', { type: 'cancel_trade', offerId });
    expect(validation.valid).toBe(true);

    const cancelledState = applyAction(state, 'p1', { type: 'cancel_trade', offerId }).state;
    expect(cancelledState.activeTradeOffers[0]!.status).toBe('cancelled');
  });

  it('plays Road Building for 2 free roads, both before rolling dice (back to turn_start) and after (back to main_actions)', () => {
    let state = createGame({
      gameId: 'road-building-test',
      seed: 'road-building-seed',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'human' },
        { id: 'p3', name: 'P3', type: 'human' }
      ]
    });
    while (state.phase !== 'turn_start') {
      const pId = state.activePlayerId;
      state = applyAction(state, pId, getLegalActions(state, pId)[0]!).state;
    }

    // Case A: play Road Building BEFORE rolling dice this turn.
    state.activePlayerId = 'p1';
    state.lastDiceRoll = undefined;
    const p1 = getPlayerById(state, 'p1')!;
    const roadsBefore = p1.remainingPieces.roads;
    p1.devCards.push({ id: 'rb1', type: 'road_building', boughtAtTurn: 0, played: false });

    expect(canPlayDevCardType(state, p1, 'road_building')).toBe(true);
    const legalAtTurnStart = getLegalActions(state, 'p1');
    expect(legalAtTurnStart.some((a) => a.type === 'play_road_building')).toBe(true);

    state = applyAction(state, 'p1', { type: 'play_road_building' }).state;
    expect(state.phase).toBe('road_building_card');
    expect(state.freeRoadsRemaining).toBe(2);
    expect(getPlayerById(state, 'p1')!.devCards.find((c) => c.id === 'rb1')!.played).toBe(true);

    // Place both free roads, discovering legal edges dynamically (board-layout-agnostic).
    for (let i = 0; i < 2; i++) {
      const legalRoads = getLegalActions(state, 'p1').filter(
        (a): a is Extract<GameAction, { type: 'place_free_road' }> => a.type === 'place_free_road'
      );
      expect(legalRoads.length).toBeGreaterThan(0);
      state = applyAction(state, 'p1', legalRoads[0]!).state;
    }

    expect(state.freeRoadsRemaining).toBe(0);
    expect(getPlayerById(state, 'p1')!.remainingPieces.roads).toBe(roadsBefore - 2);
    // Played before rolling dice this turn -> must still roll, not skip straight to main_actions.
    expect(state.phase).toBe('turn_start');
    expect(getLegalActions(state, 'p1').some((a) => a.type === 'roll_dice')).toBe(true);

    // Roll dice to leave turn_start legally, resolve a 7 if one came up, then end the turn so
    // hasPlayedDevCardThisTurn resets (the default 'one_total' rule forbids a second dev card in
    // the same turn regardless of before/after-dice timing), and force play back to p1 for a
    // fresh turn to test Case B in isolation.
    state = applyAction(state, 'p1', { type: 'roll_dice' }).state;
    while (state.phase !== 'main_actions') {
      const actorId =
        state.phase === 'discard_resources' ? Object.keys(state.pendingDiscards)[0]! : state.activePlayerId;
      const legal = getLegalActions(state, actorId);
      state = applyAction(state, actorId, legal[0]!).state;
    }
    state = applyAction(state, 'p1', { type: 'end_turn' }).state;
    state.activePlayerId = 'p1';
    state.phase = 'turn_start';
    state.lastDiceRoll = undefined;

    // Case B: play Road Building AFTER rolling dice this turn -> returns to main_actions.
    state = applyAction(state, 'p1', { type: 'roll_dice' }).state;
    while (state.phase !== 'main_actions') {
      const actorId =
        state.phase === 'discard_resources' ? Object.keys(state.pendingDiscards)[0]! : state.activePlayerId;
      const legal = getLegalActions(state, actorId);
      state = applyAction(state, actorId, legal[0]!).state;
    }
    expect(state.phase).toBe('main_actions');

    const p1Again = getPlayerById(state, 'p1')!;
    p1Again.devCards.push({ id: 'rb2', type: 'road_building', boughtAtTurn: 0, played: false });
    const roadsBeforeSecond = p1Again.remainingPieces.roads;

    state = applyAction(state, 'p1', { type: 'play_road_building' }).state;
    expect(state.phase).toBe('road_building_card');
    expect(state.freeRoadsRemaining).toBe(2);

    for (let i = 0; i < 2; i++) {
      const legalRoads = getLegalActions(state, 'p1').filter(
        (a): a is Extract<GameAction, { type: 'place_free_road' }> => a.type === 'place_free_road'
      );
      expect(legalRoads.length).toBeGreaterThan(0);
      state = applyAction(state, 'p1', legalRoads[0]!).state;
    }

    expect(state.freeRoadsRemaining).toBe(0);
    expect(getPlayerById(state, 'p1')!.remainingPieces.roads).toBe(roadsBeforeSecond - 2);
    // Played after rolling dice this turn -> returns to main_actions, not back to turn_start.
    expect(state.phase).toBe('main_actions');

    // Cannot play a second Road Building this turn once one is already played ('one_total' default rule).
    const p1Final = getPlayerById(state, 'p1')!;
    p1Final.devCards.push({ id: 'rb3', type: 'road_building', boughtAtTurn: 0, played: false });
    expect(canPlayDevCardType(state, p1Final, 'road_building')).toBe(false);
  });

  it('negotiates a trade: AI rejects an unfavorable offer, tracks who rejected, and accepts a re-proposed counter-offer', () => {
    let state = createGame({
      gameId: 'trade-negotiate-test',
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'ai', aiDifficulty: 'medium', aiStyle: 'balanced' },
        { id: 'p3', name: 'P3', type: 'ai', aiDifficulty: 'medium', aiStyle: 'balanced' }
      ]
    });
    state.phase = 'main_actions';
    state.activePlayerId = 'p1';
    const p1 = getPlayerById(state, 'p1')!;
    const p2 = getPlayerById(state, 'p2')!;
    p1.resources = { wood: 4, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    p2.resources = { wood: 0, brick: 3, sheep: 0, wheat: 0, ore: 0 };

    // Lowball offer p2 should reject: giving up its only scarce resource (brick) for a
    // single wood it doesn't especially need.
    state = applyAction(state, 'p1', {
      type: 'propose_trade',
      toPlayerId: 'p2',
      offering: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      requesting: { wood: 0, brick: 3, sheep: 0, wheat: 0, ore: 0 }
    }).state;
    const firstOfferId = state.activeTradeOffers[0]!.id;

    const rejectDecision = chooseAIAction(state, 'p2');
    expect(rejectDecision.action.type).toBe('respond_trade');
    if (rejectDecision.action.type === 'respond_trade') {
      expect(rejectDecision.action.response).toBe('reject');
    }
    state = applyAction(state, 'p2', rejectDecision.action).state;
    expect(state.activeTradeOffers.find((o) => o.id === firstOfferId)!.status).toBe('rejected');
    expect(
      state.activeTradeOffers.find((o) => o.id === firstOfferId)!.rejectedByPlayerIds
    ).toContain('p2');

    // Re-propose (negotiate) a fairer counter-offer: 1-for-1, which p2's evaluator should accept.
    state = applyAction(state, 'p1', {
      type: 'propose_trade',
      toPlayerId: 'p2',
      offering: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      requesting: { wood: 0, brick: 1, sheep: 0, wheat: 0, ore: 0 }
    }).state;
    const secondOfferId = state.activeTradeOffers.find((o) => o.status === 'open')!.id;

    const acceptDecision = chooseAIAction(state, 'p2');
    expect(acceptDecision.action.type).toBe('respond_trade');
    if (acceptDecision.action.type === 'respond_trade') {
      expect(acceptDecision.action.response).toBe('accept');
    }
    state = applyAction(state, 'p2', acceptDecision.action).state;
    expect(state.activeTradeOffers.find((o) => o.id === secondOfferId)!.status).toBe('accepted');
    expect(getPlayerById(state, 'p1')!.resources.brick).toBe(1);
    expect(getPlayerById(state, 'p2')!.resources.wood).toBe(1);
  });

  it('aligns getPlayerView.players strictly with playerOrder and includes propose_trade actions in getLegalActions', () => {
    const state = createGame({
      gameId: 'order-and-trade-test',
      seed: 'seed-order-123',
      participants: [
        { id: 'p1', name: 'Player 1', type: 'human', color: 'red' },
        { id: 'p2', name: 'Player 2', type: 'human', color: 'blue' },
        { id: 'p3', name: 'Player 3', type: 'human', color: 'orange' },
        { id: 'p4', name: 'Player 4', type: 'human', color: 'green' }
      ]
    });

    // Verify getPlayerView follows playerOrder
    const view = getPlayerView(state, 'p1');
    const viewPlayerIds = view.players.map((p) => p.id);
    expect(viewPlayerIds).toEqual(state.playerOrder);

    // In main_actions, player with resources should have propose_trade in legal actions
    const mainState = { ...state, phase: 'main_actions' as const, activePlayerId: 'p1' };
    mainState.players[0]!.resources.wood = 2;
    const legal = getLegalActions(mainState, 'p1');
    const tradeProposals = legal.filter((a) => a.type === 'propose_trade');
    expect(tradeProposals.length).toBeGreaterThan(0);
    expect(tradeProposals.some((a) => a.type === 'propose_trade' && a.offering.wood === 1)).toBe(true);
  });
  it('disallows ships in classic 4-player Catan and allows them in Seafarers scenarios', () => {
    const classicGame = createGame({
      gameId: 'classic-no-ships',
      seed: 'classic-seed',
      rules: createRulesConfig({ boardScenario: 'classic' }),
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'ai' },
        { id: 'p3', name: 'P3', type: 'ai' },
        { id: 'p4', name: 'P4', type: 'ai' }
      ]
    });
    expect(classicGame.players[0]!.remainingPieces.ships).toBeUndefined();
    const validation = validateAction(classicGame, classicGame.activePlayerId, { type: 'build_ship', edgeId: 'e1' });
    expect(validation.valid).toBe(false);
    expect(validation.code).toBe('SHIPS_NOT_ALLOWED');

    const seafarersGame = createGame({
      gameId: 'seafarers-with-ships',
      seed: 'seafarers-seed',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores' }),
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'ai' },
        { id: 'p3', name: 'P3', type: 'ai' },
        { id: 'p4', name: 'P4', type: 'ai' }
      ]
    });
    expect(seafarersGame.players[0]!.remainingPieces.ships).toBe(15);
  });
});