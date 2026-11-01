import React from 'react';
import { PlayerState } from '@catan/core';

export interface StartingOrderRoll {
  playerId: string;
  die1: number;
  die2: number;
  total: number;
}

export interface StartingOrderProps {
  /** Every player in the match, used to resolve each roll's name/color. */
  players: PlayerState[];
  /** Each player's opening 2d6 roll, highest-first — the order that decided who starts. */
  rolls: StartingOrderRoll[];
  /** Called when the player dismisses the surface ("Să Începem!" button). */
  onClose: () => void;
}

/** Each player's opening 2d6 roll, highest goes first — shown once at game start in the
 *  starting_order AdaptiveSurface. */
export const StartingOrder: React.FC<StartingOrderProps> = ({ players, rolls, onClose }) => {
  return (
    <>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Fiecare jucător a dat cu zarurile; cel mai mare total începe jocul.
      </p>
      {rolls.map((roll, idx) => {
        const p = players.find((pl) => pl.id === roll.playerId);
        if (!p) return null;
        return (
          <div
            key={roll.playerId}
            className="candidate-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderColor: idx === 0 ? 'var(--accent-gold)' : undefined,
              background: idx === 0 ? 'rgba(184, 134, 63, 0.14)' : undefined
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                className="color-dot"
                style={{ backgroundColor: p.color }}
              />
              <strong>
                {idx + 1}. {p.name}
              </strong>
              {idx === 0 && (
                <span style={{ color: 'var(--accent-gold-bright)', fontWeight: 700, fontSize: '0.78rem' }}>
                  Începe primul
                </span>
              )}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              {roll.die1} + {roll.die2} = {roll.total}
            </span>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', marginTop: '0.75rem', justifyContent: 'center' }}
        onClick={onClose}
      >
        Să Începem!
      </button>
    </>
  );
};
