import React from 'react';
import { ALL_RESOURCES, PlayerState, ResourceType } from '@catan/core';
import { ResourceCardSprite } from '../GameAssets';
import { Locale, RESOURCE_LABELS } from '../../i18n';

export interface PlayMonopolyDialogProps {
  /** Active UI locale, used for labels and bilingual copy. */
  locale: Locale;
  /** The player playing the card, whose own hand counts are shown on each resource tile. */
  activePlayer: PlayerState;
  /** Resource currently selected to monopolize. */
  selectedResource: ResourceType;
  /** Updates the selected resource. */
  onSelectResource: (resource: ResourceType) => void;
}

/** Resource picker shown in the play_monopoly Dialog; the confirm button lives in App.tsx's
 *  Dialog `footer` prop alongside the rest of the wrapper. */
export const PlayMonopolyDialog: React.FC<PlayMonopolyDialogProps> = ({
  locale,
  activePlayer,
  selectedResource,
  onSelectResource
}) => {
  return (
    <>
      <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '0.85rem' }}>
        {locale === 'ro'
          ? 'Alege resursa pe care dorești să o confunzi/confiști de la toți ceilalți jucători. Toți adversarii vor fi obligați să-ți cedeze toate cărțile de acest tip pe care le au în mână!'
          : 'Choose the resource to monopolize. All opponents will be forced to yield all cards of this resource in their hand!'}
      </p>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
        {ALL_RESOURCES.map((r) => {
          const isSelected = selectedResource === r;
          return (
            <div
              key={r}
              onClick={() => onSelectResource(r)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: 8,
                border: isSelected ? '2px solid var(--accent-gold)' : '2px solid rgba(255,255,255,0.12)',
                background: isSelected ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255,255,255,0.04)',
                transform: isSelected ? 'scale(1.06)' : 'scale(1)',
                transition: 'all 0.15s ease'
              }}
            >
              <ResourceCardSprite
                resource={r}
                count={activePlayer.resources[r] ?? 0}
                locale={locale}
                size="sm"
                selected={isSelected}
              />
              <span
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  marginTop: 5,
                  color: isSelected ? 'var(--accent-gold)' : 'inherit'
                }}
              >
                {RESOURCE_LABELS[locale][r]} {isSelected ? '✓' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
};
