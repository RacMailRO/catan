import {
  GameRulesConfig,
  ParticipantConfig,
  ReplayFile,
  ReplayRecorder,
  calculateScore,
  createGame
} from '@catan/core';
import { chooseAIAction } from './bot';

export interface SimulationOptions {
  gameId?: string;
  seed: string;
  participants: ParticipantConfig[];
  rules?: Partial<GameRulesConfig>;
  maxTurns?: number;
  maxEvents?: number;
  recordReplay?: boolean;
}

export interface SimulationResult {
  gameId: string;
  seed: string;
  winnerId: string | null;
  turns: number;
  totalEvents: number;
  scoresByPlayer: Record<string, number>;
  illegalMovesAttempted: number;
  durationMs: number;
  replay?: ReplayFile;
}

export interface PlayerBenchmarkStats {
  playerId: string;
  name: string;
  wins: number;
  gamesPlayed: number;
  winRate: number;
  confidenceInterval95: [number, number];
  averageScore: number;
}

export interface BenchmarkReport {
  gamesCount: number;
  completedGames: number;
  averageTurns: number;
  totalIllegalMoves: number;
  playerStats: Record<string, PlayerBenchmarkStats>;
}

export interface BenchmarkSuiteResult {
  report: BenchmarkReport;
  /** One per game, present only when `recordReplays` was requested - lets the caller persist
   * each benchmark game individually for later replay/AI-decision analysis. */
  replays: ReplayFile[];
}

/**
 * Runs a complete automated AI vs. AI game deterministically.
 */
export function runSimulatedGame(options: SimulationOptions): SimulationResult {
  const startMs = performance.now();
  const gameId = options.gameId ?? `sim-${options.seed}`;
  const maxTurns = options.maxTurns ?? 160;
  const maxEvents = options.maxEvents ?? 1600;

  const initialState = createGame({
    gameId,
    seed: options.seed,
    participants: options.participants,
    rules: options.rules,
    nowMs: 1000000
  });

  const recorder = new ReplayRecorder(initialState, 25);
  let eventsCount = 0;
  let actionsInCurrentTurn = 0;
  let lastTurnSeen = 0;

  while (
    recorder.getState().phase !== 'game_over' &&
    recorder.getState().turn <= maxTurns &&
    eventsCount < maxEvents
  ) {
    const curState = recorder.getState();

    if (curState.turn !== lastTurnSeen) {
      lastTurnSeen = curState.turn;
      actionsInCurrentTurn = 0;
    }

    // Determine which player needs to act next
    let actorId = curState.activePlayerId;
    if (curState.phase === 'discard_resources') {
      const pendingIds = Object.keys(curState.pendingDiscards);
      if (pendingIds.length > 0) {
        actorId = pendingIds[0]!;
      }
    } else if (curState.phase === 'main_actions') {
      const openOffer = curState.activeTradeOffers.find((o) => o.status === 'open');
      if (openOffer) {
        const responder = curState.players.find(
          (p) =>
            p.id !== openOffer.fromPlayerId &&
            (!openOffer.toPlayerId || openOffer.toPlayerId === p.id) &&
            !openOffer.rejectedByPlayerIds.includes(p.id)
        );
        if (responder) {
          actorId = responder.id;
        }
      }
    }

    // Guard against infinite trading/action loops in a single turn
    if (actionsInCurrentTurn > 18 && (curState.phase === 'main_actions' || curState.phase === 'special_building')) {
      if (curState.phase === 'special_building') {
        recorder.recordAndApply(
          curState.activePlayerId,
          { type: 'pass_special_building' },
          { nowMs: 1000000 + eventsCount * 100 }
        );
      } else {
        recorder.recordAndApply(
          curState.activePlayerId,
          { type: 'end_turn' },
          { nowMs: 1000000 + eventsCount * 100 }
        );
      }
      eventsCount++;
      actionsInCurrentTurn = 0;
      continue;
    }

    const decision = chooseAIAction(curState, actorId);
    recorder.recordAndApply(actorId, decision.action, {
      nowMs: 1000000 + eventsCount * 100,
      aiDecision: decision.decisionRecord
    });

    eventsCount++;
    actionsInCurrentTurn++;
  }

  const finalState = recorder.getState();
  const scoresByPlayer: Record<string, number> = {};
  for (const p of finalState.players) {
    scoresByPlayer[p.id] = calculateScore(finalState, p.id).totalScore;
  }

  return {
    gameId,
    seed: options.seed,
    winnerId: finalState.winnerId,
    turns: finalState.turn,
    totalEvents: eventsCount,
    scoresByPlayer,
    illegalMovesAttempted: 0,
    durationMs: Number((performance.now() - startMs).toFixed(2)),
    replay: options.recordReplay ? recorder.toReplayFile() : undefined
  };
}

