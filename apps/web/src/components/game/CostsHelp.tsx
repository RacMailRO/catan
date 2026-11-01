import React from 'react';
import { ALL_RESOURCES, BUILDING_COSTS, ResourceCount } from '@catan/core';
import { ResourceIcon } from '../GameAssets';
import { Locale } from '../../i18n';

export interface CostsHelpProps {
  /** Active UI locale, used for labels. */
  locale: Locale;
  /** Whether the active scenario (in-game) or lobby scenario uses ships, so the Ship row
   *  is included in the costs table. Omit/false when no game is active. */
  hasShipsInScenario: boolean;
}

/** Building-cost and victory-point reference table, built live from BUILDING_COSTS so it
 *  always matches the active rules (rather than a static, single-language reference image). */
export const CostsHelp: React.FC<CostsHelpProps> = ({ locale, hasShipsInScenario }) => {
  // Built from BUILDING_COSTS directly (always matches the real rules, in whatever
  // language is active) rather than a baked-in reference image - cost.jpg had no
  // Romanian or English version, only Spanish ("Carretera", "Poblado"...), which a
  // flat image can't fix per-locale the way every other card in the game already
  // shows translated text: blank/textless art with the label drawn separately.
  const rows: { key: string; label: string; cost: ResourceCount; vp: string }[] = [
    { key: 'road', label: locale === 'ro' ? 'Drum' : 'Road', cost: BUILDING_COSTS.road, vp: '0 VP' },
    ...(hasShipsInScenario
      ? [{ key: 'ship', label: locale === 'ro' ? 'Navă' : 'Ship', cost: BUILDING_COSTS.ship, vp: '0 VP' }]
      : []),
    { key: 'settlement', label: locale === 'ro' ? 'Așezare' : 'Settlement', cost: BUILDING_COSTS.settlement, vp: '1 VP' },
    { key: 'city', label: locale === 'ro' ? 'Oraș' : 'City', cost: BUILDING_COSTS.city, vp: '2 VP' },
    { key: 'dev_card', label: locale === 'ro' ? 'Carte de Dezvoltare' : 'Development Card', cost: BUILDING_COSTS.dev_card, vp: locale === 'ro' ? '? VP (variază)' : '? VP (varies)' }
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((row) => (
        <div
          key={row.key}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-color-soft)',
            borderRadius: 10,
            padding: '0.65rem 1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <strong style={{ fontSize: '1.05rem', color: 'var(--parchment)' }}>
              {row.label}
            </strong>
            <span style={{ color: 'var(--accent-gold)', fontWeight: 800, fontSize: '1.05rem' }}>
              {row.vp}
            </span>
          </div>
          {/* Cards flow left-to-right and wrap as a row of their own, not squeezed by the
              label/VP text sharing the same row - that's what forced one-per-line before. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ALL_RESOURCES.filter((r) => row.cost[r] > 0).map((r) => (
              <div
                key={r}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
                }}
              >
                <ResourceIcon resource={r} height={52} />
                <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff' }}>
                  {row.cost[r]}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 6, padding: '0.45rem', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 6 }}>
        {locale === 'ro'
          ? '🛣️ Drumul cel mai Lung (min. 5 drumuri): +2 VP  ·  ⚔️ Armata cea mai Mare (min. 3 Cavaleri): +2 VP'
          : '🛣️ Longest Road (5+ roads): +2 VP  ·  ⚔️ Largest Army (3+ Knights): +2 VP'}
      </div>
    </div>
  );
};
