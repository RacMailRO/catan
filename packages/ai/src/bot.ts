import {
  AICandidateEvaluation,
  AIDecisionRecord,
  AIDifficulty,
  AIStrategyStyle,
  GameAction,
  GameState,
  PlayerView,
  applyAction,
  getLegalActions,
  getPlayerById,
  getPlayerView,
  hashSeedToUint32,
  nextPrngInt
} from '@catan/core';
import {
  evaluateBoardPosition,
  evaluateCandidateAction
} from './evaluator';

export interface ChooseAIActionOptions {
  difficulty?: AIDifficulty;
  style?: AIStrategyStyle;
  maxRollouts?: number;
}

/**
 * Selects an action for a passive/neutral bot (used when 1-2 human/AI players play on a 3+ player board).
 * Places initial settlements/roads during setup to populate the board, then acts minimally on turns.
 */
export function choosePassiveBotAction(
  state: GameState,
  playerId: string
): { action: GameAction; decisionRecord: AIDecisionRecord } {
  const startTime = performance.now();
  const view = getPlayerView(state, playerId);
  const legal = getLegalActions(state, playerId);
  if (legal.length === 0) {
    throw new Error(`No legal actions available for passive bot ${playerId}`);
  }

  let chosenAction = legal[0]!;
  let chosenScore = 1.0;
  let chosenReason = 'Acțiune automată bot neutru';
  const candidates: AICandidateEvaluation[] = [];

  if (
    state.phase === 'setup_settlement_1' ||
    state.phase === 'setup_settlement_2' ||
    state.phase === 'setup_road_1' ||
    state.phase === 'setup_road_2'
  ) {
    // Evaluate spots so neutral settlements occupy realistic board positions
    const evaluated = legal
      .map((act) => evaluateCandidateAction(view, playerId, act, 'balanced'))
      .sort((a, b) => b.score - a.score);
    // Pick median-good spot so it doesn't grief or play terribly
    const pickIdx = Math.min(evaluated.length - 1, Math.floor(evaluated.length * 0.25));
    const chosen = evaluated[pickIdx]!;
    chosenAction = chosen.action;
    chosenScore = chosen.score;
    chosenReason = `Plasare inițială bot neutru (${chosen.explanation})`;
    candidates.push(...evaluated.slice(0, 5));
  } else {
    // During normal turns: roll dice, reject trades, move robber to desert/empty hex, or end turn immediately
    const roll = legal.find((a) => a.type === 'roll_dice');
    const endTurn = legal.find((a) => a.type === 'end_turn');
    const rejectTrade = legal.find(
      (a) => a.type === 'respond_trade' && a.response === 'reject'
    );

    if (roll) {
      chosenAction = roll;
      chosenReason = 'Botul neutru aruncă zarurile';
    } else if (rejectTrade) {
      chosenAction = rejectTrade;
      chosenReason = 'Botul neutru refuză schimburile';
    } else if (endTurn) {
      chosenAction = endTurn;
      chosenReason = 'Botul neutru încheie tura pasiv';
    } else if (state.phase === 'move_robber') {
      // Pick hex with 0 buildings if possible
      const harmlessMove =
        legal.find((a) => {
          if (a.type !== 'move_robber') return false;
          return !Object.values(view.board.vertices).some(
            (v) => v.adjacentHexIds.includes(a.hexId) && view.board.buildings[v.id]
          );
        }) ?? legal[0]!;
      chosenAction = harmlessMove;
      chosenReason = 'Botul neutru mută hoțul pe o zonă neutră';
    }

    candidates.push({
      action: chosenAction,
      score: chosenScore,
      factors: { passive: 1 },
      explanation: chosenReason
    });
  }

  const computeTimeMs = Number((performance.now() - startTime).toFixed(2));

  return {
    action: chosenAction,
    decisionRecord: {
      id: `AI_DEC_${state.sequence + 1}_${playerId}`,
      gameId: state.gameId,
      sequence: state.sequence + 1,
      turn: state.turn,
      playerId,
      difficulty: 'beginner',
      style: 'balanced',
      phase: state.phase,
      chosenAction,
      chosenScore,
      chosenReason,
      candidates,
      computeTimeMs
    }
  };
}

/**
 * Main AI Decision Pipeline following the Section 6.1 architecture:
 * A[Starea observată de AI (PlayerView)] -> B[Generarea acțiunilor legale]
 * -> C[Evaluarea poziției] -> D[Planificarea strategică] -> E{Nivel de dificultate}
 * -> F[Heuristici rapide] / G[Evaluare multifactori] / H[Căutare și simulări]
 * -> I[Alegerea mutării]
 */
