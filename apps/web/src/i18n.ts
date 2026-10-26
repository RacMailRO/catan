import {
  AIDifficulty,
  AIStrategyStyle,
  DevCardType,
  GameAction,
  ParticipantType,
  ResourceType,
  TerrainType,
  TurnPhase
} from '@catan/core';

export type Locale = 'ro' | 'en';

export const TRANSLATIONS = {
  ro: {
    appTitle: 'Catan v2',
    navLobby: 'Lobby & Configurare',
    navGame: 'Partidă Activă',
    navReplay: 'Replay & Analiză AI',
    navBenchmark: 'Simulator & Reguli',
    langToggle: 'EN',
    startGame: 'Pornește Partida',
    quickAiMatch: 'Simulare Rapidă 4 AI',
    participantsTitle: 'Configurare Participanți (1–4 Locuri)',
    addParticipant: '+ Adaugă Loc',
    removeParticipant: 'Elimină',
    rulesTitle: 'Reguli & Opțiuni Partidă',
    vpToWin: 'Puncte de Victorie pentru câștig',
    startingResources: 'Resurse de pornire',
    startingSecondOnly: 'Standard (doar a 2-a așezare)',
    startingBoth: 'Extins (ambele așezări inițiale)',
    knightRule: 'Furt la cartea Cavaler',
    knightSingle: 'Standard (1 adversar ales de pe hexagon)',
    knightAll: 'House-Rule (câte 1 carte de la toți adversarii de pe hexagon)',
    devCardRule: 'Cărți de dezvoltare jucabile pe tură',
    devOneTotal: 'Standard (maxim 1 carte / tură)',
    devOnePerType: 'Extins (maxim 1 carte de fiecare tip / tură)',
    boardLayout: 'Generare Tablă',
    boardBalanced: 'Aleatoriu Echilibrat (fără 6 și 8 adiacente)',
    boardPure: 'Aleatoriu Pur',
    boardBeginner: 'Hartă Fixă Clasică',
    seedLabel: 'Sămânță deterministă (Seed)',
    rollDice: 'Aruncă Zarurile',
    endTurn: 'Încheie Tura',
    buildRoad: 'Drum',
    buildSettlement: 'Așezare',
    buildCity: 'Oraș',
    buyDevCard: 'Dezvoltare',
    tradeBankTitle: 'Comerț Maritim & Bancă',
    tradeP2PTitle: 'Propune Schimb Jucătorilor',
    devCardsTitle: 'Cărțile Tale de Dezvoltare',
    eventLogTitle: 'Jurnalul Partidei',
    openInReplay: 'Analizează în Replay Viewer',
    stepAi: 'Execută Mutare AI',
    autoPlayAi: 'Auto-Play AI',
    pauseAi: 'Pauză AI',
    exportReplay: 'Exportă Replay (.json)',
    importReplay: 'Importă Replay (.json)'
  },
  en: {
    appTitle: 'Catan v2',
    navLobby: 'Lobby & Setup',
    navGame: 'Active Game',
    navReplay: 'Replay & AI Analysis',
    navBenchmark: 'Simulator & Rules',
    langToggle: 'RO',
    startGame: 'Start Game',
    quickAiMatch: 'Quick 4-AI Simulation',
    participantsTitle: 'Configure Participants (1–4 Seats)',
    addParticipant: '+ Add Seat',
    removeParticipant: 'Remove',
    rulesTitle: 'Game Rules & Preset Options',
    vpToWin: 'Victory Points to Win',
    startingResources: 'Starting Resources',
    startingSecondOnly: 'Standard (2nd settlement only)',
    startingBoth: 'Extended (both initial settlements)',
    knightRule: 'Knight Card Steal Rule',
    knightSingle: 'Standard (steal from 1 chosen adjacent opponent)',
    knightAll: 'House-Rule (steal 1 card from ALL adjacent opponents)',
    devCardRule: 'Development Cards Played per Turn',
    devOneTotal: 'Standard (max 1 dev card / turn)',
    devOnePerType: 'Extended (max 1 of each card type / turn)',
    boardLayout: 'Board Layout',
    boardBalanced: 'Balanced Random (no adjacent 6 & 8)',
    boardPure: 'Pure Random',
    boardBeginner: 'Fixed Beginner Layout',
    seedLabel: 'Deterministic Seed',
    rollDice: 'Roll Dice',
    endTurn: 'End Turn',
    buildRoad: 'Road',
    buildSettlement: 'Settlement',
    buildCity: 'City',
    buyDevCard: 'Dev Card',
    tradeBankTitle: 'Bank & Harbor Trade',
    tradeP2PTitle: 'Player-to-Player Trade',
    devCardsTitle: 'Your Development Cards',
    eventLogTitle: 'Game Event Log',
    openInReplay: 'Inspect in Replay Viewer',
    stepAi: 'Step AI Move',
    autoPlayAi: 'Auto-Play AI',
    pauseAi: 'Pause AI',
    exportReplay: 'Export Replay (.json)',
    importReplay: 'Import Replay (.json)'
  }
} as const;

