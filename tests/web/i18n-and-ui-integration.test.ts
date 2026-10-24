import { describe, expect, it } from 'vitest';
import {
  ALL_RESOURCES,
  ReplayRecorder,
  createGame,
  getLegalActions
} from '@catan/core';
import {
  PHASE_LABELS,
  RESOURCE_LABELS,
  TRANSLATIONS,
  formatActionDescription
} from '../../apps/web/src/i18n';

describe('Web UI Localization & End-to-End Flow Integration', () => {
  it('provides complete RO and EN translations for all phases, resources, and actions', () => {
    expect(TRANSLATIONS.ro.appTitle).toContain('Catan');
    expect(TRANSLATIONS.en.appTitle).toContain('Catan');

    for (const r of ALL_RESOURCES) {
      expect(RESOURCE_LABELS.ro[r]).toBeTruthy();
      expect(RESOURCE_LABELS.en[r]).toBeTruthy();
    }

    expect(Object.keys(PHASE_LABELS.ro)).toEqual(Object.keys(PHASE_LABELS.en));

    expect(
      formatActionDescription({ type: 'place_initial_settlement', vertexId: 'V10' }, 'ro')
    ).toContain('V10');
    expect(
      formatActionDescription({ type: 'place_initial_settlement', vertexId: 'V10' }, 'en')
    ).toContain('V10');
  });

  it('integrates ReplayRecorder with UI action formatting across setup and turn 1', () => {
    const state = createGame({
      gameId: 'ui-flow-1',
      seed: 'ui-seed-1',
      participants: [
        { id: 'p1', name: 'Jucător 1', type: 'human', color: 'red' },
        { id: 'p2', name: 'Bot 1', type: 'ai', color: 'blue' }
      ]
    });

    // 2 participants configured -> automatically expanded to 3 with passive bot
    expect(state.players).toHaveLength(3);

    const recorder = new ReplayRecorder(state, 10);
    while (recorder.getState().phase !== 'turn_start') {
      const cur = recorder.getState();
      const legal = getLegalActions(cur, cur.activePlayerId);
      const formatted = formatActionDescription(legal[0]!, 'ro');
      expect(formatted.length).toBeGreaterThan(3);
      recorder.recordAndApply(cur.activePlayerId, legal[0]!);
    }

    expect(recorder.getState().turn).toBe(1);
    expect(recorder.getEvents()).toHaveLength(12);
  });
});
