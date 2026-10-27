import { ENGINE_VERSION, REPLAY_FORMAT_VERSION } from './config';
import { applyAction } from './engine';
import { computeStateHash } from './prng';
import {
  AIDecisionRecord,
  GameAction,
  GameEvent,
  GameSnapshot,
  GameState,
  ReplayFile
} from './types';

export class ReplayRecorder {
  private readonly initialState: GameState;
  private currentState: GameState;
  private readonly events: GameEvent[] = [];
  private readonly snapshots: GameSnapshot[] = [];
  private readonly aiDecisions: AIDecisionRecord[] = [];
  private readonly snapshotInterval: number;

  constructor(initialState: GameState, snapshotInterval = 15) {
    this.initialState = structuredClone(initialState);
    this.currentState = structuredClone(initialState);
    this.snapshotInterval = Math.max(1, snapshotInterval);

    // Record initial snapshot at sequence 0
    this.snapshots.push({
      sequence: 0,
      turn: initialState.turn,
      stateHash: computeStateHash(initialState),
      state: structuredClone(initialState)
    });
  }

  public getState(): GameState {
    return this.currentState;
  }

  public getEvents(): readonly GameEvent[] {
    return this.events;
  }

  public getSnapshots(): readonly GameSnapshot[] {
    return this.snapshots;
  }

  public getAIDecisions(): readonly AIDecisionRecord[] {
    return this.aiDecisions;
  }

  public recordAndApply(
    playerId: string,
    action: GameAction,
    options?: { nowMs?: number; aiDecision?: AIDecisionRecord }
  ): { state: GameState; event: GameEvent } {
    if (options?.aiDecision) {
      this.aiDecisions.push(structuredClone(options.aiDecision));
    }

    const { state, event } = applyAction(this.currentState, playerId, action, {
      nowMs: options?.nowMs,
      aiDecisionId: options?.aiDecision?.id
    });

    this.currentState = state;
    this.events.push(event);

    if (
      state.sequence % this.snapshotInterval === 0 ||
      state.phase === 'game_over'
    ) {
      this.snapshots.push({
        sequence: state.sequence,
        turn: state.turn,
        stateHash: event.stateHashAfter,
        state: structuredClone(state)
      });
    }

    return { state, event };
  }

  public toReplayFile(): ReplayFile {
    return {
      formatVersion: REPLAY_FORMAT_VERSION,
      engineVersion: ENGINE_VERSION,
      gameId: this.initialState.gameId,
      seed: this.initialState.seed,
      createdAtMs: this.initialState.startedAtMs,
      rules: structuredClone(this.initialState.rules),
      initialState: structuredClone(this.initialState),
      events: structuredClone(this.events),
      snapshots: structuredClone(this.snapshots),
      aiDecisions: structuredClone(this.aiDecisions)
    };
  }
}

/**
 * Reconstructs the exact GameState at `targetSequence` (0 <= targetSequence <= replay.events.length),
 * starting from the nearest preceding snapshot and re-applying subsequent events while verifying hashes.
 */
export function reconstructStateAtSequence(
  replay: ReplayFile,
  targetSequence: number,
  verifyHashes = true
): GameState {
  if (targetSequence < 0 || targetSequence > replay.events.length) {
    throw new Error(
      `Invalid targetSequence ${targetSequence}. Must be between 0 and ${replay.events.length}.`
    );
  }

  if (targetSequence === 0) {
    return structuredClone(replay.initialState);
  }

  // Find latest snapshot with sequence <= targetSequence
  let bestSnapshot: GameSnapshot | undefined;
  for (const snap of replay.snapshots) {
    if (snap.sequence <= targetSequence) {
      if (!bestSnapshot || snap.sequence > bestSnapshot.sequence) {
        bestSnapshot = snap;
      }
    }
  }

  let state = bestSnapshot
    ? structuredClone(bestSnapshot.state)
    : structuredClone(replay.initialState);

  const startSeq = state.sequence;

  for (let seq = startSeq + 1; seq <= targetSequence; seq++) {
    const recordedEvent = replay.events[seq - 1];
    if (!recordedEvent || recordedEvent.sequence !== seq) {
      throw new Error(`Corrupted replay log at sequence ${seq}.`);
    }

    const result = applyAction(state, recordedEvent.playerId, recordedEvent.action, {
      nowMs: recordedEvent.timestampMs,
      aiDecisionId: recordedEvent.aiDecisionId,
      skipValidation: true
    });

    if (verifyHashes && result.event.stateHashAfter !== recordedEvent.stateHashAfter) {
      console.warn(
        `Replay state hash mismatch at sequence ${seq}: expected ${recordedEvent.stateHashAfter}, got ${result.event.stateHashAfter}`
      );
    }

    state = result.state;
  }

  return state;
}

/**
 * Verifies the entire replay file from sequence 0 to the end without using intermediate snapshots,
 * ensuring 100% deterministic reproducibility.
 */
export function verifyReplayDeterminism(replay: ReplayFile): {
  valid: boolean;
  reason?: string;
  totalEvents: number;
} {
  if (replay.formatVersion !== REPLAY_FORMAT_VERSION) {
    return {
      valid: false,
      reason: `Unsupported replay format version: ${replay.formatVersion}`,
      totalEvents: replay.events.length
    };
  }

  let state = structuredClone(replay.initialState);
  for (let i = 0; i < replay.events.length; i++) {
    const ev = replay.events[i]!;
    if (ev.sequence !== i + 1) {
      return {
        valid: false,
        reason: `Out-of-order sequence at index ${i}: expected ${i + 1}, found ${ev.sequence}`,
        totalEvents: replay.events.length
      };
    }

    try {
      const applied = applyAction(state, ev.playerId, ev.action, {
        nowMs: ev.timestampMs,
        aiDecisionId: ev.aiDecisionId,
        skipValidation: true
      });

      if (applied.event.stateHashAfter !== ev.stateHashAfter) {
        return {
          valid: false,
          reason: `Hash mismatch at sequence ${ev.sequence}: expected ${ev.stateHashAfter}, computed ${applied.event.stateHashAfter}`,
          totalEvents: replay.events.length
        };
      }
      state = applied.state;
    } catch (err) {
      return {
        valid: false,
        reason: `Failed to apply action at sequence ${ev.sequence}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        totalEvents: replay.events.length
      };
    }
  }

  return {
    valid: true,
    totalEvents: replay.events.length
  };
}

export function exportReplayJson(replay: ReplayFile, pretty = true): string {
  return JSON.stringify(replay, null, pretty ? 2 : undefined);
}

export function importReplayJson(json: string, strictDeterminism = false): ReplayFile {
  const parsed = JSON.parse(json) as ReplayFile;
  if (!parsed || typeof parsed !== 'object' || !parsed.gameId || !Array.isArray(parsed.events)) {
    throw new Error('Invalid replay file structure.');
  }
  const check = verifyReplayDeterminism(parsed);
  if (!check.valid) {
    if (strictDeterminism) {
      throw new Error(`Replay validation failed: ${check.reason}`);
    } else {
      console.warn(`Replay determinism notice: ${check.reason}`);
    }
  }
  return parsed;
}
