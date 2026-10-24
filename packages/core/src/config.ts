import { DevCardType, GameRulesConfig, ResourceCount, TerrainType } from './types';

export const ENGINE_VERSION = '1.0.0';
export const REPLAY_FORMAT_VERSION = '1.0.0';

export const STANDARD_RULES: GameRulesConfig = {
  presetId: 'standard',
  victoryPointsToWin: 10,
  startingResourcesRule: 'second_settlement',
  knightStealRule: 'single',
  robber7StealRule: 'single',
  devCardsPerTurnRule: 'one_total',
  tradeOfferTimeoutSec: 30,
  boardLayout: 'random_balanced',
  autoFillPassiveBotsMinPlayers: 3
};

export const SMALL_GROUP_PRESET: GameRulesConfig = {
  ...STANDARD_RULES,
  presetId: 'small_group',
  autoFillPassiveBotsMinPlayers: 3
};

export function createRulesConfig(overrides?: Partial<GameRulesConfig>): GameRulesConfig {
  return {
    ...STANDARD_RULES,
    ...overrides
  };
}

export const INITIAL_BANK_RESOURCES: ResourceCount = {
  wood: 19,
  brick: 19,
  sheep: 19,
  wheat: 19,
  ore: 19
};

export const INITIAL_PLAYER_PIECES = {
  roads: 15,
  settlements: 5,
  cities: 4
};

export const BUILDING_COSTS: Record<
  'road' | 'settlement' | 'city' | 'dev_card',
  ResourceCount
> = {
  road: { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
  city: { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 },
  dev_card: { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 }
};

export const STANDARD_TERRAIN_DISTRIBUTION: TerrainType[] = [
  'forest',
  'forest',
  'forest',
  'forest',
  'pasture',
  'pasture',
  'pasture',
  'pasture',
  'fields',
  'fields',
  'fields',
  'fields',
  'hills',
  'hills',
  'hills',
  'mountains',
  'mountains',
  'mountains',
  'desert'
];

export const STANDARD_NUMBER_TOKENS: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12
];

export const STANDARD_DEV_CARD_DECK: DevCardType[] = [
  // 14 Knights
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  // 5 Victory Points
  'victory_point',
  'victory_point',
  'victory_point',
  'victory_point',
  'victory_point',
  // 2 Road Building
  'road_building',
  'road_building',
  // 2 Year of Plenty
  'year_of_plenty',
  'year_of_plenty',
  // 2 Monopoly
  'monopoly',
  'monopoly'
];

export const DICE_PROBABILITIES: Record<number, number> = {
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  7: 6 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36
};

export const DICE_PIPS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1
};
