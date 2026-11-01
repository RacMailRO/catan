import React from 'react';
import { BoardScenario } from '@catan/core';
import { Locale, SCENARIO_LABELS, getScenarioRules } from '../../i18n';

export interface FullRulesProps {
  /** Active UI locale, used to pick which language's rule text/scenario label to show. */
  locale: Locale;
  /** The board scenario whose rules should be displayed (active game's scenario if one is
   *  in progress, otherwise the lobby's currently-selected scenario). */
  scenario: BoardScenario;
}

/** Official rulebook, reachable from the lobby's card gallery button (and from in-game),
 *  for players who have never played Catan and want to learn before/during their first game. */
export const FullRules: React.FC<FullRulesProps> = ({ locale, scenario }) => {
  const scenarioLabel = SCENARIO_LABELS[scenario]?.[locale] ?? scenario;
  const scenarioSections = getScenarioRules(scenario, locale);

  return (
    <>
      <small style={{ color: 'var(--accent-gold)', fontSize: '0.8rem', display: 'block', marginBottom: '0.75rem' }}>
        {scenarioLabel}
      </small>
      {scenarioSections.map((section) => (
        <div key={section.title} className="rules-section" style={{ marginBottom: '1.25rem' }}>
          <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.4rem', fontSize: '0.95rem' }}>{section.title}</h4>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.5', fontSize: '0.85rem' }}>
            {section.body.map((line, idx) => (
              <li key={idx} style={{ marginBottom: '0.35rem' }}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
};
