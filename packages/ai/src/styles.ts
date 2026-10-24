import { AIStrategyStyle, PlayerView } from '@catan/core';

export interface StrategyWeights {
  victoryPoints: number;
  expectedProduction: number;
  resourceDiversity: number;
  expansionPotential: number;
  harborAccess: number;
  devCardsAndKnights: number;
  roadAndArmyTitles: number;
  opponentBlocking: number;
}

export const STRATEGY_STYLE_WEIGHTS: Record<
  Exclude<AIStrategyStyle, 'adaptive'>,
  StrategyWeights
> = {
  balanced: {
    victoryPoints: 10.0,
    expectedProduction: 4.5,
    resourceDiversity: 3.5,
    expansionPotential: 3.0,
    harborAccess: 2.5,
    devCardsAndKnights: 3.0,
    roadAndArmyTitles: 3.5,
    opponentBlocking: 2.5
  },
  expansion: {
    victoryPoints: 10.0,
    expectedProduction: 5.0,
    resourceDiversity: 4.0,
    expansionPotential: 6.0,
    harborAccess: 2.0,
    devCardsAndKnights: 1.8,
    roadAndArmyTitles: 5.5,
    opponentBlocking: 2.5
  },
  development: {
    victoryPoints: 10.0,
    expectedProduction: 4.0,
    resourceDiversity: 3.0,
    expansionPotential: 2.0,
    harborAccess: 2.0,
    devCardsAndKnights: 6.5,
    roadAndArmyTitles: 5.0,
    opponentBlocking: 3.0
  },
  commercial: {
    victoryPoints: 10.0,
    expectedProduction: 5.5,
    resourceDiversity: 2.5,
    expansionPotential: 2.8,
    harborAccess: 6.5,
    devCardsAndKnights: 2.5,
    roadAndArmyTitles: 2.5,
    opponentBlocking: 2.0
  },
  competitive: {
    victoryPoints: 10.0,
    expectedProduction: 4.2,
    resourceDiversity: 3.2,
    expansionPotential: 3.5,
    harborAccess: 2.5,
    devCardsAndKnights: 4.0,
    roadAndArmyTitles: 6.0,
    opponentBlocking: 6.5
  }
};

export function resolveStrategyWeights(
  style: AIStrategyStyle,
  view: PlayerView,
  playerId: string
): StrategyWeights {
  if (style !== 'adaptive') {
    return STRATEGY_STYLE_WEIGHTS[style];
  }

  const me = view.players.find((p) => p.id === playerId);
  const myScore = me?.totalScore ?? me?.publicScore ?? 2;
  const maxOpponentPublicScore = Math.max(
    0,
    ...view.players.filter((p) => p.id !== playerId).map((p) => p.publicScore)
  );

  // Early game: prioritize expansion and resource diversity
  if (myScore <= 4 && view.turn < 18) {
    return {
      ...STRATEGY_STYLE_WEIGHTS.expansion,
      expectedProduction: 5.8,
      resourceDiversity: 4.8
    };
  }

  // If an opponent is close to winning, shift to competitive blocking & rapid VP push
  if (maxOpponentPublicScore >= view.rules.victoryPointsToWin - 3) {
    return {
      ...STRATEGY_STYLE_WEIGHTS.competitive,
      victoryPoints: 14.0,
      opponentBlocking: 7.5
    };
  }

  // Mid-to-late game: shift toward cities, development cards, and titles
  return {
    ...STRATEGY_STYLE_WEIGHTS.development,
    victoryPoints: 12.0,
    harborAccess: 3.5
  };
}
