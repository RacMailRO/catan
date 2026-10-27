import { generateStandardBoard } from './board';
import {
  BUILDING_COSTS,
  ENGINE_VERSION,
  INITIAL_BANK_RESOURCES,
  INITIAL_PLAYER_PIECES,
  STANDARD_DEV_CARD_DECK,
  createRulesConfig
} from './config';
import {
  computeStateHash,
  hashSeedToUint32,
  nextPrngInt,
  shuffleWithPrng
} from './prng';
import {
  ALL_RESOURCES,
  AIDifficulty,
  AIStrategyStyle,
  ActionValidationResult,
  BoardState,
  DevCardType,
  GameAction,
  GameEvent,
  GameRulesConfig,
  GameState,
  MAX_PLAYERS_BY_SCENARIO,
  ParticipantType,
  PLAYER_COLORS,
  PlayerColor,
  PlayerState,
  PlayerView,
  PublicPlayerInfo,
  ResourceCount,
  ResourceType,
  TERRAIN_TO_RESOURCE
} from './types';

export interface ParticipantConfig {
  id: string;
  name: string;
  type: ParticipantType;
  color?: PlayerColor;
  aiDifficulty?: AIDifficulty;
  aiStyle?: AIStrategyStyle;
}

export interface CreateGameOptions {
  gameId: string;
  seed?: string;
  participants: ParticipantConfig[];
  rules?: Partial<GameRulesConfig>;
  nowMs?: number;
}

export function createEmptyResources(): ResourceCount {
  return {
    wood: 0,
    brick: 0,
    sheep: 0,
    wheat: 0,
    ore: 0
  };
}

export function cloneResources(res: Partial<ResourceCount>): ResourceCount {
  return {
    wood: res.wood ?? 0,
    brick: res.brick ?? 0,
    sheep: res.sheep ?? 0,
    wheat: res.wheat ?? 0,
    ore: res.ore ?? 0
  };
}

export function totalResourceCount(res: Partial<ResourceCount>): number {
  return (
    (res.wood ?? 0) +
    (res.brick ?? 0) +
    (res.sheep ?? 0) +
    (res.wheat ?? 0) +
    (res.ore ?? 0)
  );
}

export function hasResources(
  inventory: ResourceCount,
  cost: Partial<ResourceCount>
): boolean {
  for (const r of ALL_RESOURCES) {
    if ((inventory[r] ?? 0) < (cost[r] ?? 0)) {
      return false;
    }
  }
  return true;
}

export function addResourcesInPlace(
  target: ResourceCount,
  delta: Partial<ResourceCount>
): void {
  for (const r of ALL_RESOURCES) {
    target[r] += delta[r] ?? 0;
  }
}

export function subtractResourcesInPlace(
  target: ResourceCount,
  delta: Partial<ResourceCount>
): void {
  for (const r of ALL_RESOURCES) {
    target[r] -= delta[r] ?? 0;
  }
}

export function createGame(options: CreateGameOptions): GameState {
  const seed = options.seed ?? `seed-${options.gameId}-${Date.now()}`;
  let prngState = hashSeedToUint32(seed);

  const maxPlayers = MAX_PLAYERS_BY_SCENARIO[options.rules?.boardScenario ?? 'classic'];
  if (options.participants.length < 1 || options.participants.length > maxPlayers) {
    throw new Error(`A game requires between 1 and ${maxPlayers} configured participants for this board scenario.`);
  }

  const basePreset =
    options.participants.length < 3 ? ('small_group' as const) : ('standard' as const);
  const rules = createRulesConfig({
    presetId: basePreset,
    ...options.rules
  });

  // Expand participants with passive neutral bots if 1-2 players and autoFillPassiveBotsMinPlayers >= 3
  const finalParticipants: ParticipantConfig[] = [...options.participants];
  const minPlayers = Math.min(maxPlayers, Math.max(1, rules.autoFillPassiveBotsMinPlayers));
  let botIdx = 1;
  while (finalParticipants.length < minPlayers) {
    finalParticipants.push({
      id: `passive-bot-${botIdx}`,
      name: `Neutru ${botIdx}`,
      type: 'passive',
      aiDifficulty: 'beginner',
      aiStyle: 'balanced'
    });
    botIdx++;
  }

  // Assign distinct colors
  const usedColors = new Set<PlayerColor>();
  const players: PlayerState[] = finalParticipants.map((p, idx) => {
    let color = p.color;
    if (!color || usedColors.has(color)) {
      color = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
    }
    usedColors.add(color);

    return {
      id: p.id,
      name: p.name,
      color,
      type: p.type,
      aiDifficulty: p.aiDifficulty ?? (p.type === 'ai' || p.type === 'llm' ? 'medium' : undefined),
      aiStyle: p.aiStyle ?? (p.type === 'ai' || p.type === 'llm' ? 'balanced' : undefined),
      connected: true,
      resources: createEmptyResources(),
      devCards: [],
      playedDevCardTypesThisTurn: [],
      hasPlayedDevCardThisTurn: false,
      knightsPlayed: 0,
      longestRoadLength: 0,
      remainingPieces: { ...INITIAL_PLAYER_PIECES }
    };
  });

  const boardGen = generateStandardBoard(prngState, rules.boardLayout, rules.boardScenario);
  prngState = boardGen.nextPrngState;

  const deckShuf = shuffleWithPrng(STANDARD_DEV_CARD_DECK, prngState);
  prngState = deckShuf.nextState;

  // Each player opens with a 2d6 roll; highest total starts, matching the physical game's
  // "roll to see who goes first" step. Exact ties are broken by a further random draw rather
  // than an actual re-roll loop, which is equivalent in fairness but simpler and bounded.
  const startingOrderRolls = players.map((p) => {
    const d1 = nextPrngInt(prngState, 1, 6);
    prngState = d1.nextState;
    const d2 = nextPrngInt(prngState, 1, 6);
    prngState = d2.nextState;
    const tiebreak = nextPrngInt(prngState, 0, 999_999);
    prngState = tiebreak.nextState;
    return { playerId: p.id, die1: d1.value, die2: d2.value, total: d1.value + d2.value, tiebreak: tiebreak.value };
  });
  startingOrderRolls.sort((a, b) => b.total - a.total || b.tiebreak - a.tiebreak);
  const playerOrder = startingOrderRolls.map((r) => r.playerId);

  return {
    gameId: options.gameId,
    engineVersion: ENGINE_VERSION,
    seed,
    prngState,
    sequence: 0,
    turn: 0,
    rules,
    board: boardGen.board,
    players,
    playerOrder,
    activePlayerId: playerOrder[0]!,
    phase: 'setup_settlement_1',
    setupStepIndex: 0,
    startingOrderRolls: startingOrderRolls.map(({ playerId, die1, die2, total }) => ({
      playerId,
      die1,
      die2,
      total
    })),
    bank: { ...INITIAL_BANK_RESOURCES },
    devCardDeck: deckShuf.items,
    pendingDiscards: {},
    freeRoadsRemaining: 0,
    activeTradeOffers: [],
    longestRoadOwnerId: null,
    largestArmyOwnerId: null,
    winnerId: null,
    startedAtMs: options.nowMs ?? Date.now()
  };
}

export function getPlayerById(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}

/**
 * Checks if a vertex respects the distance rule (no building on it or any adjacent vertex).
 */
export function isVertexAvailableForSettlement(board: BoardState, vertexId: string): boolean {
  const vertex = board.vertices[vertexId];
  if (!vertex) return false;
  if (board.buildings[vertexId]) return false;
  for (const adjV of vertex.adjacentVertexIds) {
    if (board.buildings[adjV]) return false;
  }
  return true;
}

/**
 * Checks if a vertex is connected to at least one road owned by `playerId`.
 */
export function isVertexConnectedToPlayerRoad(
  board: BoardState,
  vertexId: string,
  playerId: string
): boolean {
  const vertex = board.vertices[vertexId];
  if (!vertex) return false;
  return vertex.adjacentEdgeIds.some((eId) => board.roads[eId]?.ownerId === playerId);
}