export function chooseAIAction(
  state: GameState,
  playerId: string,
  options?: ChooseAIActionOptions
): { action: GameAction; decisionRecord: AIDecisionRecord } {
  const player = getPlayerById(state, playerId);
  if (!player) {
    throw new Error(`Player ${playerId} not found in state.`);
  }

  if (player.type === 'passive') {
    return choosePassiveBotAction(state, playerId);
  }

  const startTime = performance.now();
  const difficulty: AIDifficulty = options?.difficulty ?? player.aiDifficulty ?? 'medium';
  const style: AIStrategyStyle = options?.style ?? player.aiStyle ?? 'balanced';

  // Step A: Observed state projection (never accesses hidden cards of opponents)
  const view: PlayerView = getPlayerView(state, playerId);

  // Step B: Generate legal actions
  const legalActions = getLegalActions(state, playerId);
  if (legalActions.length === 0) {
    throw new Error(`No legal actions available for AI player ${playerId} in phase ${state.phase}`);
  }

  // Step C & D: Evaluate candidates with strategic style weights
  const evaluatedCandidates: AICandidateEvaluation[] = legalActions.map((act) =>
    evaluateCandidateAction(view, playerId, act, style)
  );

  // Sort candidates highest to lowest
  evaluatedCandidates.sort((a, b) => b.score - a.score);

  let chosenCandidate = evaluatedCandidates[0]!;
  let simulationsRun = 0;

  // Step E: Branch by difficulty level
  if (difficulty === 'beginner') {
    // F: Rapid heuristics with deterministic suboptimal selection among top 3 viable moves
    if (evaluatedCandidates.length > 1 && state.phase !== 'turn_start') {
      const topPoolSize = Math.min(3, evaluatedCandidates.length);
      const localSeed = hashSeedToUint32(`${state.seed}-beg-${state.sequence}-${playerId}`);
      const pick = nextPrngInt(localSeed, 0, topPoolSize - 1);
      chosenCandidate = evaluatedCandidates[pick.value]!;
    }
  } else if (difficulty === 'medium') {
    // G: Multi-factor evaluation (picks top heuristic candidate directly)
    chosenCandidate = evaluatedCandidates[0]!;
  } else if (difficulty === 'advanced') {
    // G+: Multi-factor + 1-turn tactical lookahead (evaluates resulting state after applying top candidates)
    const topK = evaluatedCandidates.slice(0, Math.min(6, evaluatedCandidates.length));
    let bestCombined = -Infinity;
    for (const cand of topK) {
      const lookaheadBonus = computeTacticalLookaheadBonus(state, playerId, cand.action, style);
      const combinedScore = Number((cand.score + lookaheadBonus).toFixed(3));
      cand.factors.tacticalLookahead = Number(lookaheadBonus.toFixed(2));
      cand.score = combinedScore;
      if (combinedScore > bestCombined) {
        bestCombined = combinedScore;
        chosenCandidate = cand;
      }
    }
    evaluatedCandidates.sort((a, b) => b.score - a.score);
    chosenCandidate = evaluatedCandidates[0]!;
  } else if (difficulty === 'expert') {
    // H: Search & Monte Carlo rollouts over top candidates
    const topK = evaluatedCandidates.slice(0, Math.min(5, evaluatedCandidates.length));
    const rolloutsPerCandidate = options?.maxRollouts ?? 4;

    if (topK.length > 1) {
      let bestExpertScore = -Infinity;
      for (const cand of topK) {
        const lookahead = computeTacticalLookaheadBonus(state, playerId, cand.action, style);
        const mcEstimate = runMonteCarloRollouts(
          state,
          playerId,
          cand.action,
          style,
          rolloutsPerCandidate
        );
        simulationsRun += rolloutsPerCandidate;

        const expertScore = Number((cand.score + lookahead + mcEstimate * 0.35).toFixed(3));
        cand.factors.tacticalLookahead = Number(lookahead.toFixed(2));
        cand.factors.monteCarloRollout = Number((mcEstimate * 0.35).toFixed(2));
        cand.score = expertScore;

        if (expertScore > bestExpertScore) {
          bestExpertScore = expertScore;
          chosenCandidate = cand;
        }
      }
      evaluatedCandidates.sort((a, b) => b.score - a.score);
      chosenCandidate = evaluatedCandidates[0]!;
    }
  }

  const computeTimeMs = Number((performance.now() - startTime).toFixed(2));

  const decisionRecord: AIDecisionRecord = {
    id: `AI_DEC_${state.sequence + 1}_${playerId}`,
    gameId: state.gameId,
    sequence: state.sequence + 1,
    turn: state.turn,
    playerId,
    difficulty,
    style,
    phase: state.phase,
    chosenAction: chosenCandidate.action,
    chosenScore: chosenCandidate.score,
    chosenReason: chosenCandidate.explanation,
    candidates: evaluatedCandidates.slice(0, 8),
    simulationsRun: simulationsRun > 0 ? simulationsRun : undefined,
    computeTimeMs
  };

  return {
    action: chosenCandidate.action,
    decisionRecord
  };
}

