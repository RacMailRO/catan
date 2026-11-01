import React from 'react';
import { ALL_RESOURCES, PlayerState, ResourceCount } from '@catan/core';
import { ResourceCardSprite, amountValueStyle } from '../GameAssets';
import { Locale } from '../../i18n';

export interface DiscardDialogProps {
  /** Active UI locale, used by the resource card sprites. */
  locale: Locale;
  /** The player discarding (App.tsx renders one Dialog per entry in gameState.pendingDiscards,
   *  keyed by player id — this component just shows the picker for whichever one is open). */
  player: PlayerState;
  /** Resources currently staged to discard. */
  selection: ResourceCount;
  /** Replaces the staged discard selection. */
  onSelectionChange: (next: ResourceCount) => void;
}

/** Per-resource +/- picker shown in the discard_resources Dialog (discard-on-7 prompt). */
export const DiscardDialog: React.FC<DiscardDialogProps> = ({ locale, player, selection, onSelectionChange }) => {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
      {ALL_RESOURCES.map((r) => (
        <div key={r} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <ResourceCardSprite
            resource={r}
            count={player.resources[r]}
            locale={locale}
            size="md"
            selected={selection[r] > 0}
          />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              className="btn"
              onClick={() =>
                onSelectionChange({
                  ...selection,
                  [r]: Math.max(0, selection[r] - 1)
                })
              }
            >
              -
            </button>
            <strong style={amountValueStyle(selection[r])}>{selection[r]}</strong>
            <button
              type="button"
              className="btn"
              onClick={() =>
                onSelectionChange({
                  ...selection,
                  [r]: Math.min(player.resources[r], selection[r] + 1)
                })
              }
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