/**
 * Checks if an edge can be built on by `playerId` during normal play.
 * Must be empty and connected either to a player's building or to a player's road at a vertex
 * not occupied by an opponent's building.
 */
export function isEdgeLegalForPlayerRoad(
  board: BoardState,
  edgeId: string,
  playerId: string
): boolean {
  const edge = board.edges[edgeId];
  if (!edge) return false;
  if (board.roads[edgeId]) return false;

  for (const vId of [edge.v1, edge.v2]) {
    const b = board.buildings[vId];
    if (b) {
      if (b.ownerId === playerId) {
        return true;
      }
      // Opponent building blocks road continuation through this vertex
      continue;
    }
    const vert = board.vertices[vId]!;
    const hasOwnAdjacentRoad = vert.adjacentEdgeIds.some(
      (adjEdgeId) => adjEdgeId !== edgeId && board.roads[adjEdgeId]?.ownerId === playerId
    );
    if (hasOwnAdjacentRoad) {
      return true;
    }
  }
  return false;
}

/**
 * Calculates the best trade ratio (4, 3, or 2) a player has with the bank for a given resource.
 */
export function getPlayerBankTradeRatio(
  board: BoardState,
  playerId: string,
  giveResource: ResourceType
): number {
  let best = 4;
  for (const b of Object.values(board.buildings)) {
    if (b.ownerId !== playerId) continue;
    const vert = board.vertices[b.vertexId];
    if (!vert?.harbor) continue;
    if (vert.harbor === giveResource) {
      return 2;
    }
    if (vert.harbor === 'generic') {
      best = Math.min(best, 3);
    }
  }
  return best;
}

/**
 * Calculates the length of the longest continuous simple path of roads owned by `playerId`,
 * respecting road breaks caused by opponent settlements/cities on intermediate vertices.
 */
export function calculatePlayerLongestRoad(board: BoardState, playerId: string): number {
  const playerEdges = Object.values(board.roads)
    .filter((r) => r.ownerId === playerId)
    .map((r) => board.edges[r.edgeId]!);

  if (playerEdges.length === 0) return 0;

  const playerEdgeSet = new Set(playerEdges.map((e) => e.id));
  let maxLen = 0;

  function dfs(currentVertexId: string, visitedEdges: Set<string>, length: number): void {
    if (length > maxLen) {
      maxLen = length;
    }
    // If currentVertexId has an opponent building and we already traversed at least 1 edge, we cannot pass through it
    if (length > 0) {
      const b = board.buildings[currentVertexId];
      if (b && b.ownerId !== playerId) {
        return;
      }
    }

    const vert = board.vertices[currentVertexId];
    if (!vert) return;

    for (const edgeId of vert.adjacentEdgeIds) {
      if (!playerEdgeSet.has(edgeId) || visitedEdges.has(edgeId)) continue;
      const edge = board.edges[edgeId]!;
      const nextVertexId = edge.v1 === currentVertexId ? edge.v2 : edge.v1;
      visitedEdges.add(edgeId);
      dfs(nextVertexId, visitedEdges, length + 1);
      visitedEdges.delete(edgeId);
    }
  }

  // Start DFS from every vertex endpoint of the player's roads
  const startVertices = new Set<string>();
  for (const e of playerEdges) {
    startVertices.add(e.v1);
    startVertices.add(e.v2);
  }

  for (const vId of startVertices) {
    dfs(vId, new Set<string>(), 0);
  }

  return maxLen;
}

export function updateLongestRoadState(state: GameState): void {
  let maxLen = 0;
  for (const p of state.players) {
    p.longestRoadLength = calculatePlayerLongestRoad(state.board, p.id);
    if (p.longestRoadLength > maxLen) {
      maxLen = p.longestRoadLength;
    }
  }

  if (maxLen < 5) {
    state.longestRoadOwnerId = null;
    return;
  }

  const topPlayers = state.players.filter((p) => p.longestRoadLength === maxLen);
  if (topPlayers.length === 1) {
    state.longestRoadOwnerId = topPlayers[0]!.id;
  } else {
    // Tie for maxLen >= 5: if current owner is among tied, they retain it; otherwise nobody holds it
    if (
      state.longestRoadOwnerId &&
      topPlayers.some((p) => p.id === state.longestRoadOwnerId)
    ) {
      return;
    }
    state.longestRoadOwnerId = null;
  }
}

export function updateLargestArmyState(state: GameState): void {
  let maxKnights = 0;
  for (const p of state.players) {
    if (p.knightsPlayed > maxKnights) {
      maxKnights = p.knightsPlayed;
    }
  }
  if (maxKnights < 3) {
    state.largestArmyOwnerId = null;
    return;
  }
  const currentHolder = state.largestArmyOwnerId
    ? getPlayerById(state, state.largestArmyOwnerId)
    : undefined;
  const currentHolderKnights = currentHolder?.knightsPlayed ?? 0;

  for (const p of state.players) {
    if (p.knightsPlayed >= 3 && p.knightsPlayed > currentHolderKnights) {
      state.largestArmyOwnerId = p.id;
      return;
    }
  }
}

export function calculateScore(
  state: GameState,
  playerId: string
): { publicScore: number; totalScore: number; hiddenVictoryPoints: number } {
  let buildingPoints = 0;
  for (const b of Object.values(state.board.buildings)) {
    if (b.ownerId === playerId) {
      buildingPoints += b.type === 'city' ? 2 : 1;
    }
  }
  const longestRoadPoints = state.longestRoadOwnerId === playerId ? 2 : 0;
  const largestArmyPoints = state.largestArmyOwnerId === playerId ? 2 : 0;
  const player = getPlayerById(state, playerId);
  const hiddenVictoryPoints = player
    ? player.devCards.filter((c) => c.type === 'victory_point').length
    : 0;

  const publicScore = buildingPoints + longestRoadPoints + largestArmyPoints;
  const totalScore = publicScore + hiddenVictoryPoints;

  return { publicScore, totalScore, hiddenVictoryPoints };
}

export function checkVictory(state: GameState, nowMs = Date.now()): string | null {
  if (state.winnerId) return state.winnerId;
  // Victory can only be claimed on the active player's turn
  const activeScore = calculateScore(state, state.activePlayerId);
  if (activeScore.totalScore >= state.rules.victoryPointsToWin) {
    state.winnerId = state.activePlayerId;
    state.phase = 'game_over';
    state.finishedAtMs = nowMs;
    return state.winnerId;
  }
  return null;
}

export function canPlayDevCardType(
  state: GameState,
  player: PlayerState,
  cardType: DevCardType
): boolean {
  if (cardType === 'victory_point') return false;
  if (state.phase !== 'turn_start' && state.phase !== 'main_actions') return false;
  if (state.activePlayerId !== player.id) return false;

  if (state.rules.devCardsPerTurnRule === 'one_total') {
    if (player.hasPlayedDevCardThisTurn) return false;
  } else {
    if (player.playedDevCardTypesThisTurn.includes(cardType)) return false;
  }

  return player.devCards.some(
    (c) => c.type === cardType && !c.played && c.boughtAtTurn < state.turn
  );
}

export function getEligibleRobberTargetsOnHex(
  state: GameState,
  hexId: string,
  actingPlayerId: string
): string[] {
  const targets = new Set<string>();
  for (const v of Object.values(state.board.vertices)) {
    if (!v.adjacentHexIds.includes(hexId)) continue;
    const b = state.board.buildings[v.id];
    if (!b || b.ownerId === actingPlayerId) continue;
    const targetPlayer = getPlayerById(state, b.ownerId);
    if (targetPlayer && totalResourceCount(targetPlayer.resources) > 0) {
      targets.add(b.ownerId);
    }
  }
  return Array.from(targets);
}

/**
 * Returns all legal actions for `playerId` in the current `state`.
 */
