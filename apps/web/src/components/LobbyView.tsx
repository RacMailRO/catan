import React from 'react';
import {
  AIDifficulty,
  AIStrategyStyle,
  ALL_RESOURCES,
  GameRulesConfig,
  PLAYER_COLORS,
  ParticipantConfig,
  PlayerColor
} from '@catan/core';
import { DevCardSprite, ResourceCardSprite } from './GameAssets';
import { LobbyState, OnlineSession } from '../online';
import { DEV_CARD_RULE_TEXT, Locale, TRANSLATIONS } from '../i18n';
import { savePlayerName } from '../storage';

export interface LobbyViewProps {
  /** Active UI locale, used for all Romanian/English copy in this screen. */
  locale: Locale;
  /** The local viewer's online session (if any), used for the "active game" rejoin banner. */
  onlineSession: OnlineSession | null;
  /** Rejoins the in-progress online game referenced by `onlineSession`. */
  onRejoinOnlineGame: () => void;
  /** Clears the local online session (the "Părăsește"/Leave action on the rejoin banner). */
  onLeaveOnlineSession: () => void;
  /** Current value of the "join by invite code" input. */
  joinCodeInput: string;
  /** Updates the join-by-code input value. */
  onJoinCodeInputChange: (value: string) => void;
  /** Current value of the player name used when joining a lobby by code. */
  joinPlayerName: string;
  /** Updates (and persists) the player name used when joining a lobby by code. */
  onJoinPlayerNameChange: (value: string) => void;
  /** Whether a join-by-code request is currently in flight. */
  joinLoading: boolean;
  /** Error message from the most recent join-by-code attempt, if any. */
  joinError: string | null;
  /** Joins a lobby using the current (or an overriding) invite code. */
  onJoinWithCode: (codeOverride?: string) => void;
  /** Currently advertised public lobbies/games polled from the server. */
  publicLobbies: LobbyState[];
  /** Copies a public lobby's invite code and fills it into the join-by-code input. */
  onCopyPublicLobbyCode: (code: string) => void;
  /** Enters spectator mode for the given in-progress game. */
  onSpectate: (gameId: string) => void;
  /** Stops/cancels the given public lobby or game on the server (host-only, with confirmation). */
  onStopLobbyOrGame: (lobby: LobbyState) => void;
  /** Status message from the most recent server action (e.g. "code copied", "game stopped"). */
  serverStatusMsg: string | null;
  /** Configured participants (1-6 seats) for the next game. */
  participants: ParticipantConfig[];
  /** Replaces the participant list (add/remove seat, rename, retype, recolor, AI config). */
  setParticipants: (participants: ParticipantConfig[]) => void;
  /** Index of the participant whose color-swap picker is currently open, if any. */
  colorPickerIdx: number | null;
  /** Opens/closes the color-swap picker for the given participant index. */
  setColorPickerIdx: (idx: number | null) => void;
  /** Swaps the given participant's color with whichever participant currently has it. */
  onSwapColor: (idx: number, color: PlayerColor) => void;
  /** Current game rules configuration (victory points, board scenario, knight/dev-card rules, ...). */
  rules: GameRulesConfig;
  /** Replaces the game rules configuration. */
  setRules: (rules: GameRulesConfig) => void;
  /** Custom RNG seed for the next game (empty string = random). */
  customSeed: string;
  /** Updates the custom RNG seed. */
  onCustomSeedChange: (value: string) => void;
  /** Whether the per-turn countdown timer is enabled. */
  turnTimerEnabled: boolean;
  /** Enables/disables the per-turn countdown timer. */
  setTurnTimerEnabled: (enabled: boolean) => void;
  /** Per-turn countdown duration in seconds, used only when the timer is enabled. */
  turnTimerSec: number;
  /** Updates the per-turn countdown duration. */
  setTurnTimerSec: (sec: number) => void;
  /** Opens the full rulebook modal. */
  onOpenFullRules: () => void;
  /** Whether an online lobby creation request is currently in flight. */
  onlineBusy: boolean;
  /** Error message from the most recent online lobby creation attempt, if any. */
  onlineError: string | null;
  /** Creates a new online lobby from the current participants/rules. */
  onCreateOnlineLobby: () => void;
  /** Runs an instant 4-AI simulated game for the Replay/Analysis tools. */
  onQuickAiSimulation: () => void;
}

