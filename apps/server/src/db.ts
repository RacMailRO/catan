import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import {
  GameState,
  ReplayFile,
  calculateScore
} from '@catan/core';
import { LobbyState, ReplaySummaryItem } from '@catan/protocol';

const requireSqlite = createRequire(import.meta.url);
const { DatabaseSync } = requireSqlite('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncType;
};

export interface SessionRecord {
  sessionToken: string;
  lobbyId: string;
  gameId?: string;
  playerId: string;
  playerName: string;
  createdAtMs: number;
}

export class CatanStorage {
  private readonly db: DatabaseSyncType;

  constructor(dbPath = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lobbies (
        lobby_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        invite_code TEXT,
        created_at_ms INTEGER NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY,
        lobby_id TEXT,
        phase TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        replay_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY,
        lobby_id TEXT NOT NULL,
        game_id TEXT,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
    `);
  }

  public saveLobby(lobby: LobbyState): void {
    const stmt = this.db.prepare(`
      INSERT INTO lobbies (lobby_id, status, invite_code, created_at_ms, data_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(lobby_id) DO UPDATE SET
        status = excluded.status,
        invite_code = excluded.invite_code,
        data_json = excluded.data_json
    `);
    stmt.run(
      lobby.lobbyId,
      lobby.status,
      lobby.inviteCode ?? null,
      lobby.createdAtMs,
      JSON.stringify(lobby)
    );
  }

  public getLobby(lobbyId: string): LobbyState | undefined {
    const stmt = this.db.prepare(`SELECT data_json FROM lobbies WHERE lobby_id = ?`);
    const row = stmt.get(lobbyId) as { data_json: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.data_json) as LobbyState;
  }

  public getLobbyByInviteCode(inviteCode: string): LobbyState | undefined {
    const clean = inviteCode.trim().toLowerCase();
    const stmt = this.db.prepare(
      'SELECT data_json FROM lobbies WHERE LOWER(invite_code) = ? OR LOWER(lobby_id) = ?'
    );
    const row = stmt.get(clean, clean) as { data_json: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.data_json);
  }

  public listLobbies(): LobbyState[] {
    const stmt = this.db.prepare(
      `SELECT data_json FROM lobbies ORDER BY created_at_ms DESC LIMIT 50`
    );
    const rows = stmt.all() as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as LobbyState);
  }

  public saveSession(session: SessionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (session_token, lobby_id, game_id, player_id, player_name, created_at_ms)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_token) DO UPDATE SET
        lobby_id = excluded.lobby_id,
        game_id = excluded.game_id,
        player_id = excluded.player_id,
        player_name = excluded.player_name
    `);
    stmt.run(
      session.sessionToken,
      session.lobbyId,
      session.gameId ?? null,
      session.playerId,
      session.playerName,
      session.createdAtMs
    );
  }

  public getSession(sessionToken: string): SessionRecord | undefined {
    const stmt = this.db.prepare(`SELECT * FROM sessions WHERE session_token = ?`);
    const row = stmt.get(sessionToken) as
      | {
          session_token: string;
          lobby_id: string;
          game_id: string | null;
          player_id: string;
          player_name: string;
          created_at_ms: number;
        }
      | undefined;
    if (!row) return undefined;
    return {
      sessionToken: row.session_token,
      lobbyId: row.lobby_id,
      gameId: row.game_id ?? undefined,
      playerId: row.player_id,
      playerName: row.player_name,
      createdAtMs: row.created_at_ms
    };
  }

  public updateSessionsGameId(lobbyId: string, gameId: string): void {
    const stmt = this.db.prepare(`UPDATE sessions SET game_id = ? WHERE lobby_id = ?`);
    stmt.run(gameId, lobbyId);
  }

  public saveGameAndReplay(
    state: GameState,
    replay: ReplayFile,
    lobbyId?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO games (game_id, lobby_id, phase, sequence, updated_at_ms, state_json, replay_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(game_id) DO UPDATE SET
        phase = excluded.phase,
        sequence = excluded.sequence,
        updated_at_ms = excluded.updated_at_ms,
        state_json = excluded.state_json,
        replay_json = excluded.replay_json
    `);
    stmt.run(
      state.gameId,
      lobbyId ?? null,
      state.phase,
      state.sequence,
      Date.now(),
      JSON.stringify(state),
      JSON.stringify(replay)
    );
  }

  public getGameAndReplay(gameId: string): { state: GameState; replay: ReplayFile } | undefined {
    const stmt = this.db.prepare(
      `SELECT state_json, replay_json FROM games WHERE game_id = ?`
    );
    const row = stmt.get(gameId) as { state_json: string; replay_json: string } | undefined;
    if (!row) return undefined;
    return {
      state: JSON.parse(row.state_json) as GameState,
      replay: JSON.parse(row.replay_json) as ReplayFile
    };
  }

  public listReplays(): ReplaySummaryItem[] {
    const stmt = this.db.prepare(
      `SELECT state_json, replay_json FROM games ORDER BY updated_at_ms DESC LIMIT 50`
    );
    const rows = stmt.all() as Array<{ state_json: string; replay_json: string }>;
    return rows.map((row) => {
      const state = JSON.parse(row.state_json) as GameState;
      const replay = JSON.parse(row.replay_json) as ReplayFile;
      return {
        gameId: replay.gameId,
        seed: replay.seed,
        createdAtMs: replay.createdAtMs,
        turns: state.turn,
        eventsCount: replay.events.length,
        winnerId: state.winnerId,
        players: state.players.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          color: p.color,
          score: calculateScore(state, p.id).totalScore
        }))
      };
    });
  }

  public close(): void {
    this.db.close();
  }
}