export function getLegalActions(state: GameState, playerId: string): GameAction[] {
  if (state.phase === 'game_over') return [];

  const player = getPlayerById(state, playerId);
  if (!player) return [];

  const actions: GameAction[] = [];

  // 1. Discard phase: any player with pendingDiscards[playerId] > 0 can act
  if (state.phase === 'discard_resources') {
    const needed = state.pendingDiscards[playerId] ?? 0;
    if (needed <= 0) return [];
    // Generate valid discard combinations (bounded so it stays fast for AI and UI)
    const combinations = generateDiscardCombinations(player.resources, needed, 25);
    for (const combo of combinations) {
      actions.push({ type: 'discard_cards', resources: combo });
    }
    return actions;
  }

  // 2. Responding to an open trade offer during main_actions when not the active player
  if (state.phase === 'main_actions' && state.activePlayerId !== playerId) {
    for (const offer of state.activeTradeOffers) {
      if (offer.status !== 'open') continue;
      if (offer.toPlayerId && offer.toPlayerId !== playerId) continue;
      if (offer.rejectedByPlayerIds.includes(playerId)) continue;

      actions.push({ type: 'respond_trade', offerId: offer.id, response: 'reject' });
      if (hasResources(player.resources, offer.requesting)) {
        actions.push({ type: 'respond_trade', offerId: offer.id, response: 'accept' });
      }
    }
    return actions;
  }

  // All other phases require `playerId === state.activePlayerId`
  if (state.activePlayerId !== playerId) return [];

  switch (state.phase) {
    case 'setup_settlement_1':
    case 'setup_settlement_2': {
      for (const vId of Object.keys(state.board.vertices)) {
        if (isVertexAvailableForSettlement(state.board, vId)) {
          actions.push({ type: 'place_initial_settlement', vertexId: vId });
        }
      }
      return actions;
    }

    case 'setup_road_1':
    case 'setup_road_2': {
      const lastV = state.lastPlacedSettlementVertexId;
      if (!lastV) return [];
      const vert = state.board.vertices[lastV];
      if (!vert) return [];
      for (const eId of vert.adjacentEdgeIds) {
        if (!state.board.roads[eId]) {
          actions.push({ type: 'place_initial_road', edgeId: eId });
        }
      }
      return actions;
    }

    case 'turn_start': {
      actions.push({ type: 'roll_dice' });
      appendLegalDevCardActions(state, player, actions);
      return actions;
    }

    case 'move_robber': {
      const stealRule =
        state.robberContext?.source === 'knight'
          ? state.rules.knightStealRule
          : state.rules.robber7StealRule;

      for (const hexId of Object.keys(state.board.hexes)) {
        if (hexId === state.board.robberHexId) continue;
        const targets = getEligibleRobberTargetsOnHex(state, hexId, playerId);
        if (stealRule === 'single' && targets.length > 0) {
          for (const tId of targets) {
            actions.push({ type: 'move_robber', hexId, targetPlayerId: tId });
          }
        } else {
          actions.push({ type: 'move_robber', hexId });
        }
      }
      return actions;
    }

    case 'steal_resource': {
      const targets = state.robberContext?.eligibleTargetIds ?? [];
      for (const tId of targets) {
        actions.push({ type: 'steal_from_player', targetPlayerId: tId });
      }
      return actions;
    }

    case 'road_building_card': {
      for (const eId of Object.keys(state.board.edges)) {
        if (isEdgeLegalForPlayerRoad(state.board, eId, playerId)) {
          actions.push({ type: 'place_free_road', edgeId: eId });
        }
      }
      return actions;
    }

    case 'main_actions': {
      // Build road
      if (
        player.remainingPieces.roads > 0 &&
        hasResources(player.resources, BUILDING_COSTS.road)
      ) {
        for (const eId of Object.keys(state.board.edges)) {
          if (isEdgeLegalForPlayerRoad(state.board, eId, playerId)) {
            actions.push({ type: 'build_road', edgeId: eId });
          }
        }
      }

      // Build settlement
      if (
        player.remainingPieces.settlements > 0 &&
        hasResources(player.resources, BUILDING_COSTS.settlement)
      ) {
        for (const vId of Object.keys(state.board.vertices)) {
          if (
            isVertexAvailableForSettlement(state.board, vId) &&
            isVertexConnectedToPlayerRoad(state.board, vId, playerId)
          ) {
            actions.push({ type: 'build_settlement', vertexId: vId });
          }
        }
      }

      // Build city
      if (
        player.remainingPieces.cities > 0 &&
        hasResources(player.resources, BUILDING_COSTS.city)
      ) {
        for (const b of Object.values(state.board.buildings)) {
          if (b.ownerId === playerId && b.type === 'settlement') {
            actions.push({ type: 'build_city', vertexId: b.vertexId });
          }
        }
      }

      // Buy development card
      if (
        state.devCardDeck.length > 0 &&
        hasResources(player.resources, BUILDING_COSTS.dev_card)
      ) {
        actions.push({ type: 'buy_dev_card' });
      }

      // Bank & Harbor trades
      for (const give of ALL_RESOURCES) {
        const ratio = getPlayerBankTradeRatio(state.board, playerId, give);
        if (player.resources[give] >= ratio) {
          for (const receive of ALL_RESOURCES) {
            if (receive === give) continue;
            if (state.bank[receive] >= 1) {
              actions.push({
                type: 'trade_bank',
                give,
                giveAmount: ratio,
                receive
              });
            }
          }
        }
      }

      // Player-to-player trade proposals (allowed during main_actions if no trade is currently open and at most 2 proposals initiated this turn)
      const offersFromMe = state.activeTradeOffers.filter((o) => o.fromPlayerId === playerId);
      if (state.activeTradeOffers.every((o) => o.status !== 'open') && offersFromMe.length < 2) {
        for (const give of ALL_RESOURCES) {
          if (player.resources[give] >= 1) {
            for (const receive of ALL_RESOURCES) {
              if (receive === give) continue;
              actions.push({
                type: 'propose_trade',
                offering: { ...createEmptyResources(), [give]: 1 },
                requesting: { ...createEmptyResources(), [receive]: 1 }
              });
            }
          }
        }
      }

      // Cancel open trades
      for (const offer of state.activeTradeOffers) {
        if ((offer.status === 'open' || offer.status === 'rejected') && offer.fromPlayerId === playerId) {
          actions.push({ type: 'cancel_trade', offerId: offer.id });
        }
      }

      // Play Dev Cards
      appendLegalDevCardActions(state, player, actions);

      // End Turn
      actions.push({ type: 'end_turn' });
      return actions;
    }

    default:
      return actions;
  }
}

function appendLegalDevCardActions(
  state: GameState,
  player: PlayerState,
  actions: GameAction[]
): void {
  if (canPlayDevCardType(state, player, 'knight')) {
    const stealRule = state.rules.knightStealRule;
    for (const hexId of Object.keys(state.board.hexes)) {
      if (hexId === state.board.robberHexId) continue;
      const targets = getEligibleRobberTargetsOnHex(state, hexId, player.id);
      if (stealRule === 'single' && targets.length > 0) {
        for (const tId of targets) {
          actions.push({ type: 'play_knight', hexId, targetPlayerId: tId });
        }
      } else {
        actions.push({ type: 'play_knight', hexId });
      }
    }
  }

  if (canPlayDevCardType(state, player, 'road_building')) {
    const hasLegalRoadSpot = Object.keys(state.board.edges).some((eId) =>
      isEdgeLegalForPlayerRoad(state.board, eId, player.id)
    );
    if (player.remainingPieces.roads > 0 && hasLegalRoadSpot) {
      actions.push({ type: 'play_road_building' });
    }
  }

  if (canPlayDevCardType(state, player, 'year_of_plenty')) {
    for (let i = 0; i < ALL_RESOURCES.length; i++) {
      for (let j = i; j < ALL_RESOURCES.length; j++) {
        const r1 = ALL_RESOURCES[i]!;
        const r2 = ALL_RESOURCES[j]!;
        const needed1 = r1 === r2 ? 2 : 1;
        if (state.bank[r1] >= needed1 && state.bank[r2] >= 1) {
          actions.push({ type: 'play_year_of_plenty', resources: [r1, r2] });
        }
      }
    }
  }

  if (canPlayDevCardType(state, player, 'monopoly')) {
    for (const r of ALL_RESOURCES) {
      actions.push({ type: 'play_monopoly', resource: r });
    }
  }
}

