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

  it('formats detailed event descriptions (dice, production, robber/pirate steals, dev cards, trades) with privacy rules', () => {
    const names: Record<string, string> = { p1: 'Andrei', p2: 'Bot Elena', p3: 'Bot Radu' };
    const getPlayerName = (id: string) => names[id] ?? id;

    // 1. Dice roll + production + 7
    const rollText = formatActionDescription(
      { type: 'roll_dice' },
      'ro',
      {
        dice: { die1: 4, die2: 2, total: 6 },
        production: {
          p1: { wood: 2, sheep: 1 },
          p2: {}
        }
      },
      { getPlayerName, actorId: 'p1' }
    );
    expect(rollText).toContain('4 + 2 = 6');
    expect(rollText).toContain('Andrei: +2 Lemn, +1 Oaie');

    const rollSevenText = formatActionDescription(
      { type: 'roll_dice' },
      'ro',
      { dice: { die1: 3, die2: 4, total: 7 } },
      { getPlayerName, actorId: 'p1' }
    );
    expect(rollSevenText).toContain('3 + 4 = 7');
    expect(rollSevenText).toContain('Hoțul / Piratul se mută');

    // 2. Move robber / pirate & steal privacy
    const stealThirdParty = formatActionDescription(
      { type: 'move_robber', hexId: 'H5', targetPlayerId: 'p2' },
      'ro',
      { movedPiece: 'robber', stolenFrom: 'p2', stolenResource: 'ore' },
      { getPlayerName, revealPrivate: false, viewerId: 'p3', actorId: 'p1' }
    );
    expect(stealThirdParty).toContain('hoțul pe H5');
    expect(stealThirdParty).toContain('Bot Elena');
    expect(stealThirdParty).not.toContain('Piatră');

    const stealVictimView = formatActionDescription(
      { type: 'play_knight', hexId: 'H12', targetPlayerId: 'p2' },
      'ro',
      { movedPiece: 'pirate', stolenFrom: 'p2', stolenResource: 'ore' },
      { getPlayerName, revealPrivate: false, viewerId: 'p2', actorId: 'p1' }
    );
    expect(stealVictimView).toContain('Cavaler');
    expect(stealVictimView).toContain('piratul pe H12');
    expect(stealVictimView).toContain('1 Piatră de la Bot Elena');

    // 3. Buy dev card privacy
    const devHidden = formatActionDescription(
      { type: 'buy_dev_card' },
      'ro',
      { drawnType: 'victory_point' },
      { getPlayerName, revealPrivate: false, viewerId: 'p3', actorId: 'p1' }
    );
    expect(devHidden).toBe('🃏 Cumpără o carte de dezvoltare');

    const devSelf = formatActionDescription(
      { type: 'buy_dev_card' },
      'ro',
      { drawnType: 'victory_point' },
      { getPlayerName, revealPrivate: false, viewerId: 'p1', actorId: 'p1' }
    );
    expect(devSelf).toContain('Punct de Victorie');

    // 4. Discard cards, trade proposal, and Monopoly breakdown
    const discardText = formatActionDescription(
      { type: 'discard_cards', resources: { wood: 2, brick: 1 } },
      'ro',
      { discarded: { wood: 2, brick: 1 } },
      { getPlayerName, actorId: 'p2' }
    );
    expect(discardText).toContain('3 cărți');
    expect(discardText).toContain('2 Lemn, 1 Cărămidă');

    const proposeText = formatActionDescription(
      { type: 'propose_trade', toPlayerId: 'p2', offering: { wood: 1 }, requesting: { sheep: 1 } },
      'ro',
      undefined,
      { getPlayerName, actorId: 'p1' }
    );
    expect(proposeText).toContain('către Bot Elena');
    expect(proposeText).toContain('1 Lemn');
    expect(proposeText).toContain('1 Oaie');

    const monopolyText = formatActionDescription(
      { type: 'play_monopoly', resource: 'wheat' },
      'ro',
      { totalTaken: 3, takenByPlayer: { p2: 2, p3: 1 } },
      { getPlayerName, actorId: 'p1' }
    );
    expect(monopolyText).toContain('Monopol pe Grâu');
    expect(monopolyText).toContain('+3 cărți confiscate: 2 de la Bot Elena, 1 de la Bot Radu');
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
