import React from 'react';
import { ALL_RESOURCES, GameState, PlayerState, ResourceType } from '@catan/core';
import { ResourceCardSprite, ResourceIcon } from '../GameAssets';
import { Locale, RESOURCE_LABELS } from '../../i18n';

export interface PlayYearOfPlentyDialogProps {
  /** Active UI locale, used for labels and bilingual copy. */
  locale: Locale;
  /** Current game state, used for the bank-stock counts shown in each resource dropdown. */
  gameState: GameState;
  /** The player playing the card, whose own hand is shown for reference. */
  activePlayer: PlayerState;
  /** The two resources currently selected to take from the bank. */
  selected: [ResourceType, ResourceType];
  /** Updates the selected resource pair. */
  onSelectedChange: (next: [ResourceType, ResourceType]) => void;
  /** Confirms and plays the card with the selected resources. */
  onConfirm: () => void;
}

/** Two-resource picker shown in the play_year_of_plenty Dialog, including the body's own
 *  duplicate confirm button (the Dialog's `footer` prop, owned by App.tsx, has another). */
export const PlayYearOfPlentyDialog: React.FC<PlayYearOfPlentyDialogProps> = ({
  locale,
  gameState,
  activePlayer,
  selected,
  onSelectedChange,
  onConfirm
}) => {
  const [first, second] = selected;

  return (
    <>
      <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '0.6rem' }}>
        {locale === 'ro'
          ? 'Alege 2 resurse gratuite pe care le iei direct din bancă:'
          : 'Choose 2 free resources to take directly from the bank:'}
      </p>

      {/* Own hand, so the choice can factor in what's already held — e.g. no need
          to pick more of a resource already stockpiled. */}
      <div style={{ marginBottom: '0.85rem' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>
          {locale === 'ro' ? '🎴 Cărțile tale în mână:' : '🎴 Your cards in hand:'}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          {ALL_RESOURCES.map((r) => (
            <ResourceCardSprite
              key={r}
              resource={r}
              count={activePlayer.resources[r]}
              locale={locale}
              size="xs"
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {locale === 'ro' ? 'Prima resursă:' : 'First resource:'}
          </span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.25)', padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
            <ResourceIcon resource={first} height={26} />
            <select
              value={first}
              onChange={(e) => onSelectedChange([e.target.value as ResourceType, second])}
              style={{ fontSize: '0.86rem', padding: '0.3rem 0.6rem', margin: 0 }}
            >
              {ALL_RESOURCES.map((r) => (
                <option key={r} value={r}>
                  {RESOURCE_LABELS[locale][r]} ({gameState.bank[r]} în bancă)
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {locale === 'ro' ? 'A doua resursă:' : 'Second resource:'}
          </span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.25)', padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
            <ResourceIcon resource={second} height={26} />
            <select
              value={second}
              onChange={(e) => onSelectedChange([first, e.target.value as ResourceType])}
              style={{ fontSize: '0.86rem', padding: '0.3rem 0.6rem', margin: 0 }}
            >
              {ALL_RESOURCES.map((r) => (
                <option key={r} value={r}>
                  {RESOURCE_LABELS[locale][r]} ({gameState.bank[r]} în bancă)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', padding: '0.6rem', fontWeight: 700 }}
        onClick={onConfirm}
      >
        🎁 Ia {RESOURCE_LABELS[locale][first]} + {RESOURCE_LABELS[locale][second]}
      </button>
    </>
  );
};