function generateDiscardCombinations(
  inventory: ResourceCount,
  needed: number,
  maxResults: number
): ResourceCount[] {
  const results: ResourceCount[] = [];
  const current = createEmptyResources();

  function backtrack(resIdx: number, remaining: number): void {
    if (results.length >= maxResults) return;
    if (resIdx === ALL_RESOURCES.length - 1) {
      const r = ALL_RESOURCES[resIdx]!;
      if (remaining <= inventory[r]) {
        current[r] = remaining;
        results.push({ ...current });
      }
      return;
    }

    const r = ALL_RESOURCES[resIdx]!;
    const maxForThis = Math.min(inventory[r], remaining);
    for (let k = maxForThis; k >= 0; k--) {
      current[r] = k;
      backtrack(resIdx + 1, remaining - k);
      if (results.length >= maxResults) return;
    }
  }

  backtrack(0, needed);
  return results;
}

/**
 * Validates whether `action` by `playerId` is legal in `state`.
 */
export function validateAction(
  state: GameState,
  playerId: string,
  action: GameAction
): ActionValidationResult {
  if (state.phase === 'game_over') {
    return { valid: false, code: 'GAME_OVER', reason: 'Partida s-a încheiat deja.' };
  }

  const player = getPlayerById(state, playerId);
  if (!player) {
    return { valid: false, code: 'UNKNOWN_PLAYER', reason: 'Jucător inexistent.' };
  }

  // Handle actions allowed out-of-turn first
  if (action.type === 'discard_cards') {
    if (state.phase !== 'discard_resources') {
      return {
        valid: false,
        code: 'WRONG_PHASE',
        reason: 'Nu este faza de decartare a cărților.'
      };
    }
    const needed = state.pendingDiscards[playerId] ?? 0;
    if (needed <= 0) {
      return {
        valid: false,
        code: 'NO_DISCARD_REQUIRED',
        reason: 'Acest jucător nu trebuie să decarteze cărți.'
      };
    }
    const count = totalResourceCount(action.resources);
    if (count !== needed) {
      return {
        valid: false,
        code: 'INVALID_DISCARD_COUNT',
        reason: `Trebuie decartate exact ${needed} cărți.`
      };
    }
    for (const r of ALL_RESOURCES) {
      if ((action.resources[r] ?? 0) < 0) {
        return { valid: false, code: 'NEGATIVE_AMOUNT', reason: 'Cantitate negativă.' };
      }
    }
    if (!hasResources(player.resources, action.resources)) {
      return {
        valid: false,
        code: 'INSUFFICIENT_RESOURCES',
        reason: 'Jucătorul nu deține resursele selectate pentru decartare.'
      };
    }
    return { valid: true };
  }

  if (action.type === 'respond_trade') {
    if (state.phase !== 'main_actions') {
      return { valid: false, code: 'WRONG_PHASE', reason: 'Comerțul este permis doar în faza principală.' };
    }
    const offer = state.activeTradeOffers.find((o) => o.id === action.offerId);
    if (!offer || offer.status !== 'open') {
      return { valid: false, code: 'OFFER_NOT_OPEN', reason: 'Oferta de schimb nu mai este activă.' };
    }
    if (offer.fromPlayerId === playerId) {
      return { valid: false, code: 'SELF_TRADE', reason: 'Nu poți răspunde propriei oferte.' };
    }
    if (offer.toPlayerId && offer.toPlayerId !== playerId) {
      return { valid: false, code: 'NOT_TARGET_PLAYER', reason: 'Oferta este adresată altui jucător.' };
    }
    if (action.response === 'accept') {
      const proposer = getPlayerById(state, offer.fromPlayerId);
      if (!proposer || !hasResources(proposer.resources, offer.offering)) {
        return {
          valid: false,
          code: 'PROPOSER_LACKS_RESOURCES',
          reason: 'Inițiatorul ofertei nu mai are resursele promise.'
        };
      }
      if (!hasResources(player.resources, offer.requesting)) {
        return {
          valid: false,
          code: 'INSUFFICIENT_RESOURCES',
          reason: 'Nu ai resursele solicitate în ofertă.'
        };
      }
    }
    return { valid: true };
  }

  // All remaining actions require active player
  if (state.activePlayerId !== playerId) {
    return {
      valid: false,
      code: 'NOT_YOUR_TURN',
      reason: 'Nu este rândul acestui jucător.'
    };
  }

  switch (action.type) {
    case 'place_initial_settlement': {
      if (state.phase !== 'setup_settlement_1' && state.phase !== 'setup_settlement_2') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Nu este faza de plasare a așezării inițiale.' };
      }
      if (!isVertexAvailableForSettlement(state.board, action.vertexId)) {
        return {
          valid: false,
          code: 'INVALID_VERTEX',
          reason: 'Intersecția este ocupată sau încalcă regula distanței.'
        };
      }
      return { valid: true };
    }

    case 'place_initial_road': {
      if (state.phase !== 'setup_road_1' && state.phase !== 'setup_road_2') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Nu este faza de plasare a drumului inițial.' };
      }
      const lastV = state.lastPlacedSettlementVertexId;
      if (!lastV) {
        return { valid: false, code: 'NO_SETTLEMENT', reason: 'Așezarea inițială nu a fost plasată.' };
      }
      const vert = state.board.vertices[lastV];
      if (!vert || !vert.adjacentEdgeIds.includes(action.edgeId) || state.board.roads[action.edgeId]) {
        return {
          valid: false,
          code: 'INVALID_INITIAL_ROAD',
          reason: 'Drumul inițial trebuie să fie conectat la așezarea tocmai plasată.'
        };
      }
      return { valid: true };
    }

    case 'roll_dice': {
      if (state.phase !== 'turn_start') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Zarurile au fost deja aruncate în această tură.' };
      }
      return { valid: true };
    }

    case 'move_robber': {
      if (state.phase !== 'move_robber') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Nu este faza de mutare a hoțului.' };
      }
      if (!state.board.hexes[action.hexId]) {
        return { valid: false, code: 'INVALID_HEX', reason: 'Hexagon invalid.' };
      }
      if (action.hexId === state.board.robberHexId) {
        return {
          valid: false,
          code: 'SAME_ROBBER_HEX',
          reason: 'Hoțul trebuie mutat pe un alt hexagon.'
        };
      }
      const targets = getEligibleRobberTargetsOnHex(state, action.hexId, playerId);
      if (action.targetPlayerId && !targets.includes(action.targetPlayerId)) {
        return {
          valid: false,
          code: 'INVALID_STEAL_TARGET',
          reason: 'Jucătorul țintă nu are construcții adiacente sau nu are resurse.'
        };
      }
      return { valid: true };
    }

    case 'steal_from_player': {
      if (state.phase !== 'steal_resource') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Nu este faza de furt.' };
      }
      const eligible = state.robberContext?.eligibleTargetIds ?? [];
      if (!eligible.includes(action.targetPlayerId)) {
        return {
          valid: false,
          code: 'INVALID_STEAL_TARGET',
          reason: 'Țintă invalidă pentru furt.'
        };
      }
      return { valid: true };
    }

    case 'build_road': {
      if (state.phase !== 'main_actions') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Construcțiile sunt permise doar în faza principală.' };
      }
      if (player.remainingPieces.roads <= 0) {
        return { valid: false, code: 'NO_PIECES_LEFT', reason: 'Nu mai ai piese de drum disponibile (maxim 15).' };
      }
      if (!hasResources(player.resources, BUILDING_COSTS.road)) {
        return { valid: false, code: 'INSUFFICIENT_RESOURCES', reason: 'Resurse insuficiente pentru drum (1 lemn + 1 cărămidă).' };
      }
      if (!isEdgeLegalForPlayerRoad(state.board, action.edgeId, playerId)) {
        return { valid: false, code: 'ILLEGAL_ROAD_EDGE', reason: 'Drumul trebuie conectat la rețeaua proprie și să nu fie blocat.' };
      }
      return { valid: true };
    }

    case 'build_settlement': {
      if (state.phase !== 'main_actions') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Construcțiile sunt permise doar în faza principală.' };
      }
      if (player.remainingPieces.settlements <= 0) {
        return { valid: false, code: 'NO_PIECES_LEFT', reason: 'Nu mai ai piese de așezare disponibile (maxim 5).' };
      }
      if (!hasResources(player.resources, BUILDING_COSTS.settlement)) {
        return { valid: false, code: 'INSUFFICIENT_RESOURCES', reason: 'Resurse insuficiente pentru așezare.' };
      }
      if (!isVertexAvailableForSettlement(state.board, action.vertexId)) {
        return { valid: false, code: 'DISTANCE_RULE_VIOLATION', reason: 'Intersecția este ocupată sau încalcă regula distanței.' };
      }
      if (!isVertexConnectedToPlayerRoad(state.board, action.vertexId, playerId)) {
        return { valid: false, code: 'NOT_CONNECTED_TO_ROAD', reason: 'Așezarea trebuie conectată la cel puțin un drum propriu.' };
      }
      return { valid: true };
    }

    case 'build_city': {
      if (state.phase !== 'main_actions') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Construcțiile sunt permise doar în faza principală.' };
      }
      if (player.remainingPieces.cities <= 0) {
        return { valid: false, code: 'NO_PIECES_LEFT', reason: 'Nu mai ai piese de oraș disponibile (maxim 4).' };
      }
      if (!hasResources(player.resources, BUILDING_COSTS.city)) {
        return { valid: false, code: 'INSUFFICIENT_RESOURCES', reason: 'Resurse insuficiente pentru oraș (3 minereu + 2 grâu).' };
      }
      const existing = state.board.buildings[action.vertexId];
      if (!existing || existing.ownerId !== playerId || existing.type !== 'settlement') {
        return { valid: false, code: 'NO_OWN_SETTLEMENT', reason: 'Orașul trebuie să înlocuiască o așezare proprie existentă.' };
      }
      return { valid: true };
    }

    case 'buy_dev_card': {
      if (state.phase !== 'main_actions') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Cărțile de dezvoltare se cumpără în faza principală.' };
      }
      if (state.devCardDeck.length === 0) {
        return { valid: false, code: 'EMPTY_DEV_DECK', reason: 'Nu mai există cărți de dezvoltare în pachet.' };
      }
      if (!hasResources(player.resources, BUILDING_COSTS.dev_card)) {
        return { valid: false, code: 'INSUFFICIENT_RESOURCES', reason: 'Resurse insuficiente (1 lână + 1 grâu + 1 minereu).' };
      }
      return { valid: true };
    }

    case 'play_knight': {
      if (!canPlayDevCardType(state, player, 'knight')) {
        return {
          valid: false,
          code: 'CANNOT_PLAY_DEV_CARD',
          reason: 'Nu poți juca o carte Cavaler în acest moment.'
        };
      }
      if (!state.board.hexes[action.hexId] || action.hexId === state.board.robberHexId) {
        return {
          valid: false,
          code: 'INVALID_ROBBER_HEX',
          reason: 'Hoțul trebuie mutat pe un alt hexagon.'
        };
      }
      const targets = getEligibleRobberTargetsOnHex(state, action.hexId, playerId);
      if (action.targetPlayerId && !targets.includes(action.targetPlayerId)) {
        return {
          valid: false,
          code: 'INVALID_STEAL_TARGET',
          reason: 'Jucătorul țintă nu este eligibil pentru furt.'
        };
      }
      return { valid: true };
    }

    case 'play_road_building': {
      if (!canPlayDevCardType(state, player, 'road_building')) {
        return {
          valid: false,
          code: 'CANNOT_PLAY_DEV_CARD',
          reason: 'Nu poți juca cartea Construcție de Drumuri în acest moment.'
        };
      }
      if (player.remainingPieces.roads <= 0) {
        return { valid: false, code: 'NO_ROADS_LEFT', reason: 'Nu mai ai piese de drum disponibile.' };
      }
      const hasSpot = Object.keys(state.board.edges).some((eId) =>
        isEdgeLegalForPlayerRoad(state.board, eId, playerId)
      );
      if (!hasSpot) {
        return { valid: false, code: 'NO_LEGAL_ROAD_SPOT', reason: 'Nu există poziții legale pentru plasarea unui drum.' };
      }
      return { valid: true };
    }

    case 'place_free_road': {
      if (state.phase !== 'road_building_card' || state.freeRoadsRemaining <= 0) {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Nu ai drumuri gratuite de plasat.' };
      }
      if (!isEdgeLegalForPlayerRoad(state.board, action.edgeId, playerId)) {
        return { valid: false, code: 'ILLEGAL_ROAD_EDGE', reason: 'Poziție ilegală pentru drum.' };
      }
      return { valid: true };
    }

    case 'play_year_of_plenty': {
      if (!canPlayDevCardType(state, player, 'year_of_plenty')) {
        return {
          valid: false,
          code: 'CANNOT_PLAY_DEV_CARD',
          reason: 'Nu poți juca cartea Anul Abundenței în acest moment.'
        };
      }
      const [r1, r2] = action.resources;
      if (r1 === r2) {
        if (state.bank[r1] < 2) {
          return { valid: false, code: 'BANK_INSUFFICIENT', reason: 'Banca nu are 2 cărți din această resursă.' };
        }
      } else {
        if (state.bank[r1] < 1 || state.bank[r2] < 1) {
          return { valid: false, code: 'BANK_INSUFFICIENT', reason: 'Banca nu are suficiente resurse.' };
        }
      }
      return { valid: true };
    }

    case 'play_monopoly': {
      if (!canPlayDevCardType(state, player, 'monopoly')) {
        return {
          valid: false,
          code: 'CANNOT_PLAY_DEV_CARD',
          reason: 'Nu poți juca cartea Monopol în acest moment.'
        };
      }
      if (!ALL_RESOURCES.includes(action.resource)) {
        return { valid: false, code: 'INVALID_RESOURCE', reason: 'Resursă invalidă.' };
      }
      return { valid: true };
    }

    case 'trade_bank': {
      if (state.phase !== 'main_actions') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Schimbul cu banca este permis doar în faza principală.' };
      }
      if (action.give === action.receive) {
        return { valid: false, code: 'SAME_RESOURCE', reason: 'Nu poți schimba o resursă pe aceeași resursă.' };
      }
      const ratio = getPlayerBankTradeRatio(state.board, playerId, action.give);
      if (action.giveAmount < ratio || action.giveAmount % ratio !== 0) {
        return {
          valid: false,
          code: 'INVALID_TRADE_RATIO',
          reason: `Raportul de schimb disponibil pentru ${action.give} este ${ratio}:1.`
        };
      }
      const receiveAmount = action.giveAmount / ratio;
      if (player.resources[action.give] < action.giveAmount) {
        return { valid: false, code: 'INSUFFICIENT_RESOURCES', reason: 'Nu ai suficiente resurse pentru schimb.' };
      }
      if (state.bank[action.receive] < receiveAmount) {
        return { valid: false, code: 'BANK_INSUFFICIENT', reason: 'Banca nu are suficiente resurse.' };
      }
      return { valid: true };
    }

    case 'propose_trade': {
      if (state.phase !== 'main_actions') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Ofertele de schimb sunt permise doar în faza principală.' };
      }
      const offerTotal = totalResourceCount(action.offering);
      const reqTotal = totalResourceCount(action.requesting);
      if (offerTotal <= 0 || reqTotal <= 0) {
        return { valid: false, code: 'EMPTY_TRADE', reason: 'Oferta trebuie să conțină resurse oferite și solicitate.' };
      }
      for (const r of ALL_RESOURCES) {
        if ((action.offering[r] ?? 0) < 0 || (action.requesting[r] ?? 0) < 0) {
          return { valid: false, code: 'NEGATIVE_AMOUNT', reason: 'Cantitățile nu pot fi negative.' };
        }
        if ((action.offering[r] ?? 0) > 0 && (action.requesting[r] ?? 0) > 0) {
          return {
            valid: false,
            code: 'OVERLAPPING_TRADE_RESOURCE',
            reason: 'Nu poți oferi și cere aceeași resursă în același schimb.'
          };
        }
      }
      if (!hasResources(player.resources, action.offering)) {
        return { valid: false, code: 'INSUFFICIENT_RESOURCES', reason: 'Nu deții resursele pe care vrei să le oferi.' };
      }
      return { valid: true };
    }

    case 'cancel_trade': {
      const offer = state.activeTradeOffers.find((o) => o.id === action.offerId);
      if (
        !offer ||
        (offer.status !== 'open' && offer.status !== 'rejected') ||
        offer.fromPlayerId !== playerId
      ) {
        return { valid: false, code: 'INVALID_OFFER', reason: 'Oferta nu poate fi anulată.' };
      }
      return { valid: true };
    }

    case 'end_turn': {
      if (state.phase !== 'main_actions') {
        return { valid: false, code: 'WRONG_PHASE', reason: 'Tura poate fi încheiată doar din faza principală.' };
      }
      return { valid: true };
    }
  }
}

