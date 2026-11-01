import React from 'react';
import { GameEvent, GameState, getPlayerById } from '@catan/core';
import { playerDotStyle, renderResourceTokens } from '../GameAssets';
import { Locale, formatActionDescription } from '../../i18n';

export interface EventLogProps {
  /** Active UI locale, used to format action descriptions. */
  locale: Locale;
  /** Current game state, used to resolve each event's player name/color. */
  gameState: GameState;
  /** Recorded events, newest first (the component reverses the recorder's chronological order). */
  events: readonly GameEvent[];
}

/** Reverse-chronological list of every recorded game action, shown in the event_log
 *  AdaptiveSurface (in-game "Jurnal"). */
export const EventLog: React.FC<EventLogProps> = ({ locale, gameState, events }) => {
  return (
    <div className="event-list">
      {[...events].reverse().map((ev) => {
        const p = getPlayerById(gameState, ev.playerId);
        return (
          <div key={ev.sequence} className="event-item" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderBottom: '1px solid var(--border-color-soft)' }}>
            <span style={{ color: 'var(--accent-gold)', fontSize: '0.78rem', minWidth: 28 }}>T{ev.turn}</span>
            <span style={playerDotStyle(p?.color)} title={p?.name ?? ev.playerId} />
            <span style={{ flex: 1, fontSize: '0.86rem' }}>
              {renderResourceTokens(formatActionDescription(ev.action, locale, ev.details))}
            </span>
          </div>
        );
      })}
    </div>
  );
};
