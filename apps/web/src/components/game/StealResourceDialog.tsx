import React from 'react';
import { GameState, PlayerView, calculateScore, getPlayerById, totalResourceCount } from '@catan/core';
import { Locale } from '../../i18n';

export interface StealResourceDialogProps {
  /** Active UI locale, used for tooltip copy. */
  locale: Locale;
  /** Current game state, used to resolve the robber's eligible targets. */
  gameState: GameState;
  /** Current player-view snapshot, preferred over gameState directly so a hidden online
   *  opponent's resource/dev-card counts show correctly instead of the local adapter's
   *  zero placeholder. */
  playerView: PlayerView | null;
  /** Steals one resource from the chosen target. */
  onStealFromPlayer: (targetPlayerId: string) => void;
}

/** Target-picker shown in the steal_resource Dialog (post-robber-move, choose who to steal
 *  from) — shows each candidate's VP, resource count, and dev-card count, since the board
 *  behind this modal is dimmed and isn't a usable reference while deciding. */
export const StealResourceDialog: React.FC<StealResourceDialogProps> = ({
  locale,
  gameState,
  playerView,
  onStealFromPlayer
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {(gameState.robberContext?.eligibleTargetIds ?? []).map((tId) => {
        const tp = playerView?.players.find((p) => p.id === tId) ?? getPlayerById(gameState, tId);
        if (!tp) return null;
        const score = 'publicScore' in tp ? (tp.totalScore ?? tp.publicScore) : calculateScore(gameState, tId).publicScore;
        const resCount = 'resourceCount' in tp ? tp.resourceCount : totalResourceCount(tp.resources);
        const devCount = 'devCardCount' in tp ? tp.devCardCount : tp.devCards.filter((c) => !c.played).length;
        return (
          <button
            key={tId}
            type="button"
            className="btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              width: '100%',
              padding: '0.55rem 0.75rem',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-color-soft)',
              textAlign: 'left'
            }}
            onClick={() => onStealFromPlayer(tId)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="color-dot" style={{ backgroundColor: tp.color, width: 12, height: 12 }} />
              <strong>{tp.name}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>{score} VP</span>
              <span title={locale === 'ro' ? 'Cărți de resurse în mână' : 'Resource cards in hand'}>🎴 {resCount}</span>
              <span title={locale === 'ro' ? 'Cărți de dezvoltare nejucate' : 'Unplayed dev cards'}>🃏 {devCount}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