/**
 * Applies a validated action to a deep clone of `state`, returning the new state and the recorded GameEvent.
 */
export function applyAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  options?: { nowMs?: number; aiDecisionId?: string }
): { state: GameState; event: GameEvent } {
  const nowMs = options?.nowMs ?? Date.now();
  const nextState: GameState = structuredClone(state);

  // Expire any timed-out trade offers before validating/applying
  expireStaleTradesInPlace(nextState, nowMs);

  const validation = validateAction(nextState, playerId, action);
  if (!validation.valid) {
    throw new Error(`Invalid action (${validation.code}): ${validation.reason}`);
  }

  const phaseBefore = nextState.phase;
  const player = getPlayerById(nextState, playerId)!;
  const details: Record<string, unknown> = {};

  switch (action.type) {
    case 'place_initial_settlement': {
      nextState.board.buildings[action.vertexId] = {
        ownerId: playerId,
        type: 'settlement',
        vertexId: action.vertexId
      };
      player.remainingPieces.settlements -= 1;
      nextState.lastPlacedSettlementVertexId = action.vertexId;

      const isSecondSettlement = nextState.phase === 'setup_settlement_2';
      const shouldGrantResources =
        isSecondSettlement || nextState.rules.startingResourcesRule === 'both_settlements';

      if (shouldGrantResources) {
        const granted = createEmptyResources();
        const vert = nextState.board.vertices[action.vertexId]!;
        for (const hId of vert.adjacentHexIds) {
          const hex = nextState.board.hexes[hId]!;
          const res = TERRAIN_TO_RESOURCE[hex.terrain];
          if (res && nextState.bank[res] > 0) {
            nextState.bank[res] -= 1;
            player.resources[res] += 1;
            granted[res] += 1;
          }
        }
        details.startingResources = granted;
      }

      nextState.phase = isSecondSettlement ? 'setup_road_2' : 'setup_road_1';
      updateLongestRoadState(nextState);
      break;
    }

    case 'place_initial_road': {
      nextState.board.roads[action.edgeId] = {
        ownerId: playerId,
        edgeId: action.edgeId
      };
      player.remainingPieces.roads -= 1;
      nextState.lastPlacedSettlementVertexId = undefined;
      updateLongestRoadState(nextState);

      const numPlayers = nextState.playerOrder.length;
      nextState.setupStepIndex += 1;

      if (nextState.setupStepIndex < numPlayers) {
        // First round of snake draft: 0 .. numPlayers - 1
        nextState.activePlayerId = nextState.playerOrder[nextState.setupStepIndex]!;
        nextState.phase = 'setup_settlement_1';
      } else if (nextState.setupStepIndex < numPlayers * 2) {
        // Second round of snake draft: reverse order
        const reverseIdx = numPlayers * 2 - 1 - nextState.setupStepIndex;
        nextState.activePlayerId = nextState.playerOrder[reverseIdx]!;
        nextState.phase = 'setup_settlement_2';
      } else {
        // Setup complete -> start Turn 1
        nextState.turn = 1;
        nextState.activePlayerId = nextState.playerOrder[0]!;
        nextState.phase = 'turn_start';
      }
      break;
    }

    case 'roll_dice': {
      const r1 = nextPrngInt(nextState.prngState, 1, 6);
      const r2 = nextPrngInt(r1.nextState, 1, 6);
      nextState.prngState = r2.nextState;

      const die1 = r1.value;
      const die2 = r2.value;
      const total = die1 + die2;
      nextState.lastDiceRoll = { die1, die2, total };
      details.dice = { die1, die2, total };

      if (total === 7) {
        const pending: Record<string, number> = {};
        for (const p of nextState.players) {
          const count = totalResourceCount(p.resources);
          if (count > 7) {
            pending[p.id] = Math.floor(count / 2);
          }
        }
        nextState.pendingDiscards = pending;
        nextState.robberContext = {
          source: 'dice_7',
          returnPhase: 'main_actions',
          eligibleTargetIds: []
        };
        if (Object.keys(pending).length > 0) {
          nextState.phase = 'discard_resources';
        } else {
          nextState.phase = 'move_robber';
        }
      } else {
        const production = distributeResourcesForRoll(nextState, total);
        details.production = production;
        nextState.phase = 'main_actions';
      }
      break;
    }

    case 'discard_cards': {
      subtractResourcesInPlace(player.resources, action.resources);
      addResourcesInPlace(nextState.bank, action.resources);
      delete nextState.pendingDiscards[playerId];
      details.discarded = cloneResources(action.resources);

      if (Object.keys(nextState.pendingDiscards).length === 0) {
        nextState.phase = 'move_robber';
      }
      break;
    }

    case 'move_robber': {
      const prevHex = nextState.board.robberHexId;
      nextState.board.robberHexId = action.hexId;
      details.fromHexId = prevHex;
      details.toHexId = action.hexId;

      const source = nextState.robberContext?.source ?? 'dice_7';
      const returnPhase = nextState.robberContext?.returnPhase ?? 'main_actions';
      const stealRule =
        source === 'knight'
          ? nextState.rules.knightStealRule
          : nextState.rules.robber7StealRule;

      resolveRobberStealAfterMove(
        nextState,
        playerId,
        action.hexId,
        stealRule,
        returnPhase,
        action.targetPlayerId,
        details
      );
      break;
    }

    case 'steal_from_player': {
      const stolen = stealOneRandomResource(nextState, playerId, action.targetPlayerId);
      details.stolenFrom = action.targetPlayerId;
      details.stolenResource = stolen;
      const returnPhase = nextState.robberContext?.returnPhase ?? 'main_actions';
      nextState.robberContext = undefined;
      nextState.phase = returnPhase;
      break;
    }

    case 'build_road': {
      subtractResourcesInPlace(player.resources, BUILDING_COSTS.road);
      addResourcesInPlace(nextState.bank, BUILDING_COSTS.road);
      nextState.board.roads[action.edgeId] = {
        ownerId: playerId,
        edgeId: action.edgeId
      };
      player.remainingPieces.roads -= 1;
      updateLongestRoadState(nextState);
      checkVictory(nextState, nowMs);
      break;
    }

    case 'build_settlement': {
      subtractResourcesInPlace(player.resources, BUILDING_COSTS.settlement);
      addResourcesInPlace(nextState.bank, BUILDING_COSTS.settlement);
      nextState.board.buildings[action.vertexId] = {
        ownerId: playerId,
        type: 'settlement',
        vertexId: action.vertexId
      };
      player.remainingPieces.settlements -= 1;
      // Building a settlement can also break an opponent's longest road!
      updateLongestRoadState(nextState);
      checkVictory(nextState, nowMs);
      break;
    }

    case 'build_city': {
      subtractResourcesInPlace(player.resources, BUILDING_COSTS.city);
      addResourcesInPlace(nextState.bank, BUILDING_COSTS.city);
      nextState.board.buildings[action.vertexId] = {
        ownerId: playerId,
        type: 'city',
        vertexId: action.vertexId
      };
      player.remainingPieces.cities -= 1;
      player.remainingPieces.settlements += 1; // settlement returns to player supply
      checkVictory(nextState, nowMs);
      break;
    }

    case 'buy_dev_card': {
      subtractResourcesInPlace(player.resources, BUILDING_COSTS.dev_card);
      addResourcesInPlace(nextState.bank, BUILDING_COSTS.dev_card);
      const drawnType = nextState.devCardDeck.shift()!;
      const cardId = `DC_${nextState.sequence + 1}`;
      player.devCards.push({
        id: cardId,
        type: drawnType,
        boughtAtTurn: nextState.turn,
        played: false
      });
      details.cardId = cardId;
      details.drawnType = drawnType;
      checkVictory(nextState, nowMs);
      break;
    }

    case 'play_knight': {
      markDevCardPlayed(player, 'knight', nextState.turn);
      player.knightsPlayed += 1;
      updateLargestArmyState(nextState);

      const prevHex = nextState.board.robberHexId;
      nextState.board.robberHexId = action.hexId;
      details.fromHexId = prevHex;
      details.toHexId = action.hexId;

      const returnPhase = phaseBefore === 'turn_start' ? 'turn_start' : 'main_actions';
      nextState.robberContext = {
        source: 'knight',
        returnPhase,
        eligibleTargetIds: []
      };

      resolveRobberStealAfterMove(
        nextState,
        playerId,
        action.hexId,
        nextState.rules.knightStealRule,
        returnPhase,
        action.targetPlayerId,
        details
      );
      checkVictory(nextState, nowMs);
      break;
    }

    case 'play_road_building': {
      markDevCardPlayed(player, 'road_building', nextState.turn);
      const maxFree = Math.min(2, player.remainingPieces.roads);
      nextState.freeRoadsRemaining = maxFree;
      nextState.phase = 'road_building_card';
      break;
    }

    case 'place_free_road': {
      nextState.board.roads[action.edgeId] = {
        ownerId: playerId,
        edgeId: action.edgeId
      };
      player.remainingPieces.roads -= 1;
      nextState.freeRoadsRemaining -= 1;
      updateLongestRoadState(nextState);

      const canPlaceAnother =
        nextState.freeRoadsRemaining > 0 &&
        player.remainingPieces.roads > 0 &&
        Object.keys(nextState.board.edges).some((eId) =>
          isEdgeLegalForPlayerRoad(nextState.board, eId, playerId)
        );

      if (!canPlaceAnother) {
        nextState.freeRoadsRemaining = 0;
        nextState.phase = nextState.lastDiceRoll ? 'main_actions' : 'turn_start';
      }
      checkVictory(nextState, nowMs);
      break;
    }

    case 'play_year_of_plenty': {
      markDevCardPlayed(player, 'year_of_plenty', nextState.turn);
      const [r1, r2] = action.resources;
      nextState.bank[r1] -= 1;
      player.resources[r1] += 1;
      nextState.bank[r2] -= 1;
      player.resources[r2] += 1;
      details.received = [r1, r2];
      checkVictory(nextState, nowMs);
      break;
    }

    case 'play_monopoly': {
      markDevCardPlayed(player, 'monopoly', nextState.turn);
      const res = action.resource;
      let totalTaken = 0;
      const takenByPlayer: Record<string, number> = {};
      for (const other of nextState.players) {
        if (other.id === playerId) continue;
        const amt = other.resources[res] ?? 0;
        if (amt > 0) {
          other.resources[res] = 0;
          player.resources[res] = (player.resources[res] ?? 0) + amt;
          totalTaken += amt;
          takenByPlayer[other.id] = amt;
        }
      }
      details.resource = res;
      details.totalTaken = totalTaken;
      details.takenByPlayer = takenByPlayer;
      checkVictory(nextState, nowMs);
      break;
    }

    case 'trade_bank': {
      const ratio = getPlayerBankTradeRatio(nextState.board, playerId, action.give);
      const receiveAmount = action.giveAmount / ratio;
      player.resources[action.give] -= action.giveAmount;
      nextState.bank[action.give] += action.giveAmount;
      nextState.bank[action.receive] -= receiveAmount;
      player.resources[action.receive] += receiveAmount;
      details.ratio = ratio;
      details.give = action.give;
      details.giveAmount = action.giveAmount;
      details.receive = action.receive;
      details.receiveAmount = receiveAmount;
      break;
    }

    case 'propose_trade': {
      const offerId = `TR_${nextState.sequence + 1}`;
      const timeoutMs = (nextState.rules.tradeOfferTimeoutSec || 30) * 1000;
      const offer = {
        id: offerId,
        fromPlayerId: playerId,
        toPlayerId: action.toPlayerId,
        offering: cloneResources(action.offering),
        requesting: cloneResources(action.requesting),
        createdAtMs: nowMs,
        expiresAtMs: nowMs + timeoutMs,
        rejectedByPlayerIds: [],
        status: 'open' as const
      };
      nextState.activeTradeOffers.push(offer);
      details.offer = offer;
      break;
    }

    case 'respond_trade': {
      const offer = nextState.activeTradeOffers.find((o) => o.id === action.offerId)!;
      if (action.response === 'accept') {
        const proposer = getPlayerById(nextState, offer.fromPlayerId)!;
        subtractResourcesInPlace(proposer.resources, offer.offering);
        addResourcesInPlace(player.resources, offer.offering);
        subtractResourcesInPlace(player.resources, offer.requesting);
        addResourcesInPlace(proposer.resources, offer.requesting);
        offer.status = 'accepted';
        details.acceptedBy = playerId;
      } else {
        if (!offer.rejectedByPlayerIds.includes(playerId)) {
          offer.rejectedByPlayerIds.push(playerId);
        }
        if (action.reason) {
          if (!offer.rejectionReasons) {
            offer.rejectionReasons = {};
          }
          offer.rejectionReasons[playerId] = action.reason;
        }
        const otherPlayersCount = nextState.players.length - 1;
        if (
          (offer.toPlayerId && offer.toPlayerId === playerId) ||
          offer.rejectedByPlayerIds.length >= otherPlayersCount
        ) {
          offer.status = 'rejected';
        }
        details.rejectedBy = playerId;
      }
      break;
    }

    case 'cancel_trade': {
      const offer = nextState.activeTradeOffers.find((o) => o.id === action.offerId)!;
      offer.status = 'cancelled';
      break;
    }

    case 'end_turn': {
      // Check if current player already won before ending turn
      if (checkVictory(nextState, nowMs)) {
        break;
      }
      // Cancel all remaining open trade offers
      for (const offer of nextState.activeTradeOffers) {
        if (offer.status === 'open') {
          offer.status = 'cancelled';
        }
      }
      nextState.activeTradeOffers = [];
      player.hasPlayedDevCardThisTurn = false;
      player.playedDevCardTypesThisTurn = [];
      nextState.lastDiceRoll = undefined;

      const currentIdx = nextState.playerOrder.indexOf(playerId);
      const nextIdx = (currentIdx + 1) % nextState.playerOrder.length;
      nextState.activePlayerId = nextState.playerOrder[nextIdx]!;
      nextState.turn += 1;
      nextState.phase = 'turn_start';
      break;
    }
  }

  nextState.sequence += 1;
  const stateHashAfter = computeStateHash(nextState);

  const event: GameEvent = {
    sequence: nextState.sequence,
    turn: nextState.turn,
    phaseBefore,
    phaseAfter: nextState.phase,
    playerId,
    action,
    timestampMs: nowMs,
    stateHashAfter,
    details,
    aiDecisionId: options?.aiDecisionId
  };

  return { state: nextState, event };
}

