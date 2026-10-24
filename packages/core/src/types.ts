export type ResourceType = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';

export const ALL_RESOURCES: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export type ResourceCount = Record<ResourceType, number>;

export type TerrainType = 'forest' | 'hills' | 'pasture' | 'fields' | 'mountains' | 'desert';

export const TERRAIN_TO_RESOURCE: Record<TerrainType, ResourceType | null> = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'sheep',
  fields: 'wheat',
  mountains: 'ore',
  desert: null
};

export type HarborType = 'generic' | ResourceType;

export type DevCardType =
  | 'knight'
  | 'road_building'
  | 'year_of_plenty'
  | 'monopoly'
  | 'victory_point';

export type PlayerColor = 'red' | 'blue' | 'orange' | 'green';

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'orange', 'green'];

export type ParticipantType = 'human' | 'ai' | 'llm' | 'passive';

export type AIDifficulty = 'beginner' | 'medium' | 'advanced' | 'expert';

export type AIStrategyStyle =
  | 'balanced'
  | 'expansion'
  | 'development'
  | 'commercial'
  | 'competitive'
  | 'adaptive';

export interface GameRulesConfig {
  presetId: 'standard' | 'small_group' | 'custom';
  victoryPointsToWin: 10 | 12 | 14;
  startingResourcesRule: 'second_settlement' | 'both_settlements';
  knightStealRule: 'single' | 'all_adjacent';
  robber7StealRule: 'single' | 'all_adjacent';
  devCardsPerTurnRule: 'one_total' | 'one_per_type';
  tradeOfferTimeoutSec: number;
  boardLayout: 'random_balanced' | 'random_pure' | 'beginner_fixed';
  autoFillPassiveBotsMinPlayers: number;
}

export interface HexTile {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: TerrainType;
  numberToken: number | null;
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
  adjacentHexIds: string[];
  adjacentVertexIds: string[];
  adjacentEdgeIds: string[];
  harbor?: HarborType;
}

export interface Edge {
  id: string;
  v1: string;
  v2: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  adjacentHexIds: string[];
}

export interface Harbor {
  id: string;
  type: HarborType;
  edgeId: string;
  vertexIds: [string, string];
  hexId: string;
  x: number;
  y: number;
}

export interface Building {
  ownerId: string;
  type: 'settlement' | 'city';
  vertexId: string;
}

export interface Road {
  ownerId: string;
  edgeId: string;
}

export interface BoardState {
  hexes: Record<string, HexTile>;
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  harbors: Harbor[];
  buildings: Record<string, Building>; // key: vertexId
  roads: Record<string, Road>; // key: edgeId
  robberHexId: string;
}

export interface DevCardInstance {
  id: string;
  type: DevCardType;
  boughtAtTurn: number;
  played: boolean;
  playedAtTurn?: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  type: ParticipantType;
  aiDifficulty?: AIDifficulty;
  aiStyle?: AIStrategyStyle;
  connected: boolean;
  resources: ResourceCount;
  devCards: DevCardInstance[];
  playedDevCardTypesThisTurn: DevCardType[];
  hasPlayedDevCardThisTurn: boolean;
  knightsPlayed: number;
  longestRoadLength: number;
  remainingPieces: {
    roads: number;
    settlements: number;
    cities: number;
  };
}

export type TurnPhase =
  | 'setup_settlement_1'
  | 'setup_road_1'
  | 'setup_settlement_2'
  | 'setup_road_2'
  | 'turn_start'
  | 'discard_resources'
  | 'move_robber'
  | 'steal_resource'
  | 'road_building_card'
  | 'main_actions'
  | 'game_over';

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId?: string; // undefined = open to all other players
  offering: ResourceCount;
  requesting: ResourceCount;
  createdAtMs: number;
  expiresAtMs: number;
  rejectedByPlayerIds: string[];
  status: 'open' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
}

export interface GameState {
  gameId: string;
  engineVersion: string;
  seed: string;
  prngState: number;
  sequence: number;
  turn: number;
  rules: GameRulesConfig;
  board: BoardState;
  players: PlayerState[];
  playerOrder: string[];
  activePlayerId: string;
  phase: TurnPhase;
  setupStepIndex: number;
  lastPlacedSettlementVertexId?: string;
  lastDiceRoll?: { die1: number; die2: number; total: number };
  bank: ResourceCount;
  devCardDeck: DevCardType[];
  pendingDiscards: Record<string, number>; // playerId -> count to discard
  robberContext?: {
    source: 'dice_7' | 'knight';
    returnPhase: 'turn_start' | 'main_actions';
    eligibleTargetIds: string[];
  };
  freeRoadsRemaining: number;
  activeTradeOffers: TradeOffer[];
  longestRoadOwnerId: string | null;
  largestArmyOwnerId: string | null;
  winnerId: string | null;
  startedAtMs: number;
  finishedAtMs?: number;
}

