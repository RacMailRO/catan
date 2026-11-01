import React from 'react';
import { ALL_RESOURCES, BUILDING_COSTS, ResourceCount, ResourceType } from '@catan/core';
import { ResourceIcon } from '../GameAssets';
import { Locale } from '../../i18n';

export interface ResourceCostBadgeProps {
  resource: ResourceType;
  amount: number;
  locale?: Locale;
}

/**
 * Reusable single-cost pill showing resource card graphic and required count.
 */
export const ResourceCostBadge: React.FC<ResourceCostBadgeProps> = ({ resource, amount, locale = 'ro' }) => (
  <div className="inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-black/25 px-2 py-0.5 shadow-sm flex-shrink-0">
    <ResourceIcon resource={resource} height={28} locale={locale} />
    <span className="text-sm font-extrabold text-ink">{amount}</span>
  </div>
);

export interface CostItemRowProps {
  label: string;
  vp: string;
  cost: ResourceCount;
  locale: Locale;
}

/**
 * Reusable single-building cost row with title, VP reward, and single-row resource tokens.
 */
export const CostItemRow: React.FC<CostItemRowProps> = ({ label, vp, cost, locale }) => (
  <div className="flex flex-col gap-1 rounded-lg border border-line bg-surfaceMuted/50 px-3 py-2 transition-colors hover:border-amber-400/40">
    <div className="flex items-center justify-between">
      <strong className="text-sm font-bold text-ink">{label}</strong>
      <span className="text-xs font-extrabold text-amber-500 sm:text-sm">{vp}</span>
    </div>
    {/* All resource costs guaranteed on ONE single row, no wrapping */}
    <div className="flex flex-row flex-nowrap items-center gap-2 overflow-x-auto py-0.5">
      {ALL_RESOURCES.filter((r) => cost[r] > 0).map((r) => (
        <ResourceCostBadge key={r} resource={r} amount={cost[r]} locale={locale} />
      ))}
    </div>
  </div>
);

export interface CostsHelpProps {
  /** Active UI locale, used for labels. */
  locale: Locale;
  /** Whether the active scenario uses ships, so the Ship row is included. */
  hasShipsInScenario: boolean;
}

/** Building-cost and victory-point reference table, built live from BUILDING_COSTS so it
 *  always matches the active rules. Compact single-row layout that fits without scrolling. */
export const CostsHelp: React.FC<CostsHelpProps> = ({ locale, hasShipsInScenario }) => {
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
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <CostItemRow
          key={row.key}
          label={row.label}
          vp={row.vp}
          cost={row.cost}
          locale={locale}
        />
      ))}
      <div className="mt-1 rounded-md bg-black/20 px-2.5 py-1.5 text-center text-xs text-inkSoft">
        {locale === 'ro'
          ? '🛣️ Drumul cel mai Lung (min. 5): +2 VP  ·  ⚔️ Armata cea mai Mare (min. 3 Cavaleri): +2 VP'
          : '🛣️ Longest Road (5+): +2 VP  ·  ⚔️ Largest Army (3+ Knights): +2 VP'}
      </div>
    </div>
  );
};
