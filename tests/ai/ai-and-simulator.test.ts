import { describe, expect, it } from 'vitest';
import { createGame, verifyReplayDeterminism } from '@catan/core';
import {
  analyzeDecisionAtSequence,
  analyzeReplayGame,
  chooseAIAction,
  chooseActionWithLLMOrFallback,
  runBenchmarkSuite,
  runSimulatedGame
} from '@catan/ai';

describe('Catan AI Opponents, Strategic Analysis, LLM Fallback & Simulator', () => {
  it('completes a full 4-AI game across all 4 difficulty levels and records Level 3 AI decisions', () => {
    const sim = runSimulatedGame({
      gameId: 'sim-4-ai',
      seed: 'ai-match-seed-2026',
      participants: [
        {
          id: 'ai-beg',
          name: 'Bot Începător',
          type: 'ai',
          aiDifficulty: 'beginner',
          aiStyle: 'expansion'
        },
        {
          id: 'ai-med',
          name: 'Bot Mediu',
          type: 'ai',
          aiDifficulty: 'medium',
          aiStyle: 'commercial'
        },
        {
          id: 'ai-adv',
          name: 'Bot Avansat',
          type: 'ai',
          aiDifficulty: 'advanced',
          aiStyle: 'development'
        },
        {
          id: 'ai-exp',
          name: 'Bot Expert',
          type: 'ai',
          aiDifficulty: 'expert',
          aiStyle: 'adaptive'
        }
      ],
      recordReplay: true
    });

    expect(sim.illegalMovesAttempted).toBe(0);
    expect(sim.winnerId).not.toBeNull();
    expect(sim.scoresByPlayer[sim.winnerId!]!).toBeGreaterThanOrEqual(10);
    expect(sim.replay).toBeDefined();
    expect(sim.replay!.aiDecisions.length).toBeGreaterThan(20);

    // Verify replay determinism
    const det = verifyReplayDeterminism(sim.replay!);
    expect(det.valid).toBe(true);

    // Check strategic analysis report on the recorded replay
    const report = analyzeReplayGame(sim.replay!);
    expect(report.winnerId).toBe(sim.winnerId);
    expect(Object.keys(report.playerSummaries)).toHaveLength(4);

    // Inspect a specific decision at sequence 5
    const stepCmp = analyzeDecisionAtSequence(sim.replay!, 5);
    expect(stepCmp.sequence).toBe(5);
    expect(stepCmp.evaluatedAlternatives.length).toBeGreaterThan(0);
    expect(stepCmp.recordedAIDecision).toBeDefined();
  });

  it('completes a 1-AI + 2 passive bots game (small_group preset) without errors', () => {
    const sim = runSimulatedGame({
      gameId: 'sim-1-player-passive',
      seed: 'solo-ai-seed-7',
      participants: [
        {
          id: 'solo-ai',
          name: 'Explorer AI',
          type: 'ai',
          aiDifficulty: 'advanced',
          aiStyle: 'balanced'
        }
      ],
      recordReplay: false
    });

    expect(sim.winnerId).toBe('solo-ai');
    expect(sim.scoresByPlayer['solo-ai']!).toBeGreaterThanOrEqual(10);
  });

  it('enforces LLM safety flow: accepts valid action, falls back on illegal action or timeout', async () => {
    const state = createGame({
      gameId: 'llm-test',
      seed: 'llm-seed-1',
      participants: [
        { id: 'p1', name: 'LLM Bot', type: 'llm' },
        { id: 'p2', name: 'AI 2', type: 'ai' },
        { id: 'p3', name: 'AI 3', type: 'ai' }
      ]
    });

    // 1. Valid LLM proposal
    const validRes = await chooseActionWithLLMOrFallback(state, 'p1', {
      enabled: true,
      provider: {
        name: 'MockValidLLM',
        async proposeAction(req) {
          return {
            chosenAction: req.legalActions[0]!,
            reasoning: 'Aleasă intersecția cu producție optimă'
          };
        }
      }
    });
    expect(validRes.usedFallback).toBe(false);
    expect(validRes.decisionRecord.usedLlmFallback).toBe(false);

    // 2. Illegal LLM proposal -> must fall back to local AI
    const illegalRes = await chooseActionWithLLMOrFallback(state, 'p1', {
      enabled: true,
      provider: {
        name: 'MockIllegalLLM',
        async proposeAction() {
          // Propose roll_dice during setup_settlement_1 (illegal!)
          return {
            chosenAction: { type: 'roll_dice' },
            reasoning: 'Mutare ilegală intenționată'
          };
        }
      }
    });
    expect(illegalRes.usedFallback).toBe(true);
    expect(illegalRes.decisionRecord.usedLlmFallback).toBe(true);
    expect(illegalRes.action.type).toBe('place_initial_settlement');

    // 3. Timed-out LLM provider -> must fall back to local AI
    const timeoutRes = await chooseActionWithLLMOrFallback(state, 'p1', {
      enabled: true,
      timeoutMs: 30,
      provider: {
        name: 'MockSlowLLM',
        async proposeAction() {
          await new Promise((r) => setTimeout(r, 200));
          return { chosenAction: { type: 'end_turn' } };
        }
      }
    });
    expect(timeoutRes.usedFallback).toBe(true);
    expect(timeoutRes.action.type).toBe('place_initial_settlement');
  });

  it('runs a multi-game benchmark suite with confidence intervals and rotating seats', () => {
    const bench = runBenchmarkSuite({
      baseSeed: 'bench-suite-1',
      gamesCount: 4,
      // Above the simulator's 150-turn default: AI-vs-AI games occasionally run long
      // (observed ~108 turns on average here), and this suite asserts every game reaches
      // a winner, so give it enough headroom to not be flaky.
      maxTurns: 300,
      participants: [
        { id: 'p1', name: 'Adv Competitiv', type: 'ai', aiDifficulty: 'advanced', aiStyle: 'competitive' },
        { id: 'p2', name: 'Med Echilibrat', type: 'ai', aiDifficulty: 'medium', aiStyle: 'balanced' },
        { id: 'p3', name: 'Beg Expansiune', type: 'ai', aiDifficulty: 'beginner', aiStyle: 'expansion' }
      ]
    });

    expect(bench.gamesCount).toBe(4);
    expect(bench.totalIllegalMoves).toBe(0);
    expect(bench.completedGames).toBe(4);
    for (const stat of Object.values(bench.playerStats)) {
      expect(stat.gamesPlayed).toBe(4);
      expect(stat.confidenceInterval95[0]).toBeGreaterThanOrEqual(0);
      expect(stat.confidenceInterval95[1]).toBeLessThanOrEqual(1);
    }

    // Also verify Expert AI computes simulationsRun
    const g = createGame({
      gameId: 'exp-check',
      seed: 'exp-seed',
      participants: [
        { id: 'e1', name: 'Expert', type: 'ai', aiDifficulty: 'expert', aiStyle: 'adaptive' },
        { id: 'e2', name: 'Med', type: 'ai', aiDifficulty: 'medium', aiStyle: 'balanced' },
        { id: 'e3', name: 'Beg', type: 'ai', aiDifficulty: 'beginner', aiStyle: 'balanced' }
      ]
    });
    const expDecision = chooseAIAction(g, 'e1', { difficulty: 'expert', maxRollouts: 2 });
    expect(expDecision.decisionRecord.simulationsRun).toBeGreaterThan(0);
  });
});
