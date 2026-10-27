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
    expect(nextState.board.ships[waterEdge!]).toBeDefined();
    expect(nextState.board.ships[waterEdge!]!.ownerId).toBe('p1');
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
    game.board.ships[e2] = { ownerId: 'p1', edgeId: e2 };

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
    game.board.ships[seaEdge.id] = { ownerId: 'p2', edgeId: seaEdge.id };
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
});
