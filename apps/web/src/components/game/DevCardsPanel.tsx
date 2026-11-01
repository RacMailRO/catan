import React from 'react';
import { DevCardInstance, DevCardType, GameState, PlayerState, canPlayDevCardType } from '@catan/core';
import { DevCardSprite } from '../GameAssets';
import { DEV_CARD_RULE_TEXT, Locale } from '../../i18n';

export interface DevCardsPanelProps {
  /** Active UI locale, used for dev-card rule text. */
  locale: Locale;
  /** Current game state, used to check per-type playability and "bought this turn" status. */
  gameState: GameState;
  /** The active player, whose turn-based playability rules (canPlayDevCardType) gate each card. */
  activePlayer: PlayerState;
  /** Unplayed dev cards belonging to the player whose hand is shown (viewer, or active player offline). */
  unplayedDevCards: DevCardInstance[];
  /** Count of unplayed cards by type, used to group the gallery and show per-type totals. */
  devCardCountsByType: Record<DevCardType, number>;
  /** Whether the local human occupies the active turn (gates whether any card can be played). */
  isHumanTurn: boolean;
  /** Activates knight placement mode (closes this panel). */
  onActivateKnight: () => void;
  /** Plays the Road Building card (closes this panel). */
  onPlayRoadBuilding: () => void;
  /** Opens the Play Monopoly resource picker. */
  onOpenMonopoly: () => void;
  /** Opens the Play Year of Plenty resource picker. */
  onOpenYearOfPlenty: () => void;
}

/** Development-card hand gallery and per-type play actions, shown in the dev_cards
 *  AdaptiveSurface. */
export const DevCardsPanel: React.FC<DevCardsPanelProps> = ({
  locale,
  gameState,
  activePlayer,
  unplayedDevCards,
  devCardCountsByType,
  isHumanTurn,
  onActivateKnight,
  onPlayRoadBuilding,
  onOpenMonopoly,
  onOpenYearOfPlenty
}) => {
  if (unplayedDevCards.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
        Nu ai cărți de dezvoltare nefolosite în mână. Poți cumpăra o carte de dezvoltare (1 Grâu + 1 Oaie + 1 Minereu) în timpul turei tale.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '1rem' }}>
      {(
        [
          'knight',
          'road_building',
          'year_of_plenty',
          'monopoly',
          'victory_point'
        ] as DevCardType[]
      )
        .filter((dt) => devCardCountsByType[dt] > 0)
        .map((dt) => {
          const canPlayThis = isHumanTurn && canPlayDevCardType(gameState, activePlayer, dt);
          const allBoughtThisTurn = unplayedDevCards
            .filter((c) => c.type === dt)
            .every((c) => c.boughtAtTurn === gameState.turn);
          return (
            <div
              key={dt}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 150 }}
            >
              <DevCardSprite
                type={dt}
                locale={locale}
                count={devCardCountsByType[dt]}
                isNew={allBoughtThisTurn && dt !== 'victory_point'}
                canPlay={canPlayThis}
                size="lg"
                actionLabel={
                  dt === 'knight'
                    ? '⚔️ Activează Cavaler'
                    : dt === 'road_building'
                    ? '🛣️ Joacă 2 Drumuri'
                    : dt === 'monopoly'
                    ? '👑 Joacă Monopol'
                    : dt === 'year_of_plenty'
                    ? '🎁 Joacă Anul Abundenței'
                    : undefined
                }
                onPlay={
                  dt === 'knight'
                    ? onActivateKnight
                    : dt === 'road_building'
                    ? onPlayRoadBuilding
                    : dt === 'monopoly'
                    ? onOpenMonopoly
                    : dt === 'year_of_plenty'
                    ? onOpenYearOfPlenty
                    : undefined
                }
              />
              <p className="card-gallery-rule-text" style={{ textAlign: 'center', margin: 0 }}>
                {DEV_CARD_RULE_TEXT[locale][dt]}
              </p>
            </div>
          );
        })}
    </div>
  );
};