export interface PublicPlayerInfo {
  id: string;
  name: string;
  color: PlayerColor;
  type: ParticipantType;
  aiDifficulty?: AIDifficulty;
  aiStyle?: AIStrategyStyle;
  connected: boolean;
  resourceCount: number;
  resources?: ResourceCount; // only populated for the viewing player themselves
  devCardCount: number;
  devCards?: DevCardInstance[]; // only populated for the viewing player themselves
  playedDevCardTypesThisTurn: DevCardType[];
  hasPlayedDevCardThisTurn: boolean;
  knightsPlayed: number;
  longestRoadLength: number;
  publicScore: number;
  totalScore?: number; // only populated for the viewing player or at game_over
  remainingPieces: {
    roads: number;
    settlements: number;
    cities: number;
  };
}

export interface PlayerView {
  gameId: string;
  viewerId: string;
  sequence: number;
  turn: number;
  rules: GameRulesConfig;
  board: BoardState;
  players: PublicPlayerInfo[];
  playerOrder: string[];
  activePlayerId: string;
  phase: TurnPhase;
  lastDiceRoll?: { die1: number; die2: number; total: number };
  bank: ResourceCount;
  devCardDeckCount: number;
  pendingDiscards: Record<string, number>;
  robberEligibleTargetIds?: string[];
  freeRoadsRemaining: number;
  activeTradeOffers: TradeOffer[];
  longestRoadOwnerId: string | null;
  largestArmyOwnerId: string | null;
  winnerId: string | null;
}

export type GameAction =
  | { type: 'place_initial_settlement'; vertexId: string }
  | { type: 'place_initial_road'; edgeId: string }
  | { type: 'roll_dice' }
  | { type: 'discard_cards'; resources: Partial<ResourceCount> }
  | { type: 'move_robber'; hexId: string; targetPlayerId?: string }
  | { type: 'steal_from_player'; targetPlayerId: string }
  | { type: 'build_road'; edgeId: string }
  | { type: 'build_settlement'; vertexId: string }
  | { type: 'build_city'; vertexId: string }
  | { type: 'buy_dev_card' }
  | { type: 'play_knight'; hexId: string; targetPlayerId?: string }
  | { type: 'play_road_building' }
  | { type: 'place_free_road'; edgeId: string }
  | { type: 'play_year_of_plenty'; resources: [ResourceType, ResourceType] }
  | { type: 'play_monopoly'; resource: ResourceType }
  | {
      type: 'trade_bank';
      give: ResourceType;
      giveAmount: number;
      receive: ResourceType;
    }
  | {
      type: 'propose_trade';
      toPlayerId?: string;
      offering: Partial<ResourceCount>;
      requesting: Partial<ResourceCount>;
    }
  | { type: 'respond_trade'; offerId: string; response: 'accept' | 'reject' }
  | { type: 'cancel_trade'; offerId: string }
  | { type: 'end_turn' };

export interface ActionValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
}

export interface AICandidateEvaluation {
  action: GameAction;
  score: number;
  factors: Record<string, number>;
  explanation: string;
}

export interface AIDecisionRecord {
  id: string;
  gameId: string;
  sequence: number;
  turn: number;
  playerId: string;
  difficulty: AIDifficulty;
  style: AIStrategyStyle;
  phase: TurnPhase;
  chosenAction: GameAction;
  chosenScore: number;
  chosenReason: string;
  candidates: AICandidateEvaluation[];
  simulationsRun?: number;
  computeTimeMs: number;
  usedLlmFallback?: boolean;
}

export interface GameEvent {
  sequence: number;
  turn: number;
  phaseBefore: TurnPhase;
  phaseAfter: TurnPhase;
  playerId: string;
  action: GameAction;
  timestampMs: number;
  stateHashAfter: string;
  details: Record<string, unknown>;
  aiDecisionId?: string;
}

export interface GameSnapshot {
  sequence: number;
  turn: number;
  stateHash: string;
  state: GameState;
}

export interface ReplayFile {
  formatVersion: string;
  engineVersion: string;
  gameId: string;
  seed: string;
  createdAtMs: number;
  rules: GameRulesConfig;
  initialState: GameState;
  events: GameEvent[];
  snapshots: GameSnapshot[];
  aiDecisions: AIDecisionRecord[];
}
