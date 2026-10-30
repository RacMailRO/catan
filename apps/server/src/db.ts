import { createRequire } from 'node:module';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import {
  GameState,
  ReplayFile,
  calculateScore
} from '@catan/core';
import {
  HallOfFamePlayerEntry,
  HallOfFameWonGame,
  LobbyState,
  ReplaySummaryItem
} from '@catan/protocol';

const requireSqlite = createRequire(import.meta.url);
const { DatabaseSync } = requireSqlite('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncType;
};

// Game/replay JSON is highly repetitive (the same key names and small factor/action shapes
// recur thousands of times across snapshots, events and AI decision candidates), so gzip
// routinely shrinks it 5-10x. We store the compressed bytes directly as a BLOB rather than
// base64-in-TEXT to avoid a further ~33% size tax.
function compressJson(value: unknown): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(value), 'utf8'));
}

// Rows written before compression was introduced hold plain JSON text (sqlite is dynamically
// typed, so old TEXT rows and new BLOB rows coexist fine) - detect gzip's magic header and fall
// back to parsing the legacy value directly instead of requiring a migration.
function decompressJson<T>(stored: Buffer | string): T {
  if (typeof stored === 'string') {
    return JSON.parse(stored) as T;
  }
  const isGzip = stored.length >= 2 && stored[0] === 0x1f && stored[1] === 0x8b;
  const json = isGzip ? gunzipSync(stored).toString('utf8') : stored.toString('utf8');
  return JSON.parse(json) as T;
}

function normalizePlayerKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface HofPlayerRow {
  player_key: string;
  display_name: string;
  games_played: number;
  games_won: number;
  won_games_json: Buffer | string;
  updated_at_ms: number;
}