export const RESOURCE_LABELS: Record<Locale, Record<ResourceType, string>> = {
  ro: {
    wood: 'Lemn',
    brick: 'Cărămidă',
    sheep: 'Lână',
    wheat: 'Grâu',
    ore: 'Minereu'
  },
  en: {
    wood: 'Wood',
    brick: 'Brick',
    sheep: 'Sheep',
    wheat: 'Wheat',
    ore: 'Ore'
  }
};

export const RESOURCE_ICONS: Record<ResourceType, string> = {
  wood: '🌲',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛰️'
};

export const TERRAIN_LABELS: Record<Locale, Record<TerrainType, string>> = {
  ro: {
    forest: 'Pădure (Lemn)',
    hills: 'Deal (Cărămidă)',
    pasture: 'Pășune (Lână)',
    fields: 'Câmp (Grâu)',
    mountains: 'Munte (Minereu)',
    desert: 'Deșert'
  },
  en: {
    forest: 'Forest (Wood)',
    hills: 'Hills (Brick)',
    pasture: 'Pasture (Sheep)',
    fields: 'Fields (Wheat)',
    mountains: 'Mountains (Ore)',
    desert: 'Desert'
  }
};

export const DEV_CARD_ICONS: Record<DevCardType, string> = {
  knight: '⚔️',
  road_building: '🛣️',
  year_of_plenty: '🌾',
  monopoly: '💰',
  victory_point: '🏆'
};

export const DEV_CARD_LABELS: Record<Locale, Record<DevCardType, string>> = {
  ro: {
    knight: 'Cavaler (Soldat)',
    road_building: 'Progres: 2 Drumuri Gratuite',
    year_of_plenty: 'Progres: Anul Abundenței',
    monopoly: 'Progres: Monopol',
    victory_point: 'Punct de Victorie (+1 VP)'
  },
  en: {
    knight: 'Knight (Soldier)',
    road_building: 'Progress: Road Building (2 Roads)',
    year_of_plenty: 'Progress: Year of Plenty',
    monopoly: 'Progress: Monopoly',
    victory_point: 'Victory Point (+1 VP)'
  }
};

export const PHASE_LABELS: Record<Locale, Record<TurnPhase, string>> = {
  ro: {
    setup_settlement_1: 'Setup Runda 1: Plasează prima așezare',
    setup_road_1: 'Setup Runda 1: Plasează primul drum conectat',
    setup_settlement_2: 'Setup Runda 2: Plasează a doua așezare',
    setup_road_2: 'Setup Runda 2: Plasează al doilea drum conectat',
    turn_start: 'Început de tură: Aruncă zarurile (sau joacă o carte de dezvoltare)',
    discard_resources: 'Zar 7! Jucătorii cu >7 cărți trebuie să decarteze jumătate',
    move_robber: 'Mută Hoțul pe un alt hexagon',
    steal_resource: 'Alege adversarul de la care furi o resursă',
    road_building_card: 'Carte Progres: Plasează drumurile gratuite',
    main_actions: 'Faza Principală: Comerț, Construcții și Cărți de Dezvoltare',
    game_over: 'Partidă Încheiată!'
  },
  en: {
    setup_settlement_1: 'Setup Round 1: Place 1st Settlement',
    setup_road_1: 'Setup Round 1: Place 1st Road',
    setup_settlement_2: 'Setup Round 2: Place 2nd Settlement',
    setup_road_2: 'Setup Round 2: Place 2nd Road',
    turn_start: 'Turn Start: Roll Dice (or play a Dev Card)',
    discard_resources: 'Rolled 7! Players with >7 cards must discard half',
    move_robber: 'Move the Robber to another hex',
    steal_resource: 'Choose an adjacent opponent to steal from',
    road_building_card: 'Road Building: Place free roads',
    main_actions: 'Main Phase: Trade, Build & Play Development Cards',
    game_over: 'Game Over!'
  }
};

export const PARTICIPANT_TYPE_LABELS: Record<Locale, Record<ParticipantType, string>> = {
  ro: {
    human: 'Om',
    ai: 'AI Algoritmic Local',
    llm: 'AI Experimental LLM (cu Fallback)',
    passive: 'Bot Pasiv / Neutru'
  },
  en: {
    human: 'Human',
    ai: 'Local Algorithmic AI',
    llm: 'Experimental LLM AI (with Fallback)',
    passive: 'Passive / Neutral Bot'
  }
};

export const AI_DIFFICULTY_LABELS: Record<Locale, Record<AIDifficulty, string>> = {
  ro: {
    beginner: 'Nivel 1 — Începător',
    medium: 'Nivel 2 — Mediu',
    advanced: 'Nivel 3 — Avansat',
    expert: 'Nivel 4 — Expert (Monte Carlo)'
  },
  en: {
    beginner: 'Level 1 — Beginner',
    medium: 'Level 2 — Medium',
    advanced: 'Level 3 — Advanced',
    expert: 'Level 4 — Expert (Monte Carlo)'
  }
};

