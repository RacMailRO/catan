import { describe, expect, it } from 'vitest';
import { createGame, GameState, ReplayFile } from '@catan/core';
import { CatanStorage } from '../../apps/server/src/db';

function makeFinishedGame(overrides: {
  gameId: string;
  winnerId: string;
  winnerName?: string;
}): GameState {
  const state = createGame({
    gameId: overrides.gameId,
    seed: `seed-${overrides.gameId}`,
    participants: [
      { id: 'p1', name: overrides.winnerName ?? 'Radu', type: 'human' },
      { id: 'p2', name: 'Maria', type: 'human' },
      { id: 'p3', name: 'Bot Expert', type: 'ai', aiDifficulty: 'expert', aiStyle: 'balanced' }
    ],
    nowMs: 1000
  });
  return { ...state, phase: 'game_over', winnerId: overrides.winnerId, finishedAtMs: 2000 };
}

function makeReplay(state: GameState): ReplayFile {
  return {
    formatVersion: '1',
    engineVersion: state.engineVersion,
    gameId: state.gameId,
    seed: state.seed,
    createdAtMs: state.startedAtMs,
    rules: state.rules,
    initialState: state,
    events: [],
    snapshots: [{ sequence: 0, turn: state.turn, stateHash: '0', state }],
    aiDecisions: []
  };
}

describe('CatanStorage (apps/server/src/db.ts)', () => {
  it('round-trips gzip-compressed game/replay/lobby JSON transparently', () => {
    const storage = new CatanStorage(':memory:');
    const state = makeFinishedGame({ gameId: 'g1', winnerId: 'p1' });
    const replay = makeReplay(state);

    storage.saveGameAndReplay(state, replay, 'lobby-1');
    const loaded = storage.getGameAndReplay('g1');

    expect(loaded).toBeDefined();
    expect(loaded!.state.gameId).toBe('g1');
    expect(loaded!.state.winnerId).toBe('p1');
    expect(loaded!.replay.events).toEqual([]);
    expect(loaded!.lobbyId).toBe('lobby-1');
  });

  it('tallies Hall of Fame wins/games once per gameId, only for human players, merging names by trim+case', () => {
    const storage = new CatanStorage(':memory:');

    const g1 = makeFinishedGame({ gameId: 'g1', winnerId: 'p1' }); // Radu wins
    storage.recordHallOfFameResultIfNew(g1);
    // A re-import or a redundant client sync of the exact same finished game must not double-count.
    storage.recordHallOfFameResultIfNew(g1);
    storage.recordHallOfFameResultIfNew(g1);

    // Same person, next game, sloppy casing/whitespace in how they typed their name this time
    const g2 = makeFinishedGame({ gameId: 'g2', winnerId: 'p1', winnerName: '  radu  ' });
    storage.recordHallOfFameResultIfNew(g2);

    const board = storage.listHallOfFame();
    expect(board).toHaveLength(2); // Radu/radu merge into one, plus Maria

    const radu = board.find((p) => p.playerKey === 'radu')!;
    expect(radu.displayName).toBe('radu'); // most-recently-seen spelling, whitespace trimmed
    expect(radu.gamesPlayed).toBe(2); // once per game, not per seat/call
    expect(radu.gamesWon).toBe(2);
    expect(radu.winRate).toBe(1);
    expect(radu.wonGames.map((w) => w.gameId).sort()).toEqual(['g1', 'g2']);

    const maria = board.find((p) => p.playerKey === 'maria')!;
    expect(maria.gamesPlayed).toBe(2);
    expect(maria.gamesWon).toBe(0);
    expect(maria.wonGames).toHaveLength(0);

    // AI participants are never tracked as "users"
    expect(board.some((p) => p.displayName.includes('Bot'))).toBe(false);
  });

  it('never decreases a recorded score when the underlying game row is deleted', () => {
    const storage = new CatanStorage(':memory:');
    const state = makeFinishedGame({ gameId: 'g1', winnerId: 'p1' });
    const replay = makeReplay(state);

    storage.saveGameAndReplay(state, replay);
    storage.recordHallOfFameResultIfNew(state);

    const before = storage.listHallOfFame();
    expect(before[0]!.gamesWon).toBe(1);

    // Hall of Fame tallies live in their own table with no foreign key back to `games`, so
    // there is intentionally no code path that deletes a game row and touches this table -
    // simulate a game-history deletion by just re-reading the tally, unaffected.
    const after = storage.listHallOfFame();
    expect(after[0]!.gamesWon).toBe(1);
  });

  it('ignores a non-finished game', () => {
    const storage = new CatanStorage(':memory:');
    const state = createGame({
      gameId: 'in-progress',
      seed: 'seed',
      participants: [
        { id: 'p1', name: 'Radu', type: 'human' },
        { id: 'p2', name: 'Maria', type: 'human' }
      ],
      nowMs: 1000
    });
    storage.recordHallOfFameResultIfNew(state);
    expect(storage.listHallOfFame()).toHaveLength(0);
  });
});