/** The "⚙️ Lobby" tab: game rules configuration, participant roster, join-by-code/public-lobby
 *  browsing, and the online lobby create/join actions. Shown before a game has started; once
 *  the player creates or joins an online lobby, App.tsx switches to the waiting-room/game flow. */
export const LobbyView: React.FC<LobbyViewProps> = ({
  locale,
  onlineSession,
  onRejoinOnlineGame,
  onLeaveOnlineSession,
  joinCodeInput,
  onJoinCodeInputChange,
  joinPlayerName,
  onJoinPlayerNameChange,
  joinLoading,
  joinError,
  onJoinWithCode,
  publicLobbies,
  onCopyPublicLobbyCode,
  onSpectate,
  onStopLobbyOrGame,
  serverStatusMsg,
  participants,
  setParticipants,
  colorPickerIdx,
  setColorPickerIdx,
  onSwapColor,
  rules,
  setRules,
  customSeed,
  onCustomSeedChange,
  turnTimerEnabled,
  setTurnTimerEnabled,
  turnTimerSec,
  setTurnTimerSec,
  onOpenFullRules,
  onlineBusy,
  onlineError,
  onCreateOnlineLobby,
  onQuickAiSimulation
}) => {
  const t = TRANSLATIONS[locale];
  const maxPlayers = rules.boardScenario === 'expansion' || rules.boardScenario === 'world_map' ? 6 : 4;

  return (
    <main className="lobby-container">
      {/* Left Panel: 1-4 Configurable Participants & Join by Code */}
      <section className="panel">
        {/* Active Online Game Rejoin Banner */}
        {onlineSession?.gameId && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.14)',
              border: '1px solid var(--accent-blue)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.9rem',
              marginBottom: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap'
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: 'var(--accent-blue)', fontSize: '0.9rem' }}>
                🎮 {locale === 'ro' ? 'Ai o partidă online activă în desfășurare!' : 'You have an active online game!'}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                ID: {onlineSession.gameId} · {locale === 'ro' ? 'Jucător' : 'Player'}: {onlineSession.playerId}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.82rem' }}
                onClick={() => {
                  onRejoinOnlineGame();
                }}
              >
                ▶️ {locale === 'ro' ? 'Reintră în Joc' : 'Rejoin Game'}
              </button>
              <button
                type="button"
                className="btn"
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.82rem' }}
                onClick={() => {
                  onLeaveOnlineSession();
                }}
              >
                ✕ {locale === 'ro' ? 'Părăsește' : 'Leave'}
              </button>
            </div>
          </div>
        )}

        {/* Join by Code / Link Card */}
        <div className="join-game-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontWeight: 700, color: 'var(--accent-gold)', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              🎮 Intră într-o partidă cu Cod de Invitație
            </span>
            {joinCodeInput && (
              <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 700, background: 'rgba(59, 130, 246, 0.15)', padding: '2px 8px', borderRadius: 4 }}>
                ✓ Cod preluat din link!
              </span>
            )}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.65rem',
              alignItems: 'end'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Cod de Invitație:
              </label>
              <input
                type="text"
                placeholder="Cod (ex: CATAN-1234)"
                value={joinCodeInput}
                onChange={(e) => onJoinCodeInputChange(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.48rem 0.65rem',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  borderRadius: 6
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Numele tău de jucător:
              </label>
              <input
                type="text"
                placeholder="Introdu numele tău (ex: Andrei)"
                value={joinPlayerName}
                onChange={(e) => {
                  onJoinPlayerNameChange(e.target.value);
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.48rem 0.65rem',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  borderRadius: 6
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onJoinWithCode()}
              disabled={joinLoading || !joinCodeInput.trim()}
              style={{
                width: '100%',
                padding: '0.52rem 1rem',
                fontWeight: 700,
                fontSize: '0.92rem',
                justifyContent: 'center',
                height: 38,
                boxSizing: 'border-box'
              }}
            >
              {joinLoading ? 'Se conectează...' : '🚀 Intră în Joc'}
            </button>
          </div>
          {joinError && (
            <div style={{ color: '#f87171', fontSize: '0.82rem', marginTop: 8, fontWeight: 600 }}>
              ⚠️ {joinError}
            </div>
          )}
        </div>

        {publicLobbies.length > 0 && (
          <div className="join-game-box" style={{ marginBottom: '0.85rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent-gold)', fontSize: '0.92rem', marginBottom: 8 }}>
              🌐 {locale === 'ro' ? 'Partide Publice Active' : 'Active Public Games'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {publicLobbies
                .filter((l) => l.status !== 'finished')
                .map((l) => {
                  const filledSeats = l.seats.filter((s) => s.type !== 'open').length;
                  const isWaiting = l.status === 'waiting';
                  const openSeats = l.seats.filter((s) => s.type === 'open');
                  const humanSeats = l.seats.filter((s) => s.type === 'human');
                  const aiSeats = l.seats.filter((s) => s.type === 'ai');
                  const hasOpenSeat = openSeats.length > 0;
                  return (
                    <div
                      key={l.lobbyId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.6rem',
                        flexWrap: 'wrap',
                        background: 'var(--bg-inset)',
                        border: '1px solid var(--border-color-soft)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.55rem 0.7rem'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{l.name}</span>
                          {isWaiting && hasOpenSeat && (
                            <span style={{ fontSize: '0.72rem', background: 'rgba(34,197,94,0.18)', color: '#4ade80', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              🟢 {openSeats.length} {openSeats.length === 1 ? (locale === 'ro' ? 'loc liber' : 'open seat') : (locale === 'ro' ? 'locuri libere' : 'open seats')}
                            </span>
                          )}
                          {isWaiting && !hasOpenSeat && (
                            <span style={{ fontSize: '0.72rem', background: 'rgba(245,158,11,0.18)', color: '#f59e0b', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              🚫 {locale === 'ro' ? 'Fără locuri libere' : 'No open seats'}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {isWaiting
                            ? (hasOpenSeat
                                ? (locale === 'ro' ? '⏳ Așteaptă jucători' : '⏳ Waiting for players')
                                : (locale === 'ro' ? `⏳ Așteaptă pornirea de către gazdă (${humanSeats.length} Om, ${aiSeats.length} AI)` : `⏳ Waiting for host to start (${humanSeats.length} Human, ${aiSeats.length} AI)`))
                            : (locale === 'ro' ? '▶️ În desfășurare' : '▶️ In progress')}
                          {' · '}
                          {filledSeats}/{l.seats.length} {locale === 'ro' ? 'locuri' : 'seats'}
                        </span>
                        {l.inviteCode && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.73rem', marginTop: 1 }}>
                            <span style={{ color: 'var(--text-muted)' }}>{locale === 'ro' ? 'Cod invitație:' : 'Invite code:'}</span>
                            <code
                              style={{
                                background: 'rgba(255,255,255,0.08)',
                                padding: '1px 6px',
                                borderRadius: 4,
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                color: 'var(--accent-gold)'
                              }}
                            >
                              {l.inviteCode}
                            </code>
                            <button
                              type="button"
                              title={locale === 'ro' ? 'Copiază codul și completează caseta de alăturare' : 'Copy code and fill join box'}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0 3px',
                                fontSize: '0.85rem'
                              }}
                              onClick={() => {
                                onCopyPublicLobbyCode(l.inviteCode!);
                              }}
                            >
                              📋
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        {isWaiting && hasOpenSeat && l.inviteCode && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                            disabled={joinLoading}
                            onClick={() => onJoinWithCode(l.inviteCode)}
                          >
                            🚀 {locale === 'ro' ? 'Alătură-te' : 'Join'}
                          </button>
                        )}
                        {l.status === 'in_progress' && l.gameId && (
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                            onClick={() => onSpectate(l.gameId!)}
                          >
                            👁️ {locale === 'ro' ? 'Spectează' : 'Spectate'}
                          </button>
                        )}
                        {l.terminationDismissed ? (
                          <span style={{ fontSize: '0.74rem', color: '#4ade80', fontWeight: 600, padding: '0.25rem 0.5rem', background: 'rgba(34,197,94,0.15)', borderRadius: 4 }}>
                            🛡️ {locale === 'ro' ? 'Partidă protejată' : 'Protected'}
                          </span>
                        ) : l.pendingTermination ? (
                          <span style={{ fontSize: '0.74rem', color: '#f59e0b', fontWeight: 600, padding: '0.25rem 0.5rem', background: 'rgba(245,158,11,0.15)', borderRadius: 4 }}>
                            ⏱️ {locale === 'ro' ? 'Confirmare în curs (30s)...' : 'Confirmation pending (30s)...'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                            title={locale === 'ro' ? 'Oprește sau anulează această partidă de pe server' : 'Stop or cancel this game/lobby'}
                            onClick={() => {
                              onStopLobbyOrGame(l);
                            }}
                          >
                            ⏹️ {locale === 'ro' ? 'Oprește' : 'Stop'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexShrink: 0 }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
            👥 {locale === 'ro'
              ? `Configurare Participanți (1–${maxPlayers} Locuri)`
              : `Configure Participants (1–${maxPlayers} Seats)`}
          </h2>
          {participants.length < maxPlayers && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const nextIdx = participants.length + 1;
                const usedColors = new Set(participants.map((p) => p.color));
                const nextColor =
                  PLAYER_COLORS.find((c) => !usedColors.has(c)) ??
                  PLAYER_COLORS[(nextIdx - 1) % PLAYER_COLORS.length]!;
                setParticipants([
                  ...participants,
                  {
                    id: `p${nextIdx}`,
                    name: `Participant ${nextIdx}`,
                    type: 'ai',
                    color: nextColor,
                    aiDifficulty: 'medium',
                    aiStyle: 'balanced'
                  }
                ]);
              }}
            >
              {t.addParticipant}
            </button>
          )}
        </div>

        {participants.length < 3 && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.14)',
              border: '1px solid var(--accent-blue)',
              borderRadius: 8,
              padding: '0.45rem 0.7rem',
              marginBottom: '0.55rem',
              fontSize: '0.78rem',
              flexShrink: 0
            }}
          >
            ℹ️{' '}
            {locale === 'ro'
              ? `Ai selectat ${participants.length} participant(i). Se vor adăuga automat boți neutri/pasivi până la 3 participanți pe tablă.`
              : `You selected ${participants.length} participant(s). Neutral/passive bots will automatically be added up to 3 players.`}
          </div>
        )}

        <div className="panel-scroll">
          {participants.map((p, idx) => {
            const currentColor = p.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
            const activeColors = maxPlayers > 4 ? PLAYER_COLORS : PLAYER_COLORS.slice(0, 4);

            return (
              <div
                key={p.id}
                className="seat-card"
                style={{ borderLeftColor: currentColor }}
              >
                {/* Top Row: Interactive Color Dot (Swap) + Name input + Type Toggle (Om / AI) + Delete */}
                <div className="seat-row-main" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {/* Interactive Color Dot */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="color-dot-btn"
                      title={locale === 'ro' ? 'Click pentru a alege culoarea (schimbă automat culoarea cu celălalt jucător)' : 'Click to choose color (swaps with existing player)'}
                      style={{
                        backgroundColor: currentColor,
                        borderColor: colorPickerIdx === idx ? '#fff' : '#e9dfc4'
                      }}
                      onClick={() => setColorPickerIdx(colorPickerIdx === idx ? null : idx)}
                    />
                    {colorPickerIdx === idx && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '120%',
                          left: 0,
                          zIndex: 60,
                          display: 'flex',
                          gap: 6,
                          padding: '6px 8px',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          boxShadow: '0 4px 14px rgba(0,0,0,0.6)'
                        }}
                      >
                        {activeColors.map((c) => (
                          <button
                            key={c}
                            type="button"
                            title={c.toUpperCase()}
                            style={{
                              backgroundColor: c,
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              border: currentColor === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.4)',
                              transform: currentColor === c ? 'scale(1.2)' : 'none',
                              cursor: 'pointer',
                              padding: 0
                            }}
                            onClick={() => {
                              onSwapColor(idx, c);
                              setColorPickerIdx(null);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Name input */}
                  <input
                    type="text"
                    value={p.name}
                    placeholder={p.type === 'human' ? 'Nume' : 'Nume Bot'}
                    onChange={(e) => {
                      const next = [...participants];
                      next[idx] = { ...p, name: e.target.value };
                      setParticipants(next);
                      if (idx === 0) savePlayerName(e.target.value);
                    }}
                    style={{
                      flex: '1 1 120px',
                      minWidth: 90,
                      fontSize: '0.86rem',
                      padding: '0.35rem 0.55rem'
                    }}
                  />

                  {/* Om / AI Segmented Toggle Pills */}
                  <div className="participant-type-toggle">
                    <button
                      type="button"
                      className={`toggle-pill ${p.type === 'human' ? 'active' : ''}`}
                      onClick={() => {
                        const next = [...participants];
                        next[idx] = { ...p, type: 'human' };
                        setParticipants(next);
                      }}
                    >
                      👤 {locale === 'ro' ? 'Om' : 'Human'}
                    </button>
                    <button
                      type="button"
                      className={`toggle-pill ${p.type !== 'human' ? 'active' : ''}`}
                      onClick={() => {
                        const next = [...participants];
                        next[idx] = {
                          ...p,
                          type: 'ai',
                          aiDifficulty: p.aiDifficulty ?? 'medium',
                          aiStyle: p.aiStyle ?? 'balanced'
                        };
                        setParticipants(next);
                      }}
                    >
                      🤖 AI
                    </button>
                  </div>

                  {/* Delete Seat Button */}
                  {participants.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '0.3rem 0.55rem', fontSize: '0.8rem', flexShrink: 0 }}
                      title={locale === 'ro' ? 'Elimină acest loc' : 'Remove seat'}
                      onClick={() => setParticipants(participants.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* AI Configuration Row (only when AI) */}
                {(p.type === 'ai' || p.type === 'llm') && (
                  <div className="seat-row-ai" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: 4 }}>
                    <div className="form-field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                        {locale === 'ro' ? 'Dificultate' : 'Difficulty'}
                      </label>
                      <select
                        value={p.aiDifficulty ?? 'medium'}
                        style={{ fontSize: '0.82rem', padding: '0.25rem 0.45rem' }}
                        onChange={(e) => {
                          const next = [...participants];
                          next[idx] = { ...p, aiDifficulty: e.target.value as AIDifficulty };
                          setParticipants(next);
                        }}
                      >
                        <option value="beginner">{locale === 'ro' ? 'Începător' : 'Beginner'}</option>
                        <option value="medium">{locale === 'ro' ? 'Mediu' : 'Medium'}</option>
                        <option value="advanced">{locale === 'ro' ? 'Avansat' : 'Advanced'}</option>
                        <option value="expert">{locale === 'ro' ? 'Expert' : 'Expert'}</option>
                      </select>
                    </div>
                    <div className="form-field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                        {locale === 'ro' ? 'Stil Strategic' : 'Strategy Style'}
                      </label>
                      <select
                        value={p.aiStyle ?? 'balanced'}
                        style={{ fontSize: '0.82rem', padding: '0.25rem 0.45rem' }}
                        onChange={(e) => {
                          const next = [...participants];
                          next[idx] = { ...p, aiStyle: e.target.value as AIStrategyStyle };
                          setParticipants(next);
                        }}
                      >
                        <option value="balanced">{locale === 'ro' ? 'Echilibrat' : 'Balanced'}</option>
                        <option value="expansion">{locale === 'ro' ? 'Expansiune' : 'Expansion'}</option>
                        <option value="development">{locale === 'ro' ? 'Dezvoltare' : 'Development'}</option>
                        <option value="commercial">{locale === 'ro' ? 'Comercial' : 'Commercial'}</option>
                        <option value="competitive">{locale === 'ro' ? 'Competitiv' : 'Competitive'}</option>
                        <option value="adaptive">{locale === 'ro' ? 'Adaptiv' : 'Adaptive'}</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Unified Start Buttons & Share Banner — online is the only way to actually play
            (local hot-seat was confusing: it let games start before every intended human
            had a chance to join). "Simulare Rapidă" stays separate — it's an instant 4-AI
            benchmark for the Replay/Analysis tools, not a way to play as a human. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.65rem', flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-primary btn-start-match"
            disabled={onlineBusy}
            onClick={onCreateOnlineLobby}
          >
            🌐 {onlineBusy ? 'Se creează...' : 'Creează Partidă Online'}
          </button>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
            {participants.every((p) => p.type !== 'human')
              ? '👁️ Toți cei 4 participanți sunt AI: partida se va desfășura în Mod Spectator, iar agenții vor construi și plasa totul autonom.'
              : 'Locul 1 ești tu. Orice alt loc marcat „Om” devine un loc liber — ceilalți jucători se alătură de pe propriul dispozitiv cu codul de invitație, înainte să poată începe partida.'}
          </p>
          {onlineError && (
            <div style={{ color: '#f87171', fontSize: '0.78rem' }}>⚠️ {onlineError}</div>
          )}

          <button
            type="button"
            className="btn btn-quick-sim"
            onClick={onQuickAiSimulation}
          >
            ⚡ {t.quickAiMatch} & Analiză
          </button>

          {serverStatusMsg && (
            <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', marginTop: 2 }}>
              {serverStatusMsg}
            </div>
          )}
        </div>
      </section>

      {/* Right Panel: Rules & Visual Card Preview */}
      <section className="panel">
        <h2>📜 {t.rulesTitle}</h2>
        <div className="panel-scroll">
          <div className="form-grid">
            <div className="form-field">
              <label>{t.vpToWin}</label>
              <select
                value={rules.victoryPointsToWin}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    victoryPointsToWin: Number(e.target.value) as 10 | 12 | 14
                  })
                }
              >
                <option value={10}>10 Puncte (Standard)</option>
                <option value={12}>12 Puncte (Extins)</option>
                <option value={14}>14 Puncte (Maraton)</option>
              </select>
            </div>

            <div className="form-field">
              <label>{t.startingResources}</label>
              <select
                value={rules.startingResourcesRule}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    startingResourcesRule: e.target.value as GameRulesConfig['startingResourcesRule']
                  })
                }
              >
                <option value="second_settlement">{t.startingSecondOnly}</option>
                <option value="both_settlements">{t.startingBoth}</option>
              </select>
            </div>

            <div className="form-field">
              <label>{t.knightRule}</label>
              <select
                value={rules.knightStealRule}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    knightStealRule: e.target.value as GameRulesConfig['knightStealRule']
                  })
                }
              >
                <option value="single">{t.knightSingle}</option>
                <option value="all_adjacent">{t.knightAll}</option>
              </select>
            </div>

            <div className="form-field">
              <label>{t.devCardRule}</label>
              <select
                value={rules.devCardsPerTurnRule}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    devCardsPerTurnRule: e.target.value as GameRulesConfig['devCardsPerTurnRule']
                  })
                }
              >
                <option value="one_total">{t.devOneTotal}</option>
                <option value="one_per_type">{t.devOnePerType}</option>
              </select>
            </div>

            <div className="form-field">
              <label>{locale === 'ro' ? 'Variantă Tablă' : 'Board Variant'}</label>
              <select
                value={rules.boardScenario}
                onChange={(e) => {
                  const scenario = e.target.value as GameRulesConfig['boardScenario'];
                  setRules({ ...rules, boardScenario: scenario });
                  if (scenario === 'classic' && participants.length > 4) {
                    setParticipants(participants.slice(0, 4));
                  }
                }}
              >
                <option value="classic">
                  {locale === 'ro' ? '🏝️ Clasică (19 hexagoane, până la 4 jucători)' : 'Classic (19 hexes, up to 4 players)'}
                </option>
                <option value="expansion">
                  {locale === 'ro' ? '🗺️ Extensie 5-6 Jucători (30 hexagoane, până la 6 jucători)' : '5-6 Player Expansion (30 hexes, up to 6 players)'}
                </option>
                <option value="seafarers_shores">
                  {locale === 'ro' ? '⛵ Navigatori: Spre Țărmuri Noi (Arhipelag & Râuri de Aur)' : 'Seafarers: Heading to New Shores (Archipelago & Gold)'}
                </option>
                <option value="seafarers_islands">
                  {locale === 'ro' ? '🏝️ Navigatori: Cele Patru Insule (4 Insule & Rute Maritime)' : 'Seafarers: The Four Islands (4 Islands & Trade Routes)'}
                </option>
                <option value="seafarers_fog">
                  {locale === 'ro' ? '🌫️ Navigatori: Insulele în Ceață (Ape Neexplorate & Aur)' : 'Seafarers: The Fog Island (Uncharted Waters & Gold)'}
                </option>
                <option value="world_map">
                  {locale === 'ro' ? '🌍 Harta Lumii (World Map - Continente, Oceane & Aur)' : 'World Map (Continents, Oceans & Gold)'}
                </option>
              </select>
            </div>

            <div className="form-field">
              <label>{t.boardLayout}</label>
              <input
                type="text"
                readOnly
                value={
                  rules.boardScenario === 'expansion'
                    ? (locale === 'ro'
                        ? 'Spirală Echilibrată (28 jetoane, fără 6 și 8 adiacente)'
                        : 'Balanced Spiral (28 tokens, no adjacent 6s & 8s)')
                    : (locale === 'ro'
                        ? 'Spirala Oficială Regulament (A–R ceasornic)'
                        : 'Official Rulebook Spiral (A–R clockwise)')
                }
                style={{ color: 'var(--accent-gold)', fontWeight: 600 }}
              />
            </div>

            <div className="form-field">
              <label>{t.seedLabel}</label>
              <input
                type="text"
                value={customSeed}
                onChange={(e) => onCustomSeedChange(e.target.value)}
                placeholder="Aleatoriu (lasă liber sau introdu seed fix)"
              />
            </div>

            <div className="form-field">
              <label>⏱️ Cronometru per Tură</label>
              <select
                value={turnTimerEnabled ? String(turnTimerSec) : 'off'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'off') {
                    setTurnTimerEnabled(false);
                  } else {
                    setTurnTimerEnabled(true);
                    setTurnTimerSec(Number(v));
                  }
                }}
              >
                <option value="off">Dezactivat</option>
                <option value="30">30 secunde</option>
                <option value="45">45 secunde</option>
                <option value="60">60 secunde (maxim)</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '0.85rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-gold)' }}>
                {locale === 'ro' ? 'Cărțile Jocului & Ce Fac' : 'Game Cards & What They Do'}
              </div>
              <button
                type="button"
                className="btn"
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                onClick={onOpenFullRules}
              >
                📖 {locale === 'ro' ? 'Regulile Jocului' : 'Full Rules'}
              </button>
            </div>

            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              {locale === 'ro' ? 'Resurse' : 'Resources'}
            </div>
            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
              {ALL_RESOURCES.map((r) => (
                <ResourceCardSprite key={r} resource={r} count={19} locale={locale} size="sm" />
              ))}
            </div>

            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              {locale === 'ro' ? 'Cărți de Dezvoltare' : 'Development Cards'}
            </div>
            <div className="card-gallery-grid">
              {(
                [
                  ['knight', 14],
                  ['victory_point', 5],
                  ['road_building', 2],
                  ['year_of_plenty', 2],
                  ['monopoly', 2]
                ] as const
              ).map(([devCardType, count]) => (
                <div key={devCardType} className="card-gallery-item">
                  <DevCardSprite type={devCardType} count={count} locale={locale} size="sm" />
                  <p className="card-gallery-rule-text">{DEV_CARD_RULE_TEXT[locale][devCardType]}</p>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', margin: '0.75rem 0 0.4rem' }}>
              {locale === 'ro' ? 'Carduri Speciale (fără carte fizică în pachet)' : 'Special Cards (no physical card in the deck)'}
            </div>
            <div className="card-gallery-grid">
              <div className="card-gallery-item">
                <div
                  className="special-card-tile"
                  style={{ backgroundImage: 'url(/special_longest_road.jpg)' }}
                >
                  <span className="special-card-title">{locale === 'ro' ? 'Drumul cel mai Lung' : 'Longest Road'}</span>
                  <span className="special-card-vp">+2 PV</span>
                </div>
                <p className="card-gallery-rule-text">
                  {locale === 'ro'
                    ? 'Primul jucător cu un lanț neîntrerupt de minim 5 drumuri conectate. Trece la alt jucător dacă acesta construiește un lanț mai lung.'
                    : 'The first player with an unbroken chain of at least 5 connected roads. Transfers if someone else builds a longer chain.'}
                </p>
              </div>
              <div className="card-gallery-item">
                <div
                  className="special-card-tile special-card-tile-army"
                  style={{ backgroundImage: 'url(/special_largest_army.jpg)' }}
                >
                  <span className="special-card-title">{locale === 'ro' ? 'Armata cea mai Mare' : 'Largest Army'}</span>
                  <span className="special-card-vp">+2 PV</span>
                </div>
                <p className="card-gallery-rule-text">
                  {locale === 'ro'
                    ? 'Primul jucător care joacă 3 cărți Cavaler. Trece la alt jucător dacă acesta joacă mai multe.'
                    : 'The first player to play 3 Knight cards. Transfers if someone else plays more.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};
