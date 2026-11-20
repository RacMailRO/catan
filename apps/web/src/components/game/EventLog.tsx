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
  /** Local viewer's player ID so live hidden-card privacy (dev cards drawn, cards stolen) is respected. */
  viewerId?: string;
}

/** Reverse-chronological list of every recorded game action, shown in the event_log
 *  AdaptiveSurface (in-game "Jurnal"). */
export const EventLog: React.FC<EventLogProps> = ({ locale, gameState, events, viewerId }) => {
  const getPlayerName = (id: string) => getPlayerById(gameState, id)?.name ?? id;
  const revealPrivate = gameState.phase === 'game_over';

  return (
    <div className="event-list">
      {[...events].reverse().map((ev) => {
        const p = getPlayerById(gameState, ev.playerId);
        const actorName = p?.name ?? ev.playerId;
        const description = formatActionDescription(ev.action, locale, ev.details, {
          getPlayerName,
          revealPrivate,
          viewerId,
          actorId: ev.playerId
        });
        return (
          <div
            key={ev.sequence}
            className="event-item"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '6px 8px',
              borderBottom: '1px solid var(--border-color-soft)'
            }}
          >
            <span style={{ color: 'var(--accent-gold)', fontSize: '0.78rem', minWidth: 28, paddingTop: 2 }}>
              T{ev.turn}
            </span>
            <span style={{ ...playerDotStyle(p?.color), marginTop: 4 }} title={actorName} />
            <span style={{ flex: 1, fontSize: '0.86rem', lineHeight: 1.35 }}>
              <strong>{actorName}:</strong> {renderResourceTokens(description)}
            </span>
          </div>
        );
      })}
    </div>
  );
};