/**
 * Computes tactical lookahead bonus by simulating the immediate post-action state on a sanitized state copy
 * and checking what follow-up actions (like building a settlement or city after a bank trade) become unlocked.
 */
function computeTacticalLookaheadBonus(
  state: GameState,
  playerId: string,
  action: GameAction,
  style: AIStrategyStyle
): number {
  if (action.type === 'roll_dice' || action.type === 'end_turn') {
    return 0;
  }

  try {
    const { state: nextState } = applyAction(state, playerId, action);
    if (nextState.winnerId === playerId) {
      return 500;
    }

    const nextView = getPlayerView(nextState, playerId);
    const posBefore = evaluateBoardPosition(getPlayerView(state, playerId), playerId, style);
    const posAfter = evaluateBoardPosition(nextView, playerId, style);
    let delta = (posAfter - posBefore) * 0.25;

    // If still our turn in main_actions after trading or playing a progress card, check if we unlocked a build!
    if (nextState.activePlayerId === playerId && nextState.phase === 'main_actions') {
      const followUps = getLegalActions(nextState, playerId);
      const canNowBuildCity = followUps.some((a) => a.type === 'build_city');
      const canNowBuildSettlement = followUps.some((a) => a.type === 'build_settlement');
      if (action.type === 'trade_bank' || action.type === 'play_year_of_plenty' || action.type === 'play_monopoly') {
        if (canNowBuildCity) delta += 14.0;
        else if (canNowBuildSettlement) delta += 12.0;
        else if (action.type === 'trade_bank') delta -= 4.5; // discourage pointless bank trades that don't unlock a build
      }
    }

    return delta;
  } catch {
    return 0;
  }
}

/**
 * Runs deterministic short-horizon Monte Carlo rollouts starting from `action`,
 * using only public/own information (randomizing unknown opponent cards/deck order per rollout).
 */
function runMonteCarloRollouts(
  state: GameState,
  playerId: string,
  firstAction: GameAction,
  style: AIStrategyStyle,
  numRollouts: number
): number {
  let totalValue = 0;

  for (let r = 0; r < numRollouts; r++) {
    try {
      const simState = structuredClone(state);
      // Perturb PRNG state per rollout so dice rolls vary across simulations
      simState.prngState = hashSeedToUint32(
        `${state.seed}-mc-${state.sequence}-${r}-${JSON.stringify(firstAction)}`
      );

      let cur = applyAction(simState, playerId, firstAction).state;
      const depthSteps = 6;

      for (let step = 0; step < depthSteps; step++) {
        if (cur.phase === 'game_over') break;
        let actorId = cur.activePlayerId;
        if (cur.phase === 'discard_resources') {
          actorId = Object.keys(cur.pendingDiscards)[0]!;
        }
        const legal = getLegalActions(cur, actorId);
        if (legal.length === 0) break;

        // Fast greedy policy inside rollout
        const view = getPlayerView(cur, actorId);
        let bestAct = legal[0]!;
        let bestScore = -Infinity;
        const sample = legal.slice(0, 8);
        for (const candAct of sample) {
          const ev = evaluateCandidateAction(view, actorId, candAct, style);
          if (ev.score > bestScore) {
            bestScore = ev.score;
            bestAct = candAct;
          }
        }
        cur = applyAction(cur, actorId, bestAct).state;
      }

      const finalView = getPlayerView(cur, playerId);
      totalValue += evaluateBoardPosition(finalView, playerId, style);
    } catch {
      // Ignore failed branch
    }
  }

  return numRollouts > 0 ? totalValue / numRollouts : 0;
}
