import { describe, expect, it } from 'vitest';
import {
  ALL_RESOURCES,
  ParticipantConfig,
  ReplayRecorder,
  createGame,
  createRulesConfig,
  getLegalActions
} from '@catan/core';
import {
  PHASE_LABELS,
  RESOURCE_LABELS,
  TRANSLATIONS,
  formatActionDescription
} from '../../apps/web/src/i18n';
import {
  DEV_CARD_SPRITE_POS,
  RESOURCE_CARD_SPRITE_POS
} from '../../apps/web/src/components/GameAssets';
import {
  buildReplaySummary,
  loadSavedParticipants,
  saveLobbyParticipants,
  loadSavedRules,
  saveLobbyRules,
  loadSavedTimerConfig,
  saveLobbyTimer
} from '../../apps/web/src/storage';

describe('Web UI Localization, Assets & Replay Persistence Integration', () => {
  it('provides complete RO and EN translations for all phases, resources, and actions', () => {
    expect(TRANSLATIONS.ro.appTitle).toContain('Catan');
    expect(TRANSLATIONS.en.appTitle).toContain('Catan');

    for (const r of ALL_RESOURCES) {
      expect(RESOURCE_LABELS.ro[r]).toBeTruthy();
      expect(RESOURCE_LABELS.en[r]).toBeTruthy();
      expect(RESOURCE_CARD_SPRITE_POS[r]).toBeDefined();
    }

    expect(DEV_CARD_SPRITE_POS.knight).toBeDefined();
    expect(DEV_CARD_SPRITE_POS.road_building).toBeDefined();
    expect(DEV_CARD_SPRITE_POS.year_of_plenty).toBeDefined();
    expect(DEV_CARD_SPRITE_POS.monopoly).toBeDefined();
    expect(DEV_CARD_SPRITE_POS.victory_point).toBeDefined();
    expect(DEV_CARD_SPRITE_POS.back).toBeDefined();

    expect(Object.keys(PHASE_LABELS.ro)).toEqual(Object.keys(PHASE_LABELS.en));

    expect(
      formatActionDescription({ type: 'place_initial_settlement', vertexId: 'V10' }, 'ro')
    ).toContain('V10');
    expect(
      formatActionDescription({ type: 'place_initial_settlement', vertexId: 'V10' }, 'en')
    ).toContain('V10');
  });

  it('integrates ReplayRecorder with UI action formatting and replay summary persistence', () => {
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

    const summary = buildReplaySummary(recorder.toReplayFile());
    expect(summary.gameId).toBe('ui-flow-1');
    expect(summary.eventsCount).toBe(12);
    expect(summary.participants).toHaveLength(3);
  });

  it('correctly detects local network origins for Sandbox Test Mode', () => {
    const checkHost = (h: string) => {
      return (
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '[::1]' ||
        h.startsWith('192.168.') ||
        h.startsWith('10.') ||
        h.endsWith('.local')
      );
    };

    expect(checkHost('localhost')).toBe(true);
    expect(checkHost('127.0.0.1')).toBe(true);
    expect(checkHost('192.168.1.15')).toBe(true);
    expect(checkHost('192.168.0.100')).toBe(true);
    expect(checkHost('catan-online.com')).toBe(false);
    expect(checkHost('45.33.32.156')).toBe(false);
  });

  it('excludes ships from player box pieces in classic scenario and includes them in seafarers', () => {
    const classicState = createGame({
      gameId: 'classic-box-test',
      seed: 'seed-box',
      participants: [
        { id: 'p1', name: 'J1', type: 'human' },
        { id: 'p2', name: 'J2', type: 'ai' },
        { id: 'p3', name: 'J3', type: 'ai' }
      ]
    });
    const classicPlayer = classicState.players[0]!;
    expect(classicPlayer.remainingPieces.ships).toBeUndefined();

    const getPlayerPills = (p: typeof classicPlayer) => [
      ['settlements', '🏠'],
      ['cities', '🏰'],
      ['roads', '🛣️'],
      ...(p.remainingPieces.ships !== undefined ? [['ships', '⛵']] : [])
    ];

    expect(getPlayerPills(classicPlayer)).toHaveLength(3);
    expect(getPlayerPills(classicPlayer).map(([k]) => k)).toEqual(['settlements', 'cities', 'roads']);

    const seafarersState = createGame({
      gameId: 'seafarers-box-test',
      seed: 'seed-box-sf',
      rules: { boardScenario: 'seafarers_shores' },
      participants: [
        { id: 'p1', name: 'J1', type: 'human' },
        { id: 'p2', name: 'J2', type: 'ai' },
        { id: 'p3', name: 'J3', type: 'ai' }
      ]
    });
    const seafarersPlayer = seafarersState.players[0]!;
    expect(seafarersPlayer.remainingPieces.ships).toBe(15);
    expect(getPlayerPills(seafarersPlayer)).toHaveLength(4);
    expect(getPlayerPills(seafarersPlayer).map(([k]) => k)).toEqual(['settlements', 'cities', 'roads', 'ships']);
  });

  it('persists and restores lobby participants, rules, scenarios, and timer in localStorage', () => {
    const memoryStorage: Record<string, string> = {};
    const fakeLocalStorage = {
      getItem: (k: string) => memoryStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        memoryStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete memoryStorage[k];
      },
      clear: () => {
        for (const k of Object.keys(memoryStorage)) delete memoryStorage[k];
      }
    };
    (globalThis as any).window = { localStorage: fakeLocalStorage };

    const defaultParticipants: ParticipantConfig[] = [
      { id: 'p1', name: 'Dana', type: 'human', color: 'red' },
      { id: 'p2', name: 'Bot 1', type: 'ai', color: 'blue', aiDifficulty: 'advanced', aiStyle: 'expansion' }
    ];

    // Initial load returns defaults when empty
    expect(loadSavedParticipants(defaultParticipants)).toEqual(defaultParticipants);

    // Save customized participants
    const customParticipants: ParticipantConfig[] = [
      { id: 'p1', name: 'Dana', type: 'human', color: 'orange' },
      { id: 'p2', name: 'Adversar Expert', type: 'ai', color: 'green', aiDifficulty: 'expert', aiStyle: 'adaptive' },
      { id: 'p3', name: 'Adversar Comercial', type: 'ai', color: 'blue', aiDifficulty: 'medium', aiStyle: 'commercial' }
    ];
    saveLobbyParticipants(customParticipants);
    expect(loadSavedParticipants(defaultParticipants)).toEqual(customParticipants);

    // Rules & Scenario persistence
    const defaultRules = createRulesConfig();
    expect(loadSavedRules(defaultRules).boardScenario).toBe('classic');

    const customRules = createRulesConfig({
      boardScenario: 'seafarers_shores',
      startingResourcesRule: 'both_settlements',
      victoryPointsToWin: 12,
      knightStealRule: 'all_adjacent',
      devCardsPerTurnRule: 'one_per_type'
    });
    saveLobbyRules(customRules);
    const restoredRules = loadSavedRules(defaultRules);
    expect(restoredRules.boardScenario).toBe('seafarers_shores');
    expect(restoredRules.startingResourcesRule).toBe('both_settlements');
    expect(restoredRules.victoryPointsToWin).toBe(12);

    // Timer persistence
    expect(loadSavedTimerConfig()).toBeNull();
    saveLobbyTimer(true, 45);
    expect(loadSavedTimerConfig()).toEqual({ enabled: true, sec: 45 });
  });
});
