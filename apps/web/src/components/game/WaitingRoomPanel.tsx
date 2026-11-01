import React from 'react';
import { LobbyState, OnlineSession } from '../../online';

export interface WaitingRoomPanelProps {
  /** The online lobby being waited in (seats, invite code, host id, status). */
  lobby: LobbyState;
  /** The local viewer's online session, used to identify which seat is "mine". */
  session: OnlineSession;
  /** Shares/copies the invite link for the given invite code. */
  onShareInvite: (inviteCode: string) => void;
  /** Whether the local seat's name is currently being edited inline. */
  isRenaming: boolean;
  /** Draft value of the in-progress seat rename. */
  renameDraft: string;
  /** Updates the draft rename value as the player types. */
  onRenameDraftChange: (value: string) => void;
  /** Toggles the inline rename editor for the local seat open/closed. */
  onRenamingChange: (renaming: boolean) => void;
  /** Submits a rename for the given seat with the given name. */
  onRenameSeat: (seatIndex: number, newName: string) => void;
  /** Error message from the most recent online lobby action, if any. */
  error: string | null;
  /** Whether an online lobby action (starting the game) is in flight. */
  busy: boolean;
  /** Starts the game once every seat is filled (host only). */
  onStartGame: () => void;
}

/** Browsable roster plus rename/invite controls shown in the "Sală de Așteptare" AdaptiveSurface
 *  from the moment a lobby is created/joined until the game actually starts. The roster is
 *  polled live (no lobby push yet), and the Start button stays disabled while any seat is
 *  still "open" — the game cannot begin until every intended human has actually joined from
 *  their own device. */
export const WaitingRoomPanel: React.FC<WaitingRoomPanelProps> = ({
  lobby,
  session,
  onShareInvite,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onRenamingChange,
  onRenameSeat,
  error,
  busy,
  onStartGame
}) => {
  return (
    <>
      {lobby.inviteCode && (
        <div className="invite-banner" style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
            <span>
              Cod Partidă:{' '}
              <strong style={{ color: 'var(--accent-gold)', fontSize: '0.95rem' }}>
                {lobby.inviteCode}
              </strong>
            </span>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
              onClick={() => onShareInvite(lobby.inviteCode!)}
            >
              📲 Trimite Link / Invită Prieteni
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.85rem' }}>
        {lobby.seats.map((seat) => (
          <div
            key={seat.seatIndex}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0.4rem 0.6rem',
              borderRadius: 6,
              border: '1px solid var(--border-color)',
              background: seat.type === 'open' ? 'rgba(248, 113, 113, 0.08)' : 'transparent'
            }}
          >
            <span className="color-dot" style={{ backgroundColor: seat.color, width: 11, height: 11 }} />
            {seat.playerId === session.playerId ? (
              isRenaming ? (
                <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={renameDraft}
                    onChange={(e) => onRenameDraftChange(e.target.value)}
                    placeholder="Numele tău"
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.82rem', flex: 1 }}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onRenameSeat(seat.seatIndex, renameDraft);
                      else if (e.key === 'Escape') onRenamingChange(false);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    onClick={() => onRenameSeat(seat.seatIndex, renameDraft)}
                  >
                    💾 Salvează
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                    onClick={() => onRenamingChange(false)}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <strong style={{ color: 'var(--accent-gold)' }}>{seat.name} (Tu)</strong>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem' }}
                    title="Schimbă numele tău"
                    onClick={() => {
                      onRenameDraftChange(seat.name);
                      onRenamingChange(true);
                    }}
                  >
                    ✏️ Schimbă Nume
                  </button>
                </div>
              )
            ) : (
              <strong style={{ flex: 1 }}>{seat.name}</strong>
            )}
            {seat.type === 'open' ? (
              <span style={{ color: 'var(--accent-red, #f87171)', fontSize: '0.78rem' }}>
                ⏳ Așteaptă jucător...
              </span>
            ) : seat.type === 'human' ? (
              <span style={{ color: 'var(--accent-green)', fontSize: '0.78rem' }}>✅ Conectat</span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                🤖 {seat.type.toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
          ⚠️ {error}
        </div>
      )}

      {session.playerId === lobby.hostPlayerId ? (
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={busy || lobby.seats.some((s) => s.type === 'open')}
          onClick={onStartGame}
        >
          {busy
            ? 'Se pornește...'
            : lobby.seats.some((s) => s.type === 'open')
              ? '⏳ Se așteaptă jucătorii...'
              : '🚀 Pornește Partida'}
        </button>
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
          ⏳ Așteptăm ca gazda să înceapă partida...
        </p>
      )}
    </>
  );
};
