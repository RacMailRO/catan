import { describe, expect, it } from 'vitest';
import {
  BUILDING_COSTS,
  applyAction,
  calculatePlayerLongestRoad,
  createGame,
  createRulesConfig,
  getLegalActions,
  isEdgeLegalForPlayerShip,
  validateAction
} from '@catan/core';

describe('Catan Seafarers (Navigatori) & Custom Map Scenarios', () => {
  it('generates Heading to New Shores scenario with islands, sea hexes, and gold fields', () => {
    const game = createGame({
      gameId: 'test-shores',
      seed: 'shores-seed-1',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores' }),
      participants: [
        { id: 'p1', name: 'Alice', type: 'human' },
        { id: 'p2', name: 'Bob', type: 'ai' }
      ]
    });

    const terrains = Object.values(game.board.hexes).map((h) => h.terrain);
    expect(terrains).toContain('gold_field');
    expect(terrains).toContain('sea');

    // 15 ships initialized per player
    expect(game.players[0]!.remainingPieces.ships).toBe(15);
    expect(game.board.ships).toEqual({});
  });

  it('supports variable Seafarers maps when randomized while keeping beginner_fixed static', () => {
    const fixed1 = createGame({
      gameId: 'test-fixed-1',
      seed: 'seed-A',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores', boardLayout: 'beginner_fixed' }),
      participants: [{ id: 'p1', name: 'P1', type: 'human' }]
    });
    const fixed2 = createGame({
      gameId: 'test-fixed-2',
      seed: 'seed-B',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores', boardLayout: 'beginner_fixed' }),
      participants: [{ id: 'p1', name: 'P1', type: 'human' }]
    });
    // beginner_fixed maintains identical terrain and token layouts regardless of seed
    expect(Object.values(fixed1.board.hexes).map((h) => h.terrain))
      .toEqual(Object.values(fixed2.board.hexes).map((h) => h.terrain));
    expect(Object.values(fixed1.board.hexes).map((h) => h.numberToken))
      .toEqual(Object.values(fixed2.board.hexes).map((h) => h.numberToken));

    // random_balanced produces variable distributions across seeds while keeping sea intact
    const var1 = createGame({
      gameId: 'test-var-1',
      seed: 'seed-1111',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores', boardLayout: 'random_balanced' }),
      participants: [{ id: 'p1', name: 'P1', type: 'human' }]
    });
    const var2 = createGame({
      gameId: 'test-var-2',
      seed: 'seed-9999',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores', boardLayout: 'random_balanced' }),
      participants: [{ id: 'p1', name: 'P1', type: 'human' }]
    });

    // Sea hexes remain in their exact geographical positions in both
    const seaCoords1 = Object.values(var1.board.hexes).filter((h) => h.terrain === 'sea').map((h) => `${h.x},${h.y}`);
    const seaCoords2 = Object.values(var2.board.hexes).filter((h) => h.terrain === 'sea').map((h) => `${h.x},${h.y}`);
    expect(seaCoords1).toEqual(seaCoords2);

    // Land terrains and tokens vary between different seeds
    const terrains1 = Object.values(var1.board.hexes).map((h) => h.terrain);
    const terrains2 = Object.values(var2.board.hexes).map((h) => h.terrain);
    expect(terrains1).not.toEqual(terrains2);
  });

  it('generates Four Islands, Fog Island, and World Map scenarios', () => {
    for (const scenario of ['seafarers_islands', 'seafarers_fog', 'world_map'] as const) {
      const game = createGame({
        gameId: `test-${scenario}`,
        seed: `seed-${scenario}`,
        rules: createRulesConfig({ boardScenario: scenario }),
        participants: [
          { id: 'p1', name: 'Player1', type: 'human' },
          { id: 'p2', name: 'Player2', type: 'ai' }
        ]
      });

      expect(Object.keys(game.board.hexes).length).toBeGreaterThan(25);
      expect(Object.keys(game.board.vertices).length).toBeGreaterThan(60);
      expect(Object.keys(game.board.edges).length).toBeGreaterThan(80);
      expect(game.board.ships).toBeDefined();

      // Ensure every harbor is placed on the coast of a land hex, never floating in deep sea
      for (const harbor of game.board.harbors) {
        const hex = game.board.hexes[harbor.hexId]!;
        expect(hex.terrain).not.toBe('sea');
        expect(hex.terrain).not.toBe('fog');
        for (const vId of harbor.vertexIds) {
          const v = game.board.vertices[vId]!;
          const touchesLand = v.adjacentHexIds.some((hId) => {
            const t = game.board.hexes[hId]?.terrain;
            return t && t !== 'sea' && t !== 'fog';
          });
          expect(touchesLand).toBe(true);
        }
      }

      if (scenario === 'seafarers_fog') {
        const fogHexes = Object.values(game.board.hexes).filter((h) => h.terrain === 'fog');
        expect(fogHexes.length).toBeGreaterThan(5);
      }
    }
  });

  it('allows building ships on water edges and deducts 1 wood + 1 sheep', () => {
    const game = createGame({
      gameId: 'test-ship-building',
      seed: 'ship-seed-1',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores' }),
      participants: [
        { id: 'p1', name: 'Alice', type: 'human' },
        { id: 'p2', name: 'Bob', type: 'ai' }
      ]
    });

    // Find a coastal vertex touching water
    const coastalVertex = Object.values(game.board.vertices).find((v) => {
      const hasWater = v.adjacentHexIds.some((hId) => game.board.hexes[hId]?.terrain === 'sea');
      const hasLand = v.adjacentHexIds.some(
        (hId) => game.board.hexes[hId]?.terrain && game.board.hexes[hId]?.terrain !== 'sea'
      );
      return hasWater && hasLand;
    });

    expect(coastalVertex).toBeDefined();
    const vId = coastalVertex!.id;

    // Place settlement
    game.board.buildings[vId] = { ownerId: 'p1', type: 'settlement', vertexId: vId };

    // Find water edge touching this settlement
    const waterEdge = coastalVertex!.adjacentEdgeIds.find((eId) => {
      return isEdgeLegalForPlayerShip(game.board, eId, 'p1');
    });

    expect(waterEdge).toBeDefined();

    // Prepare player resources for ship (1 wood, 1 sheep) and active turn
    game.phase = 'main_actions';
    game.activePlayerId = 'p1';
    const player = game.players.find((p) => p.id === 'p1')!;
    player.resources.wood = 2;
    player.resources.sheep = 2;

    const val = validateAction(game, 'p1', { type: 'build_ship', edgeId: waterEdge! });
    expect(val.valid).toBe(true);

    const result = applyAction(game, 'p1', { type: 'build_ship', edgeId: waterEdge! });
    const nextState = result.state;
    expect(nextState.board.ships![waterEdge!]).toBeDefined();
    expect(nextState.board.ships![waterEdge!]!.ownerId).toBe('p1');
    const p1Next = nextState.players.find((p) => p.id === 'p1')!;
    expect(p1Next.remainingPieces.ships).toBe(14);
    expect(p1Next.resources.wood).toBe(1);
    expect(p1Next.resources.sheep).toBe(1);
  });

  it('connects roads and ships into continuous Longest Trade Route', () => {
    const game = createGame({
      gameId: 'test-trade-route',
      seed: 'route-seed-1',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores' }),
      participants: [{ id: 'p1', name: 'Alice', type: 'human' }]
    });

    // Find a coastal settlement spot with at least 1 land edge and 1 water edge
    const coastalV = Object.values(game.board.vertices).find((v) => {
      const hasWater = v.adjacentHexIds.some((hId) => game.board.hexes[hId]?.terrain === 'sea');
      const hasLand = v.adjacentHexIds.some(
        (hId) => game.board.hexes[hId]?.terrain && game.board.hexes[hId]?.terrain !== 'sea'
      );
      return hasWater && hasLand && v.adjacentEdgeIds.length >= 2;
    })!;

    const e1 = coastalV.adjacentEdgeIds[0]!;
    const e2 = coastalV.adjacentEdgeIds[1]!;

    // Place a road on e1 and a ship on e2
    game.board.roads[e1] = { ownerId: 'p1', edgeId: e1 };
    game.board.ships![e2] = { ownerId: 'p1', edgeId: e2 };

    // With a settlement at coastalV, road and ship connect!
    game.board.buildings[coastalV.id] = { ownerId: 'p1', type: 'settlement', vertexId: coastalV.id };

    const routeLen = calculatePlayerLongestRoad(game.board, 'p1');
    expect(routeLen).toBe(2);
  });

  it('handles Pirate on sea hex and Robber on land hex according to official rules', () => {
    const game = createGame({
      gameId: 'test-pirate-robber',
      seed: 'pirate-seed-1',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores' }),
      participants: [
        { id: 'p1', name: 'Alice', type: 'human' },
        { id: 'p2', name: 'Bob', type: 'human' }
      ]
    });

    // Both Robber and Pirate exist in Seafarers
    expect(game.board.robberHexId).toBeDefined();
    expect(game.board.hexes[game.board.robberHexId]!.terrain).not.toBe('sea');
    expect(game.board.pirateHexId).toBeDefined();
    expect(game.board.hexes[game.board.pirateHexId!]!.terrain).toBe('sea');

    const initialRobber = game.board.robberHexId;
    const initialPirate = game.board.pirateHexId!;

    // Find another sea hex
    const otherSeaHex = Object.values(game.board.hexes).find(
      (h) => h.terrain === 'sea' && h.id !== initialPirate
    )!;

    // Give Bob a ship on an edge bordering otherSeaHex and 1 resource
    const seaEdge = Object.values(game.board.edges).find((e) =>
      e.adjacentHexIds.includes(otherSeaHex.id)
    )!;
    game.board.ships![seaEdge.id] = { ownerId: 'p2', edgeId: seaEdge.id };
    game.players[1]!.resources.wood = 1;

    // Moving to sea hex moves the PIRATE (not the robber!)
    game.phase = 'move_robber';
    game.activePlayerId = 'p1';

    const valMovePirate = validateAction(game, 'p1', {
      type: 'move_robber',
      hexId: otherSeaHex.id,
      targetPlayerId: 'p2'
    });
    expect(valMovePirate.valid).toBe(true);

    const res1 = applyAction(game, 'p1', {
      type: 'move_robber',
      hexId: otherSeaHex.id,
      targetPlayerId: 'p2'
    });
    // Pirate moved to otherSeaHex, Robber stayed on initial land hex
    expect(res1.state.board.pirateHexId).toBe(otherSeaHex.id);
    expect(res1.state.board.robberHexId).toBe(initialRobber);
    // Pirate stole 1 resource from Bob (p2)
    expect(res1.state.players[1]!.resources.wood).toBe(0);
    expect(res1.state.players[0]!.resources.wood).toBe(1);

    // Pirate on otherSeaHex BLOCKS ship construction on all adjacent edges
    expect(isEdgeLegalForPlayerShip(res1.state.board, seaEdge.id, 'p1')).toBe(false);

    // Now test moving ROBBER to a different land hex
    const landHex = Object.values(game.board.hexes).find(
      (h) => h.terrain !== 'sea' && h.terrain !== 'fog' && h.id !== initialRobber
    )!;
    res1.state.phase = 'move_robber';
    res1.state.activePlayerId = 'p1';

    const res2 = applyAction(res1.state, 'p1', {
      type: 'move_robber',
      hexId: landHex.id
    });
    // Robber moved to landHex, Pirate stayed on otherSeaHex
    expect(res2.state.board.robberHexId).toBe(landHex.id);
    expect(res2.state.board.pirateHexId).toBe(otherSeaHex.id);
  });

  it('implements the official Special Building Phase for 5-6 player expansion', () => {
    const game = createGame({
      gameId: 'test-5p-special-build',
      seed: 'seed-5p',
      rules: createRulesConfig({ boardScenario: 'expansion' }),
      participants: [
        { id: 'p1', name: 'P1', type: 'human' },
        { id: 'p2', name: 'P2', type: 'human' },
        { id: 'p3', name: 'P3', type: 'human' },
        { id: 'p4', name: 'P4', type: 'human' },
        { id: 'p5', name: 'P5', type: 'human' }
      ]
    });

    game.phase = 'main_actions';
    game.turn = 1;
    game.activePlayerId = 'p1';
    game.playerOrder = ['p1', 'p2', 'p3', 'p4', 'p5'];

    // When P1 ends turn in 5-6 player expansion, game enters special_building phase
    const res1 = applyAction(game, 'p1', { type: 'end_turn' });
    expect(res1.state.phase).toBe('special_building');
    expect(res1.state.specialBuildingQueue).toEqual(['p2', 'p3', 'p4', 'p5']);
    expect(res1.state.activePlayerId).toBe('p2');

    // In special_building, P2 has building actions + pass_special_building, but no trading or end_turn
    const p2Actions = getLegalActions(res1.state, 'p2');
    expect(p2Actions.some((a) => a.type === 'pass_special_building')).toBe(true);
    expect(p2Actions.some((a) => a.type === 'end_turn')).toBe(false);
    expect(p2Actions.some((a) => a.type === 'trade_bank')).toBe(false);

    // Other players cannot act while P2 is in special_building
    expect(validateAction(res1.state, 'p3', { type: 'pass_special_building' }).valid).toBe(false);

    // P2 passes
    const res2 = applyAction(res1.state, 'p2', { type: 'pass_special_building' });
    expect(res2.state.phase).toBe('special_building');
    expect(res2.state.activePlayerId).toBe('p3');

    // P3, P4, P5 pass in sequence
    const res3 = applyAction(res2.state, 'p3', { type: 'pass_special_building' });
    const res4 = applyAction(res3.state, 'p4', { type: 'pass_special_building' });
    const res5 = applyAction(res4.state, 'p5', { type: 'pass_special_building' });

    // When queue finishes, regular turn advances to P2 (clockwise next player)
    expect(res5.state.phase).toBe('turn_start');
    expect(res5.state.activePlayerId).toBe('p2');
    expect(res5.state.turn).toBe(2);
  });

  it('implements moving ships (move_ship) with official rules and constraints', () => {
    const game = createGame({
      gameId: 'test-move-ship',
      seed: 'seed-move-ship',
      rules: createRulesConfig({ boardScenario: 'seafarers_shores' }),
      participants: [
        { id: 'p1', name: 'Alice', type: 'human' },
        { id: 'p2', name: 'Bob', type: 'human' }
      ]
    });

    game.phase = 'main_actions';
    game.turn = 2; // turn 2 so ship built on turn 1 can move
    game.activePlayerId = 'p1';

    // Find a coastal edge touching land and sea
    const coastalEdge = Object.values(game.board.edges).find((e) =>
      e.adjacentHexIds.some((hId) => game.board.hexes[hId]!.terrain === 'sea') &&
      e.adjacentHexIds.some((hId) => game.board.hexes[hId]!.terrain !== 'sea' && game.board.hexes[hId]!.terrain !== 'fog')
    )!;

    // Place settlement at v1 and ship at coastalEdge (turn 1)
    game.board.buildings[coastalEdge.v1] = { ownerId: 'p1', type: 'settlement', vertexId: coastalEdge.v1 };
    game.board.ships![coastalEdge.id] = { ownerId: 'p1', edgeId: coastalEdge.id, builtAtTurn: 1 };

    const legalActions = getLegalActions(game, 'p1');
    const moveActions = legalActions.filter((a) => a.type === 'move_ship');
    expect(moveActions.length).toBeGreaterThan(0);

    const firstMove = moveActions[0] as { type: 'move_ship'; fromEdgeId: string; toEdgeId: string };
    const res = applyAction(game, 'p1', firstMove);
    expect(res.state.board.ships![firstMove.fromEdgeId]).toBeUndefined();
    expect(res.state.board.ships![firstMove.toEdgeId]).toBeDefined();
    expect(res.state.board.ships![firstMove.toEdgeId]!.ownerId).toBe('p1');
    expect(res.state.players[0]!.hasMovedShipThisTurn).toBe(true);

    // Cannot move a second time in the same turn
    const followUpLegal = getLegalActions(res.state, 'p1');
    expect(followUpLegal.some((a) => a.type === 'move_ship')).toBe(false);
  });

  it('awards +2 Special Victory Points (Catan Chits) for foreign island settlements and sets scenario VP target', () => {
    // Heading for New Shores defaults to 14 VP to win
    const configShores = createRulesConfig({ boardScenario: 'seafarers_shores' });
    expect(configShores.victoryPointsToWin).toBe(14);

    // The Four Islands defaults to 13 VP to win
    const configIslands = createRulesConfig({ boardScenario: 'seafarers_islands' });
    expect(configIslands.victoryPointsToWin).toBe(13);

    // The Fog Island defaults to 12 VP to win
    const configFog = createRulesConfig({ boardScenario: 'seafarers_fog' });
    expect(configFog.victoryPointsToWin).toBe(12);

    const game = createGame({
      gameId: 'test-island-vp',
      seed: 'seed-isl-vp',
      rules: configShores,
      participants: [
        { id: 'p1', name: 'Alice', type: 'human' },
        { id: 'p2', name: 'Bob', type: 'human' }
      ]
    });

    game.phase = 'main_actions';
    game.turn = 2;
    game.activePlayerId = 'p1';

    // In Heading for New Shores: Island 0 is Main Island
    game.players[0]!.settledIslands = ['island_0'];
    game.players[0]!.resources = { wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 0 };

    // Find a small land hex (r <= -2)
    const smallLandHex = Object.values(game.board.hexes).find((h) =>
      h.terrain !== 'sea' && h.terrain !== 'fog' && (h.r === -3 || h.r === -2)
    )!;

    // Find vertex touching smallLandHex
    const smallVert = Object.values(game.board.vertices).find((v) =>
      v.adjacentHexIds.includes(smallLandHex.id)
    )!;

    // Connect a ship to smallVert
    const adjEdge = smallVert.adjacentEdgeIds[0]!;
    game.board.ships![adjEdge] = { ownerId: 'p1', edgeId: adjEdge, builtAtTurn: 1 };

    const res = applyAction(game, 'p1', { type: 'build_settlement', vertexId: smallVert.id });
    // Received +2 Special VP (Catan Chits) for first settlement on foreign island!
    expect(res.state.players[0]!.specialVictoryPoints).toBe(2);
    expect(res.event.details?.specialVictoryPointsAwarded).toBe(2);
  });

  it('explores unexplored fog hexes when roads or ships connect to them in The Fog Island', () => {
    const game = createGame({
      gameId: 'test-fog-explore',
      seed: 'seed-fog',
      rules: createRulesConfig({ boardScenario: 'seafarers_fog' }),
      participants: [
        { id: 'p1', name: 'Alice', type: 'human' },
        { id: 'p2', name: 'Bob', type: 'human' }
      ]
    });

    expect(game.fogHexesRemaining).toBeDefined();
    expect(game.fogHexesRemaining!.length).toBeGreaterThan(0);

    // Find a fog hex and an adjacent edge
    const fogHex = Object.values(game.board.hexes).find((h) => h.terrain === 'fog')!;
    const adjacentEdge = Object.values(game.board.edges).find((e) =>
      e.adjacentHexIds.includes(fogHex.id)
    )!;

    // Connect player network by placing settlement at one endpoint of adjacentEdge
    game.board.buildings[adjacentEdge.v1] = { ownerId: 'p1', type: 'settlement', vertexId: adjacentEdge.v1 };

    const initialFogCount = game.fogHexesRemaining!.length;

    game.phase = 'main_actions';
    game.turn = 2;
    game.activePlayerId = 'p1';
    game.players[0]!.resources.wood = 2;
    game.players[0]!.resources.sheep = 2;

    // Building a ship touching the fog hex triggers exploration
    const res = applyAction(game, 'p1', { type: 'build_ship', edgeId: adjacentEdge.id });

    // The fog hex was revealed!
    expect(res.state.board.hexes[fogHex.id]!.terrain).not.toBe('fog');
    expect(res.state.fogHexesRemaining!.length).toBe(initialFogCount - 1);
  });
});
