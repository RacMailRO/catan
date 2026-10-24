import {
  AIDecisionRecord,
  AIDifficulty,
  AIStrategyStyle,
  GameAction,
  GameState,
  PlayerView,
  getLegalActions,
  getPlayerView,
  validateAction
} from '@catan/core';
import { chooseAIAction } from './bot';

export interface LLMProviderRequest {
  gameId: string;
  playerId: string;
  turn: number;
  phase: string;
  playerView: PlayerView;
  legalActions: GameAction[];
  style: AIStrategyStyle;
}

export interface LLMProviderResponse {
  chosenAction: GameAction;
  reasoning?: string;
}

export interface LLMProvider {
  name: string;
  proposeAction(
    request: LLMProviderRequest,
    signal?: AbortSignal
  ): Promise<LLMProviderResponse>;
}

export interface LLMAdapterOptions {
  enabled: boolean;
  timeoutMs?: number;
  fallbackDifficulty?: AIDifficulty;
  style?: AIStrategyStyle;
  provider?: LLMProvider;
}

/**
 * Executes the safety flow from Section 6.5 of plan.md:
 * 1. Prepares restricted PlayerView representation (no private opponent cards).
 * 2. Sends only permitted info to the optional LLM provider with a strict timeout.
 * 3. Validates the returned structured action against the authoritative rules engine.
 * 4. If disabled, missing, timed out, or illegal, falls back automatically to the local algorithmic AI.
 */
export async function chooseActionWithLLMOrFallback(
  state: GameState,
  playerId: string,
  options: LLMAdapterOptions
): Promise<{ action: GameAction; decisionRecord: AIDecisionRecord; usedFallback: boolean }> {
  const fallbackDifficulty = options.fallbackDifficulty ?? 'advanced';
  const style = options.style ?? 'balanced';

  if (!options.enabled || !options.provider) {
    const local = chooseAIAction(state, playerId, { difficulty: fallbackDifficulty, style });
    local.decisionRecord.usedLlmFallback = true;
    return { ...local, usedFallback: true };
  }

  const startTime = performance.now();
  const timeoutMs = options.timeoutMs ?? 2500;
  const view = getPlayerView(state, playerId);
  const legalActions = getLegalActions(state, playerId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await Promise.race([
      options.provider.proposeAction(
        {
          gameId: state.gameId,
          playerId,
          turn: state.turn,
          phase: state.phase,
          playerView: view,
          legalActions,
          style
        },
        controller.signal
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM request timed out')), timeoutMs)
      )
    ]);

    clearTimeout(timer);

    if (!response || !response.chosenAction) {
      throw new Error('Empty response from LLM provider');
    }

    const validation = validateAction(state, playerId, response.chosenAction);
    if (!validation.valid) {
      throw new Error(`LLM proposed illegal action: ${validation.reason}`);
    }

    const computeTimeMs = Number((performance.now() - startTime).toFixed(2));
    const decisionRecord: AIDecisionRecord = {
      id: `LLM_DEC_${state.sequence + 1}_${playerId}`,
      gameId: state.gameId,
      sequence: state.sequence + 1,
      turn: state.turn,
      playerId,
      difficulty: fallbackDifficulty,
      style,
      phase: state.phase,
      chosenAction: response.chosenAction,
      chosenScore: 10,
      chosenReason: response.reasoning ?? `Decizie propusă de adaptorul LLM (${options.provider.name})`,
      candidates: [
        {
          action: response.chosenAction,
          score: 10,
          factors: { llmProposal: 10 },
          explanation: response.reasoning ?? 'LLM proposal'
        }
      ],
      computeTimeMs,
      usedLlmFallback: false
    };

    return {
      action: response.chosenAction,
      decisionRecord,
      usedFallback: false
    };
  } catch {
    clearTimeout(timer);
    const fallback = chooseAIAction(state, playerId, {
      difficulty: fallbackDifficulty,
      style
    });
    fallback.decisionRecord.usedLlmFallback = true;
    fallback.decisionRecord.chosenReason = `[Fallback AI Local] ${fallback.decisionRecord.chosenReason}`;
    return {
      ...fallback,
      usedFallback: true
    };
  }
}