function markDevCardPlayed(
  player: PlayerState,
  cardType: DevCardType,
  turn: number
): void {
  const card = player.devCards.find(
    (c) => c.type === cardType && !c.played && c.boughtAtTurn < turn
  );
  if (!card) {
    throw new Error(`No playable ${cardType} card found.`);
  }
  card.played = true;
  card.playedAtTurn = turn;
  player.hasPlayedDevCardThisTurn = true;
  if (!player.playedDevCardTypesThisTurn.includes(cardType)) {
    player.playedDevCardTypesThisTurn.push(cardType);
  }
}

function distributeResourcesForRoll(
  state: GameState,
  diceTotal: number
): Record<string, Partial<ResourceCount>> {
  // First calculate total owed per player per resource
  const owedByPlayer: Record<string, ResourceCount> = {};
  for (const p of state.players) {
    owedByPlayer[p.id] = createEmptyResources();
  }
  const totalOwedByResource = createEmptyResources();

  for (const hex of Object.values(state.board.hexes)) {
    if (hex.numberToken !== diceTotal) continue;
    if (hex.id === state.board.robberHexId) continue;
    const res = TERRAIN_TO_RESOURCE[hex.terrain];
    if (!res) continue;

    for (const v of Object.values(state.board.vertices)) {
      if (!v.adjacentHexIds.includes(hex.id)) continue;
      const b = state.board.buildings[v.id];
      if (!b) continue;
      const amount = b.type === 'city' ? 2 : 1;
      owedByPlayer[b.ownerId]![res] += amount;
      totalOwedByResource[res] += amount;
    }
  }

  // Apply bank shortage rule: if bank[res] < totalOwedByResource[res], that resource is not distributed
  const distributed: Record<string, Partial<ResourceCount>> = {};
  for (const p of state.players) {
    distributed[p.id] = {};
  }

  for (const res of ALL_RESOURCES) {
    const needed = totalOwedByResource[res];
    if (needed === 0) continue;
    if (state.bank[res] < needed) {
      // Standard Catan rule: bank shortage prevents distribution of this resource
      continue;
    }
    for (const p of state.players) {
      const amt = owedByPlayer[p.id]![res];
      if (amt > 0) {
        state.bank[res] -= amt;
        p.resources[res] += amt;
        distributed[p.id]![res] = amt;
      }
    }
  }

  return distributed;
}