export const AI_STYLE_LABELS: Record<Locale, Record<AIStrategyStyle, string>> = {
  ro: {
    balanced: 'Echilibrat',
    expansion: 'Expansiune',
    development: 'Dezvoltare',
    commercial: 'Comercial',
    competitive: 'Competitiv',
    adaptive: 'Adaptiv'
  },
  en: {
    balanced: 'Balanced',
    expansion: 'Expansion',
    development: 'Development',
    commercial: 'Commercial',
    competitive: 'Competitive',
    adaptive: 'Adaptive'
  }
};

export function formatActionDescription(
  action: GameAction,
  locale: Locale = 'ro',
  details?: Record<string, unknown>
): string {
  const rLabel = RESOURCE_LABELS[locale];
  switch (action.type) {
    case 'place_initial_settlement':
      return locale === 'ro'
        ? `Așezare inițială pe ${action.vertexId}`
        : `Initial settlement at ${action.vertexId}`;
    case 'place_initial_road':
      return locale === 'ro'
        ? `Drum inițial pe ${action.edgeId}`
        : `Initial road on ${action.edgeId}`;
    case 'roll_dice':
      return locale === 'ro' ? 'Aruncare zaruri' : 'Roll dice';
    case 'discard_cards':
      return locale === 'ro' ? 'Decartare resurse (la 7)' : 'Discard resources (on 7)';
    case 'move_robber':
      return locale === 'ro'
        ? `Mută hoțul pe ${action.hexId}${action.targetPlayerId ? ` (țintă ${action.targetPlayerId})` : ''}`
        : `Move robber to ${action.hexId}`;
    case 'steal_from_player':
      return locale === 'ro'
        ? `Fură resursă de la ${action.targetPlayerId}`
        : `Steal resource from ${action.targetPlayerId}`;
    case 'build_road':
      return locale === 'ro' ? `Construiește drum pe ${action.edgeId}` : `Build road on ${action.edgeId}`;
    case 'build_settlement':
      return locale === 'ro'
        ? `Construiește așezare pe ${action.vertexId}`
        : `Build settlement on ${action.vertexId}`;
    case 'build_city':
      return locale === 'ro'
        ? `Modernizează la oraș pe ${action.vertexId}`
        : `Upgrade to city on ${action.vertexId}`;
    case 'buy_dev_card': {
      const drawn = details?.drawnType as DevCardType | undefined;
      if (drawn && DEV_CARD_LABELS[locale]?.[drawn]) {
        const icon = DEV_CARD_ICONS[drawn] ?? '🃏';
        const cardName = DEV_CARD_LABELS[locale][drawn];
        return locale === 'ro'
          ? `Cumpără carte de dezvoltare (${icon} ${cardName})`
          : `Buy development card (${icon} ${cardName})`;
      }
      return locale === 'ro' ? 'Cumpără carte de dezvoltare' : 'Buy development card';
    }
    case 'play_knight':
      return locale === 'ro'
        ? `Joacă Cavaler -> hoț pe ${action.hexId}`
        : `Play Knight -> robber to ${action.hexId}`;
    case 'play_road_building':
      return locale === 'ro' ? 'Joacă Progres: 2 Drumuri Gratuite' : 'Play Road Building';
    case 'place_free_road':
      return locale === 'ro'
        ? `Drum gratuit pe ${action.edgeId}`
        : `Free road on ${action.edgeId}`;
    case 'play_year_of_plenty':
      return locale === 'ro'
        ? `Anul Abundenței (${rLabel[action.resources[0]]} + ${rLabel[action.resources[1]]})`
        : `Year of Plenty (${rLabel[action.resources[0]]} + ${rLabel[action.resources[1]]})`;
    case 'play_monopoly':
      return locale === 'ro'
        ? `Monopol pe ${rLabel[action.resource]}`
        : `Monopoly on ${rLabel[action.resource]}`;
    case 'trade_bank':
      return locale === 'ro'
        ? `Schimb ${action.giveAmount} ${rLabel[action.give]} -> 1 ${rLabel[action.receive]}`
        : `Trade ${action.giveAmount} ${rLabel[action.give]} -> 1 ${rLabel[action.receive]}`;
    case 'propose_trade':
      return locale === 'ro' ? 'Propune ofertă de schimb' : 'Propose trade offer';
    case 'respond_trade':
      return locale === 'ro'
        ? `Răspuns ofertă (${action.response === 'accept' ? 'Acceptă' : 'Refuză'})`
        : `Trade response (${action.response})`;
    case 'cancel_trade':
      return locale === 'ro' ? 'Anulează oferta de schimb' : 'Cancel trade offer';
    case 'end_turn':
      return locale === 'ro' ? 'Încheie tura' : 'End turn';
  }
}