function hofRowToEntry(row: HofPlayerRow): HallOfFamePlayerEntry {
  return {
    playerKey: row.player_key,
    displayName: row.display_name,
    gamesPlayed: row.games_played,
    gamesWon: row.games_won,
    winRate: row.games_played > 0 ? Number((row.games_won / row.games_played).toFixed(4)) : 0,
    updatedAtMs: row.updated_at_ms,
    wonGames: decompressJson<HallOfFameWonGame[]>(row.won_games_json)
  };
}

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
        data_json BLOB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY,
        lobby_id TEXT,
        phase TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        state_json BLOB NOT NULL,
        replay_json BLOB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY,
        lobby_id TEXT NOT NULL,
        game_id TEXT,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      -- Dedupes hall-of-fame counting: a finished game's replay can be (re-)persisted several
      -- times (live play, then the client's own sync-to-server, a manual re-import, ...), but
      -- its win/loss must only ever be tallied once.
      CREATE TABLE IF NOT EXISTS hof_results_recorded (
        game_id TEXT PRIMARY KEY,
        recorded_at_ms INTEGER NOT NULL
      );

      -- Hall of Fame: per-(human)-player win/game tallies, keyed by a normalized name since
      -- there is no login/account system. Deliberately separate from the games table so
      -- deleting a saved game later never changes a player's recorded score.
      CREATE TABLE IF NOT EXISTS hof_players (
        player_key TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        games_played INTEGER NOT NULL DEFAULT 0,
        games_won INTEGER NOT NULL DEFAULT 0,
        won_games_json BLOB NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
    `);
  }

  /**
   * Tallies a finished game's result into the Hall of Fame, once per gameId no matter how many
   * times this (or an equivalent re-imported) replay is persisted. Only human players are
   * tracked - AI/passive bots share fixed names across every game and aren't "users".
   */
  public recordHallOfFameResultIfNew(state: GameState): void {
    if (state.phase !== 'game_over') return;
    const dup = this.db.prepare(`SELECT 1 FROM hof_results_recorded WHERE game_id = ?`).get(state.gameId);
    if (dup) return;
    this.db
      .prepare(`INSERT INTO hof_results_recorded (game_id, recorded_at_ms) VALUES (?, ?)`)
      .run(state.gameId, Date.now());

    const humanPlayers = state.players.filter((p) => p.type === 'human');
    for (const player of humanPlayers) {
      const key = normalizePlayerKey(player.name);
      if (!key) continue;
      const won = state.winnerId === player.id;
      const existing = this.getHallOfFameEntry(key);
      const wonGames = existing?.wonGames ?? [];
      if (won) {
        wonGames.unshift({
          gameId: state.gameId,
          turns: state.turn,
          finishedAtMs: state.finishedAtMs ?? Date.now(),
          opponentNames: humanPlayers.filter((p) => p.id !== player.id).map((p) => p.name.trim())
        });
        if (wonGames.length > 200) wonGames.length = 200;
      }
      const stmt = this.db.prepare(`
        INSERT INTO hof_players (player_key, display_name, games_played, games_won, won_games_json, updated_at_ms)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_key) DO UPDATE SET
          display_name = excluded.display_name,
          games_played = excluded.games_played,
          games_won = excluded.games_won,
          won_games_json = excluded.won_games_json,
          updated_at_ms = excluded.updated_at_ms
      `);
      stmt.run(
        key,
        player.name.trim(),
        (existing?.gamesPlayed ?? 0) + 1,
        (existing?.gamesWon ?? 0) + (won ? 1 : 0),
        compressJson(wonGames),
        Date.now()
      );
    }
  }

  private getHallOfFameEntry(playerKey: string): HallOfFamePlayerEntry | undefined {
    const stmt = this.db.prepare(`SELECT * FROM hof_players WHERE player_key = ?`);
    const row = stmt.get(playerKey) as HofPlayerRow | undefined;
    if (!row) return undefined;
    return hofRowToEntry(row);
  }

  public listHallOfFame(): HallOfFamePlayerEntry[] {
    const stmt = this.db.prepare(
      `SELECT * FROM hof_players ORDER BY games_won DESC, games_played ASC, display_name ASC`
    );
    const rows = stmt.all() as unknown as HofPlayerRow[];
    return rows.map(hofRowToEntry);
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
      compressJson(lobby)
    );
  }

  public getLobby(lobbyId: string): LobbyState | undefined {
    const stmt = this.db.prepare(`SELECT data_json FROM lobbies WHERE lobby_id = ?`);
    const row = stmt.get(lobbyId) as { data_json: Buffer | string } | undefined;
    if (!row) return undefined;
    return decompressJson<LobbyState>(row.data_json);
  }

  public getLobbyByInviteCode(inviteCode: string): LobbyState | undefined {
    const clean = inviteCode.trim().toLowerCase();
    const stmt = this.db.prepare(
      'SELECT data_json FROM lobbies WHERE LOWER(invite_code) = ? OR LOWER(lobby_id) = ?'
    );
    const row = stmt.get(clean, clean) as { data_json: Buffer | string } | undefined;
    if (!row) return undefined;
    return decompressJson<LobbyState>(row.data_json);
  }

  public listLobbies(): LobbyState[] {
    const stmt = this.db.prepare(
      `SELECT data_json FROM lobbies ORDER BY created_at_ms DESC LIMIT 50`
    );
    const rows = stmt.all() as Array<{ data_json: Buffer | string }>;
    return rows.map((r) => decompressJson<LobbyState>(r.data_json));
  }

  public getLobbyByGameId(gameId: string): LobbyState | undefined {
    const lobbies = this.listLobbies();
    return lobbies.find((l) => l.gameId === gameId);
  }

  public markLobbyFinished(lobbyIdOrGameId: string): void {
    let lobby = this.getLobby(lobbyIdOrGameId);
    if (!lobby) {
      lobby = this.getLobbyByGameId(lobbyIdOrGameId);
    }
    if (lobby && lobby.status !== 'finished') {
      lobby.status = 'finished';
      this.saveLobby(lobby);
    }
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
      compressJson(state),
      compressJson(replay)
    );
  }

  public getGameAndReplay(gameId: string): { state: GameState; replay: ReplayFile; lobbyId?: string } | undefined {
    const stmt = this.db.prepare(
      `SELECT lobby_id, state_json, replay_json FROM games WHERE game_id = ?`
    );
    const row = stmt.get(gameId) as
      | { lobby_id?: string | null; state_json: Buffer | string; replay_json: Buffer | string }
      | undefined;
    if (!row) return undefined;
    return {
      lobbyId: row.lobby_id ?? undefined,
      state: decompressJson<GameState>(row.state_json),
      replay: decompressJson<ReplayFile>(row.replay_json)
    };
  }

  public listReplays(): ReplaySummaryItem[] {
    const stmt = this.db.prepare(
      `SELECT state_json, replay_json FROM games ORDER BY updated_at_ms DESC LIMIT 50`
    );
    const rows = stmt.all() as Array<{ state_json: Buffer | string; replay_json: Buffer | string }>;
    return rows.map((row) => {
      const state = decompressJson<GameState>(row.state_json);
      const replay = decompressJson<ReplayFile>(row.replay_json);
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