function resolveRobberStealAfterMove(
  state: GameState,
  actingPlayerId: string,
  hexId: string,
  stealRule: 'single' | 'all_adjacent',
  returnPhase: 'turn_start' | 'main_actions',
  targetPlayerId: string | undefined,
  details: Record<string, unknown>
): void {
  const eligibleTargets = getEligibleRobberTargetsOnHex(state, hexId, actingPlayerId);

  if (eligibleTargets.length === 0) {
    state.robberContext = undefined;
    state.phase = returnPhase;
    details.stolen = [];
    return;
  }

  if (stealRule === 'all_adjacent') {
    const stolenRecords: Array<{ fromPlayerId: string; resource: ResourceType | null }> = [];
    for (const tId of eligibleTargets) {
      const res = stealOneRandomResource(state, actingPlayerId, tId);
      stolenRecords.push({ fromPlayerId: tId, resource: res });
    }
    details.stolen = stolenRecords;
    state.robberContext = undefined;
    state.phase = returnPhase;
    return;
  }

  // Single target rule
  if (targetPlayerId && eligibleTargets.includes(targetPlayerId)) {
    const res = stealOneRandomResource(state, actingPlayerId, targetPlayerId);
    details.stolenFrom = targetPlayerId;
    details.stolenResource = res;
    state.robberContext = undefined;
    state.phase = returnPhase;
    return;
  }

  if (eligibleTargets.length === 1) {
    const onlyTarget = eligibleTargets[0]!;
    const res = stealOneRandomResource(state, actingPlayerId, onlyTarget);
    details.stolenFrom = onlyTarget;
    details.stolenResource = res;
    state.robberContext = undefined;
    state.phase = returnPhase;
    return;
  }

  // Multiple eligible targets and none selected yet -> transition to steal_resource phase
  state.robberContext = {
    source: state.robberContext?.source ?? 'dice_7',
    returnPhase,
    eligibleTargetIds: eligibleTargets
  };
  state.phase = 'steal_resource';
}