/**
 * Computes Wilson score 95% confidence interval for a binomial proportion (win rate).
 */
export function computeWilsonConfidenceInterval95(
  wins: number,
  total: number
): [number, number] {
  if (total <= 0) return [0, 0];
  const z = 1.96;
  const phat = wins / total;
  const denom = 1 + (z * z) / total;
  const center = phat + (z * z) / (2 * total);
  const spread = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total);
  const low = Math.max(0, (center - spread) / denom);
  const high = Math.min(1, (center + spread) / denom);
  return [Number(low.toFixed(4)), Number(high.toFixed(4))];
}

/**
 * Runs a series of controlled AI vs. AI games rotating starting positions to eliminate seat bias.
 */
export function runBenchmarkSuite(options: {
  baseSeed: string;
  gamesCount: number;
  participants: ParticipantConfig[];
  rules?: Partial<GameRulesConfig>;
  maxTurns?: number;
  /** When true, each game in the suite also records its full replay (events, snapshots, AI
   * decisions) so the caller can save it for later analysis instead of only aggregate stats. */
  recordReplays?: boolean;
}): BenchmarkSuiteResult {
  const winsByPlayer: Record<string, number> = {};
  const totalScoreByPlayer: Record<string, number> = {};
  const namesByPlayer: Record<string, string> = {};

  for (const p of options.participants) {
    winsByPlayer[p.id] = 0;
    totalScoreByPlayer[p.id] = 0;
    namesByPlayer[p.id] = p.name;
  }

  let completedGames = 0;
  let totalTurns = 0;
  let totalIllegalMoves = 0;
  const replays: ReplayFile[] = [];

  for (let i = 0; i < options.gamesCount; i++) {
    // Rotate starting order on each game to neutralize seat-order advantage
    const rotated = options.participants.map(
      (_, idx) => options.participants[(idx + i) % options.participants.length]!
    );

    const res = runSimulatedGame({
      gameId: `bench-${options.baseSeed}-${i + 1}`,
      seed: `${options.baseSeed}-game-${i + 1}`,
      participants: rotated,
      rules: options.rules,
      maxTurns: options.maxTurns ?? 150,
      recordReplay: Boolean(options.recordReplays)
    });

    if (res.replay) {
      replays.push(res.replay);
    }

    totalTurns += res.turns;
    totalIllegalMoves += res.illegalMovesAttempted;
    if (res.winnerId) {
      completedGames++;
      if (winsByPlayer[res.winnerId] !== undefined) {
        winsByPlayer[res.winnerId]! += 1;
      }
    }

    for (const [pId, sc] of Object.entries(res.scoresByPlayer)) {
      if (totalScoreByPlayer[pId] !== undefined) {
        totalScoreByPlayer[pId]! += sc;
      }
    }
  }

  const playerStats: Record<string, PlayerBenchmarkStats> = {};
  for (const p of options.participants) {
    const wins = winsByPlayer[p.id] ?? 0;
    const n = options.gamesCount;
    const winRate = n > 0 ? Number((wins / n).toFixed(4)) : 0;
    playerStats[p.id] = {
      playerId: p.id,
      name: p.name,
      wins,
      gamesPlayed: n,
      winRate,
      confidenceInterval95: computeWilsonConfidenceInterval95(wins, n),
      averageScore: n > 0 ? Number(((totalScoreByPlayer[p.id] ?? 0) / n).toFixed(2)) : 0
    };
  }

  return {
    report: {
      gamesCount: options.gamesCount,
      completedGames,
      averageTurns:
        options.gamesCount > 0 ? Number((totalTurns / options.gamesCount).toFixed(1)) : 0,
      totalIllegalMoves,
      playerStats
    },
    replays
  };
}
