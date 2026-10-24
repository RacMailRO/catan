import {
  AICandidateEvaluation,
  AIDecisionRecord,
  AIStrategyStyle,
  GameAction,
  ReplayFile,
  calculateScore,
  getLegalActions,
  getPlayerView,
  reconstructStateAtSequence
} from '@catan/core';
import { evaluateCandidateAction } from './evaluator';

export interface StepDecisionComparison {
  sequence: number;
  turn: number;
  playerId: string;
  playerName: string;
  actualAction: GameAction;
  actualScore: number;
  bestAlternativeAction: GameAction;
  bestAlternativeScore: number;
  scoreGap: number;
  isOptimal: boolean;
  recordedAIDecision?: AIDecisionRecord;
  evaluatedAlternatives: AICandidateEvaluation[];
}

export interface PlayerGameAnalysisSummary {
  playerId: string;
  playerName: string;
  finalScore: number;
  totalActions: number;
  optimalDecisionsCount: number;
  suboptimalDecisionsCount: number;
  averageDecisionGap: number;
  biggestMistakes: StepDecisionComparison[];
}

export interface ReplayStrategicReport {
  gameId: string;
  totalTurns: number;
  totalEvents: number;
  winnerId: string | null;
  diceHistogram: Record<number, number>;
  playerSummaries: Record<string, PlayerGameAnalysisSummary>;
}

/**
 * Evaluates a specific step (`sequence`, 1-based) in a `ReplayFile`, comparing the move that was actually
 * chosen by the participant (human or AI) against all legal alternatives visible at that exact moment (`PlayerView`).
 */
export function analyzeDecisionAtSequence(
  replay: ReplayFile,
  sequence: number,
  referenceStyle: AIStrategyStyle = 'balanced'
): StepDecisionComparison {
  if (sequence < 1 || sequence > replay.events.length) {
    throw new Error(`Sequence ${sequence} out of bounds (1..${replay.events.length})`);
  }

  const stateBefore = reconstructStateAtSequence(replay, sequence - 1, false);
  const event = replay.events[sequence - 1]!;
  const playerId = event.playerId;
  const player = stateBefore.players.find((p) => p.id === playerId);
  const viewBefore = getPlayerView(stateBefore, playerId);

  const legal = getLegalActions(stateBefore, playerId);
  const style = player?.aiStyle ?? referenceStyle;

  const evaluated = legal
    .map((act) => evaluateCandidateAction(viewBefore, playerId, act, style))
    .sort((a, b) => b.score - a.score);

  const actualEval = evaluateCandidateAction(viewBefore, playerId, event.action, style);
  const bestAlt = evaluated[0] ?? actualEval;
  const scoreGap = Number(Math.max(0, bestAlt.score - actualEval.score).toFixed(3));

  const recordedAIDecision = event.aiDecisionId
    ? replay.aiDecisions.find((d) => d.id === event.aiDecisionId)
    : undefined;

  return {
    sequence,
    turn: event.turn,
    playerId,
    playerName: player?.name ?? playerId,
    actualAction: event.action,
    actualScore: actualEval.score,
    bestAlternativeAction: bestAlt.action,
    bestAlternativeScore: bestAlt.score,
    scoreGap,
    isOptimal: scoreGap <= 0.5,
    recordedAIDecision,
    evaluatedAlternatives: evaluated.slice(0, 8)
  };
}

/**
 * Generates a full post-game strategic analysis report from a ReplayFile.
 */
export function analyzeReplayGame(replay: ReplayFile): ReplayStrategicReport {
  const diceHistogram: Record<number, number> = {
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
    10: 0,
    11: 0,
    12: 0
  };

  const finalState = reconstructStateAtSequence(replay, replay.events.length, false);
  const playerSummaries: Record<string, PlayerGameAnalysisSummary> = {};

  for (const p of finalState.players) {
    const score = calculateScore(finalState, p.id);
    playerSummaries[p.id] = {
      playerId: p.id,
      playerName: p.name,
      finalScore: score.totalScore,
      totalActions: 0,
      optimalDecisionsCount: 0,
      suboptimalDecisionsCount: 0,
      averageDecisionGap: 0,
      biggestMistakes: []
    };
  }

  const gapsByPlayer: Record<string, number[]> = {};
  for (const p of finalState.players) {
    gapsByPlayer[p.id] = [];
  }

  for (const ev of replay.events) {
    if (ev.action.type === 'roll_dice' && ev.details.dice) {
      const dice = ev.details.dice as { total: number };
      if (dice.total >= 2 && dice.total <= 12) {
        diceHistogram[dice.total] = (diceHistogram[dice.total] ?? 0) + 1;
      }
      continue;
    }

    const summary = playerSummaries[ev.playerId];
    if (!summary) continue;

    summary.totalActions += 1;

    // Evaluate non-trivial strategic decisions
    if (ev.action.type !== 'end_turn') {
      const cmp = analyzeDecisionAtSequence(replay, ev.sequence);
      gapsByPlayer[ev.playerId]!.push(cmp.scoreGap);
      if (cmp.isOptimal) {
        summary.optimalDecisionsCount += 1;
      } else {
        summary.suboptimalDecisionsCount += 1;
        summary.biggestMistakes.push(cmp);
      }
    }
  }

  for (const pId of Object.keys(playerSummaries)) {
    const summary = playerSummaries[pId]!;
    const gaps = gapsByPlayer[pId]!;
    summary.averageDecisionGap =
      gaps.length > 0
        ? Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(3))
        : 0;
    summary.biggestMistakes.sort((a, b) => b.scoreGap - a.scoreGap);
    summary.biggestMistakes = summary.biggestMistakes.slice(0, 5);
  }

  return {
    gameId: replay.gameId,
    totalTurns: finalState.turn,
    totalEvents: replay.events.length,
    winnerId: finalState.winnerId,
    diceHistogram,
    playerSummaries
  };
}