function stealOneRandomResource(
  state: GameState,
  thiefPlayerId: string,
  victimPlayerId: string
): ResourceType | null {
  const thief = getPlayerById(state, thiefPlayerId);
  const victim = getPlayerById(state, victimPlayerId);
  if (!thief || !victim) return null;

  const victimCards: ResourceType[] = [];
  for (const r of ALL_RESOURCES) {
    for (let i = 0; i < victim.resources[r]; i++) {
      victimCards.push(r);
    }
  }
  if (victimCards.length === 0) return null;

  const pick = nextPrngInt(state.prngState, 0, victimCards.length - 1);
  state.prngState = pick.nextState;
  const chosenRes = victimCards[pick.value]!;

  victim.resources[chosenRes] -= 1;
  thief.resources[chosenRes] += 1;
  return chosenRes;
}

export function expireStaleTradesInPlace(state: GameState, nowMs = Date.now()): boolean {
  let changed = false;
  for (const offer of state.activeTradeOffers) {
    if (offer.status === 'open' && nowMs >= offer.expiresAtMs) {
      offer.status = 'expired';
      changed = true;
    }
  }
  return changed;
}

/**
 * Projects the authoritative GameState into a PlayerView that hides opponent private resources
 * and unplayed development cards (including hidden Victory Point cards until game_over).
 */
export function getPlayerView(state: GameState, viewerId: string): PlayerView {
  const isGameOver = state.phase === 'game_over';

  // Order public players according to the established turn/setup order (playerOrder) rather than initial color registration
  const playersMap = new Map(state.players.map((p) => [p.id, p]));
  const orderedPlayerStates =
    state.playerOrder && state.playerOrder.length === state.players.length
      ? state.playerOrder.map((id) => playersMap.get(id)!).filter(Boolean)
      : state.players;

  const players: PublicPlayerInfo[] = orderedPlayerStates.map((p) => {
    const isSelf = p.id === viewerId;
    const score = calculateScore(state, p.id);

    // For other players, only show dev cards that have already been played
    const visibleDevCards = isSelf || isGameOver
      ? structuredClone(p.devCards)
      : p.devCards.filter((c) => c.played).map((c) => ({ ...c }));

    return {
      id: p.id,
      name: p.name,
      color: p.color,
      type: p.type,
      aiDifficulty: p.aiDifficulty,
      aiStyle: p.aiStyle,
      connected: p.connected,
      resourceCount: totalResourceCount(p.resources),
      resources: isSelf || isGameOver ? { ...p.resources } : undefined,
      devCardCount: p.devCards.filter((c) => !c.played).length,
      devCards: visibleDevCards,
      playedDevCardTypesThisTurn: [...p.playedDevCardTypesThisTurn],
      hasPlayedDevCardThisTurn: p.hasPlayedDevCardThisTurn,
      knightsPlayed: p.knightsPlayed,
      longestRoadLength: p.longestRoadLength,
      publicScore: score.publicScore,
      totalScore: isSelf || isGameOver ? score.totalScore : undefined,
      remainingPieces: { ...p.remainingPieces }
    };
  });

  return {
    gameId: state.gameId,
    viewerId,
    sequence: state.sequence,
    turn: state.turn,
    rules: structuredClone(state.rules),
    board: structuredClone(state.board),
    players,
    playerOrder: [...state.playerOrder],
    activePlayerId: state.activePlayerId,
    phase: state.phase,
    lastDiceRoll: state.lastDiceRoll ? { ...state.lastDiceRoll } : undefined,
    bank: { ...state.bank },
    devCardDeckCount: state.devCardDeck.length,
    pendingDiscards: { ...state.pendingDiscards },
    robberEligibleTargetIds: state.robberContext?.eligibleTargetIds
      ? [...state.robberContext.eligibleTargetIds]
      : undefined,
    freeRoadsRemaining: state.freeRoadsRemaining,
    activeTradeOffers: structuredClone(state.activeTradeOffers),
    longestRoadOwnerId: state.longestRoadOwnerId,
    largestArmyOwnerId: state.largestArmyOwnerId,
    winnerId: state.winnerId
  };
}
