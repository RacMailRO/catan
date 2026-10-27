import {
  BoardScenario,
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

// Short form of DEV_CARD_LABELS for small card sprites (xs/sm) — the full descriptive label
// (e.g. "Progres: Anul Abundenței") just gets CSS-ellipsised down to 3-4 illegible characters
// at that width, which read as blank rather than translated.
export const DEV_CARD_SHORT_LABELS: Record<Locale, Record<DevCardType, string>> = {
  ro: {
    knight: 'Cavaler',
    road_building: '2 Drumuri',
    year_of_plenty: 'Abundență',
    monopoly: 'Monopol',
    victory_point: '+1 PV'
  },
  en: {
    knight: 'Knight',
    road_building: '2 Roads',
    year_of_plenty: 'Plenty',
    monopoly: 'Monopoly',
    victory_point: '+1 VP'
  }
};

// One-line, action-oriented explanation of what each dev card actually does when played —
// shown next to the enlarged card art in the lobby gallery, for players learning the game.
export const DEV_CARD_RULE_TEXT: Record<Locale, Record<DevCardType, string>> = {
  ro: {
    knight: 'Mută hoțul pe un hexagon nou și furi 1 carte la întâmplare de la un adversar de pe acel hexagon. Joacă 3 cavaleri pentru a câștiga Armata cea mai Mare (+2 PV).',
    road_building: 'Construiește imediat 2 drumuri gratuite (fără a consuma lemn/cărămidă), oriunde ai putea construi drumuri normal.',
    year_of_plenty: 'Alege 2 resurse, de orice tip, direct din banca jocului, gratuit.',
    monopoly: 'Declară un tip de resursă — toți ceilalți jucători trebuie să îți dea toate cărțile lor de acel tip.',
    victory_point: 'Valorează +1 Punct de Victorie. Rămâne ascunsă adversarilor — se dezvăluie doar la finalul partidei sau când decizi s-o joci.'
  },
  en: {
    knight: 'Move the robber to a new hex and steal 1 random card from an opponent on that hex. Play 3 knights to claim Largest Army (+2 VP).',
    road_building: 'Immediately build 2 free roads (no wood/brick cost), anywhere you could normally build a road.',
    year_of_plenty: 'Take any 2 resource cards, of any type, straight from the bank, for free.',
    monopoly: 'Name one resource type — every other player must hand over all their cards of that type.',
    victory_point: 'Worth +1 Victory Point. Stays hidden from opponents — only revealed at game end or when you choose to play it.'
  }
};

// Full, beginner-friendly rulebook shown in the "Regulile Jocului" modal, organized by section.
export interface RuleSection {
  title: string;
  body: string[];
}

export const FULL_RULES: Record<Locale, RuleSection[]> = {
  ro: [
    {
      title: '🎯 Scopul Jocului',
      body: [
        'Primul jucător care atinge 10 Puncte de Victorie (configurabil) câștigă imediat.',
        'Punctele de Victorie se obțin din: Așezări (1 PV fiecare), Orașe (2 PV fiecare), cărți de Punct de Victorie ascunse, Drumul cel mai Lung (+2 PV) și Armata cea mai Mare (+2 PV).'
      ]
    },
    {
      title: '🏗️ Pregătire & Plasare Inițială',
      body: [
        'Harta e formată din 19 hexagoane de teren (producând resurse) plus hexagoane de ocean cu porturi.',
        'Pe rând, fiecare jucător plasează 2 așezări și 2 drumuri conectate la ele, în ordine normală, apoi inversă (jucătorul 4, 3, 2, 1, 1, 2, 3, 4).',
        'La a 2-a așezare primești imediat resursele hexagoanelor adiacente — acesta este singurul moment din joc în care primești resurse fără să arunci zarul.'
      ]
    },
    {
      title: '🔄 Structura unei Ture',
      body: [
        '1. Aruncă 2 zaruri — suma determină ce hexagoane produc resurse în acea tură.',
        'Dacă suma e 7, nimeni nu primește resurse: toți jucătorii cu peste 7 cărți în mână trebuie să renunțe la jumătate, iar tu muți Hoțul și furi o carte.',
        '2. Faza principală — poți construi, cumpăra cărți de dezvoltare, comercializa cu banca/porturile sau cu ceilalți jucători, în orice ordine, de câte ori ai resurse.',
        '3. Încheie tura — rândul trece la jucătorul următor.'
      ]
    },
    {
      title: '🏠 Construcții & Costuri',
      body: [
        'Drum: 1 Lemn + 1 Cărămidă — conectează așezări, extinde teritoriul. Max 15 drumuri.',
        'Așezare: 1 Lemn + 1 Cărămidă + 1 Lână + 1 Grâu — trebuie plasată la cel puțin 2 intersecții distanță de orice altă așezare/oraș. Max 5 așezări (valorează 1 PV fiecare).',
        'Oraș: 2 Grâu + 3 Minereu — construit prin upgrade-ul unei așezări existente, dublează producția acelui loc. Max 4 orașe (valorează 2 PV fiecare).',
        'Carte de Dezvoltare: 1 Lână + 1 Grâu + 1 Minereu — tragi o carte aleatorie din pachet (Cavaler, Progres sau Punct de Victorie).'
      ]
    },
    {
      title: '🤝 Comerț',
      body: [
        'Cu banca: 4 cărți identice → 1 carte la alegere, oricând în faza ta principală.',
        'Cu un port generic (3:1): 3 cărți identice → 1 carte la alegere, dacă ai o așezare/oraș pe acel port.',
        'Cu un port specializat (2:1): 2 cărți din resursa portului → 1 carte la alegere.',
        'Cu alți jucători: propune un schimb liber (orice combinație) — ei pot accepta, respinge sau contra-propune.'
      ]
    },
    {
      title: '🥷 Hoțul (Robber)',
      body: [
        'Activat de orice 7 aruncat, sau de o carte Cavaler jucată.',
        'Blochează complet producția hexagonului pe care stă — nimeni nu primește resurse de acolo cât timp e Hoțul prezent.',
        'Când îl plasezi, furi 1 carte aleatorie de la un jucător cu o așezare/oraș adiacent hexagonului (dacă are cărți).'
      ]
    },
    {
      title: '🏆 Carduri Speciale (Drumul cel mai Lung & Armata cea mai Mare)',
      body: [
        'Drumul cel mai Lung (+2 PV): primul jucător cu un lanț neîntrerupt de minim 5 drumuri conectate. Dacă altcineva construiește un lanț mai lung, cardul trece la el.',
        'Armata cea mai Mare (+2 PV): primul jucător care joacă 3 cărți Cavaler. Dacă altcineva joacă mai multe, cardul trece la el.'
      ]
    }
  ],
  en: [
    {
      title: '🎯 Goal of the Game',
      body: [
        'The first player to reach 10 Victory Points (configurable) wins immediately.',
        'Victory Points come from: Settlements (1 VP each), Cities (2 VP each), hidden Victory Point cards, Longest Road (+2 VP) and Largest Army (+2 VP).'
      ]
    },
    {
      title: '🏗️ Setup & Initial Placement',
      body: [
        'The board is made of 19 terrain hexes (each producing a resource) plus ocean hexes with harbors.',
        'In turn order, each player places 2 settlements and 2 connected roads — forward order, then reversed (player 4, 3, 2, 1, 1, 2, 3, 4).',
        'Your 2nd settlement immediately grants the resources of its adjacent hexes — the only time in the game you get resources without rolling.'
      ]
    },
    {
      title: '🔄 Turn Structure',
      body: [
        '1. Roll 2 dice — the total decides which hexes produce resources this turn.',
        'On a 7, nobody produces: every player holding more than 7 cards must discard half, and you move the Robber and steal a card.',
        '2. Main phase — build, buy development cards, trade with the bank/harbors or other players, in any order, as many times as your resources allow.',
        '3. End turn — play passes to the next player.'
      ]
    },
    {
      title: '🏠 Buildings & Costs',
      body: [
        'Road: 1 Wood + 1 Brick — connects settlements, extends your territory. Max 15 roads.',
        'Settlement: 1 Wood + 1 Brick + 1 Sheep + 1 Wheat — must be placed at least 2 intersections away from any other settlement/city. Max 5 settlements (worth 1 VP each).',
        'City: 2 Wheat + 3 Ore — built by upgrading an existing settlement, doubling that spot\'s production. Max 4 cities (worth 2 VP each).',
        'Development Card: 1 Sheep + 1 Wheat + 1 Ore — draws a random card from the deck (Knight, Progress, or Victory Point).'
      ]
    },
    {
      title: '🤝 Trading',
      body: [
        'With the bank: 4 identical cards → 1 card of your choice, anytime during your main phase.',
        'At a generic harbor (3:1): 3 identical cards → 1 card of your choice, if you have a settlement/city on that harbor.',
        'At a specialized harbor (2:1): 2 cards of that harbor\'s resource → 1 card of your choice.',
        'With other players: propose any trade you like — they can accept, reject, or counter-offer.'
      ]
    },
    {
      title: '🥷 The Robber',
      body: [
        'Triggered by any roll of 7, or by playing a Knight card.',
        'Completely blocks production on the hex it sits on — nobody gets resources from there while the Robber is present.',
        'When you place it, you steal 1 random card from a player with a settlement/city adjacent to that hex (if they have any).'
      ]
    },
    {
      title: '🏆 Special Cards (Longest Road & Largest Army)',
      body: [
        'Longest Road (+2 VP): the first player with an unbroken chain of at least 5 connected roads. If someone else builds a longer chain, the card transfers to them.',
        'Largest Army (+2 VP): the first player to play 3 Knight cards. If someone else plays more, the card transfers to them.'
      ]
    }
  ]
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
    case 'play_monopoly': {
      const totalTaken = details?.totalTaken as number | undefined;
      const resName = rLabel[action.resource];
      if (totalTaken !== undefined) {
        if (totalTaken > 0) {
          return locale === 'ro'
            ? `Monopol pe ${resName} (+${totalTaken} cărți confiscate)`
            : `Monopoly on ${resName} (+${totalTaken} cards taken)`;
        } else {
          return locale === 'ro'
            ? `Monopol pe ${resName} (0 cărți confiscate - adversarii nu aveau ${resName})`
            : `Monopoly on ${resName} (0 cards taken - opponents had no ${resName})`;
        }
      }
      return locale === 'ro'
        ? `Monopol pe ${resName}`
        : `Monopoly on ${resName}`;
    }
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


export function getScenarioRules(scenario: BoardScenario = 'classic', locale: Locale = 'ro'): RuleSection[] {
  const isRo = locale === 'ro';
  const sections: RuleSection[] = [];

  // 1. Core rules
  sections.push({
    title: isRo ? '🎯 Scopul Jocului' : '🎯 Goal of the Game',
    body: isRo
      ? [
          'Primul jucător care atinge numărul de Puncte de Victorie stabilit pentru scenariu câștigă imediat.',
          'Punctele de Victorie se obțin din: Așezări (1 PV), Orașe (2 PV), cărți de Punct de Victorie (+1 PV), Ruta Comercială / Drumul cel mai Lung (+2 PV) și Armata cea mai Mare (+2 PV).'
        ]
      : [
          'The first player to reach the scenario victory point target wins immediately.',
          'Victory Points come from: Settlements (1 VP), Cities (2 VP), Victory Point cards (+1 VP), Longest Road / Trade Route (+2 VP), and Largest Army (+2 VP).'
        ]
  });

  sections.push({
    title: isRo ? '🏗️ Pregătire & Plasare Inițială' : '🏗️ Setup & Initial Placement',
    body: isRo
      ? [
          'Pe rând, fiecare jucător plasează 2 așezări și 2 drumuri sau corăbii conectate la ele, în ordine normală, apoi inversă (jucătorul 1, 2, 3, 4, apoi 4, 3, 2, 1).',
          'La a 2-a așezare primești imediat resursele hexagoanelor de uscat adiacente — acesta este singurul moment în care primești resurse fără să arunci zarul.',
          'Distanța minimă: o așezare nouă trebuie plasată la cel puțin 2 muchii distanță de orice altă așezare sau oraș.'
        ]
      : [
          'In turn order, each player places 2 settlements and 2 connected roads or ships — forward order, then reversed (players 1, 2, 3, 4, then 4, 3, 2, 1).',
          'Your 2nd settlement immediately grants the starting resources of adjacent land hexes.',
          'Distance rule: any new settlement must be placed at least 2 edges away from any existing settlement or city.'
        ]
  });

  sections.push({
    title: isRo ? '🔄 Structura unei Ture' : '🔄 Turn Structure',
    body: isRo
      ? [
          '1. Aruncarea Zarurilor: suma a 2 zaruri determină hexagoanele care produc resurse în acea tură.',
          'Dacă se dă 7, producția se oprește: toți jucătorii cu peste 7 cărți în mână renunță la jumătate, iar jucătorul activ mută Hoțul pe uscat sau Piratul pe mare și fură 1 resursă.',
          '2. Faza Principală: poți construi drumuri, corăbii, așezări, orașe, cumpăra cărți de dezvoltare și comercializa resurse în orice ordine.',
          '3. Încheierea Turei: predai rândul jucătorului următor.'
        ]
      : [
          '1. Roll Dice: the roll of 2 dice determines which hexes produce resources this turn.',
          'On a roll of 7: all players with over 7 resource cards discard half. The active player moves the Robber (to land) or the Pirate (to sea) and steals 1 card.',
          '2. Main Phase: build roads, ships, settlements, cities, buy development cards, and trade resources in any order.',
          '3. End Turn: pass play to the next player.'
        ]
  });

  sections.push({
    title: isRo ? '🏠 Construcții & Costuri' : '🏠 Buildings & Costs',
    body: isRo
      ? [
          '🛣️ Drum (1 Lemn + 1 Cărămidă): conectează așezări pe muchii de uscat. Max 15 drumuri.',
          '⛵ Corabie (1 Lemn + 1 Lână): navighează pe muchii de apă și coastă. Max 15 corăbii.',
          '🏠 Așezare (1 Lemn + 1 Cărămidă + 1 Lână + 1 Grâu): acordă 1 PV și produce 1 resursă. Max 5 așezări.',
          '🏰 Oraș (2 Grâu + 3 Minereu): upgrade-ul unei așezări, acordă 2 PV și dublează producția (2 resurse). Max 4 orașe.',
          '🃏 Carte de Dezvoltare (1 Lână + 1 Grâu + 1 Minereu): oferă un Cavaler, o carte de Progres sau un Punct de Victorie.'
        ]
      : [
          '🛣️ Road (1 Wood + 1 Brick): connects settlements on land edges. Max 15 roads.',
          '⛵ Ship (1 Wood + 1 Sheep): sails along coastal and open sea edges. Max 15 ships.',
          '🏠 Settlement (1 Wood + 1 Brick + 1 Sheep + 1 Wheat): awards 1 VP and produces 1 resource. Max 5 settlements.',
          '🏰 City (2 Wheat + 3 Ore): upgrades a settlement, awards 2 VP and doubles production (2 resources). Max 4 cities.',
          '🃏 Development Card (1 Sheep + 1 Wheat + 1 Ore): draws a Knight, Progress card, or Victory Point.'
        ]
  });

  sections.push({
    title: isRo ? '🤝 Comerț' : '🤝 Trading',
    body: isRo
      ? [
          'Bancă (4:1): schimbi 4 resurse identice pentru 1 resursă dorită.',
          'Port generic 3:1: schimbi 3 resurse identice pentru 1 resursă dorită dacă deții o așezare pe acel port.',
          'Port specializat 2:1: schimbi 2 resurse specifice pentru 1 resursă dorită.',
          'Comerț între Jucători: schimb liber în faza principală a jucătorului activ.'
        ]
      : [
          'Bank (4:1): trade 4 identical resources for 1 of your choice.',
          'Generic Harbor (3:1): trade 3 identical resources for 1 of your choice if you have a settlement on it.',
          'Specialized Harbor (2:1): trade 2 matching resources for 1 of your choice.',
          'Player Trade: negotiate mutually agreed trades during the active player\'s main phase.'
        ]
  });

  // Seafarers or maritime scenarios
  const isMaritime =
    scenario === 'seafarers_shores' ||
    scenario === 'seafarers_islands' ||
    scenario === 'seafarers_fog' ||
    scenario === 'world_map';

  if (isMaritime) {
    sections.push({
      title: isRo ? '⛵ Navigatori: Flote & Linii Navale' : '⛵ Seafarers: Fleets & Shipping Lines',
      body: isRo
        ? [
            'Corăbiile se construiesc pe muchii care ating apa (coastă sau mare deschisă).',
            'O așezare de coastă permite pornirea atât a unui drum pe uscat, cât și a unei corăbii pe mare.',
            'Linii Navale Deschise: dacă o linie de corăbii nu se încheie într-o așezare/oraș, corabia de la capăt este "deschisă" și poate fi mutată în timpul turei tale în altă poziție legală conectată.',
            'Ruta Comercială cea mai Lungă: înlocuiește Drumul cel mai lung. Adună drumurile și corăbiile conectate continuu printr-o așezare de coastă (minim 5 segmente, +2 PV).'
          ]
        : [
            'Ships are built on edges that border water (coastal or open sea).',
            'A coastal settlement allows connecting both an inland road and an offshore shipping line.',
            'Open Shipping Lines: if a line of ships has an open end (not anchored by a settlement), you can move the end ship to another legal spot during your turn.',
            'Longest Trade Route: replaces Longest Road. Combines continuous roads and ships linked through coastal settlements (minimum 5 segments, +2 VP).'
          ]
    });

    sections.push({
      title: isRo ? '🏴‍☠️ Hoțul & Piratul (Robber & Pirate)' : '🏴‍☠️ Robber & Pirate',
      body: isRo
        ? [
            'În scenariile cu mare există atât Hoțul (🥷), cât și Piratul (🏴‍☠️).',
            'La aruncarea unui 7 sau la jucarea unui Cavaler, alegi să muți fie Hoțul pe un hex de uscat, fie Piratul pe un hex de apă.',
            'Hoțul pe uscat: blochează producția acelui hex și fură o resursă de la o așezare adiacentă.',
            'Piratul pe apă: blochează construirea oricărei corăbii noi și mutarea corăbiilor pe muchiile acelui hex de mare. În plus, fură o resursă de la un jucător cu o corabie pe acel hex.'
          ]
        : [
            'Maritime scenarios feature both the Robber (🥷) on land and the Pirate (🏴‍☠️) at sea.',
            'On a roll of 7 or playing a Knight card, you choose whether to move the Robber (to a land hex) or the Pirate (to a sea hex).',
            'Robber on land: blocks resource production on that hex and steals a resource from an adjacent settlement.',
            'Pirate at sea: blocks ship building and open ship movement on all bordering edges of that sea hex, and steals 1 resource from a player with a ship on that hex.'
          ]
    });

    sections.push({
      title: isRo ? '⭐ Câmpurile de Aur (Gold Fields)' : '⭐ Gold Fields',
      body: isRo
        ? [
            'Hexagoanele de Câmp de Aur sunt bogate în pepite.',
            'Când numărul unui Câmp de Aur este aruncat la zar, fiecare jucător cu o așezare adiacentă primește 1 resursă la liberă alegere din bancă (2 resurse pentru un oraș).'
          ]
        : [
            'Gold Field hexes are rich in nuggets.',
            'When a Gold Field\'s number is rolled, every player with an adjacent settlement takes 1 resource card of their choice from the bank (2 cards for a city).'
          ]
    });

    // Scenario specific goals
    if (scenario === 'seafarers_shores') {
      sections.push({
        title: isRo ? '🏝️ Scenariu: Spre Tărâmuri Noi' : '🏝️ Scenario: Heading for New Shores',
        body: isRo
          ? [
              'Scop victorie: 14 Puncte de Victorie.',
              'Puncte Bonus de Explorare: prima ta așezare fondată pe o insulă mică străină acordă imediat +2 Puncte de Victorie bonus!',
              'Corăbiile pot fi folosite pentru a traversa strâmtoarea dintre insula principală și insulele bogate în aur din nord.'
            ]
          : [
              'Victory condition: 14 Victory Points.',
              'Exploration Bonus Points: the first settlement you build on a foreign small island grants an immediate +2 Victory Points bonus!',
              'Ships are used to cross the sea channel between the main island and the gold-rich northern islands.'
            ]
      });
    } else if (scenario === 'seafarers_islands') {
      sections.push({
        title: isRo ? '🏝️ Scenariu: Cele Patru Insule' : '🏝️ Scenario: The Four Islands',
        body: isRo
          ? [
              'Scop victorie: 13 Puncte de Victorie.',
              'Fiecare jucător începe pe una din insule. Colonizarea de noi insule cu corăbii acordă +2 PV bonus pentru a 2-a și a 3-a insulă colonizată.',
              'Nicio insulă nu conține toate cele 5 resurse, stimulând navigația și comerțul.'
            ]
          : [
              'Victory condition: 13 Victory Points.',
              'Each player begins on an island. Colonizing additional islands with ships awards +2 VP bonus for the 2nd and 3rd colonized island.',
              'No single island contains all 5 resources, encouraging shipping and overseas trade.'
            ]
      });
    } else if (scenario === 'seafarers_fog') {
      sections.push({
        title: isRo ? '🌫️ Scenariu: Insula din Ceață' : '🌫️ Scenario: The Fog Island',
        body: isRo
          ? [
              'Scop victorie: 12 Puncte de Victorie.',
              'Marea conține un banc misterios de ceață. Corăbiile care navighează spre muchiile de ceață descoperă plăcile ascunse, dezvăluind uscat, mare sau câmpuri de aur.',
              'Fiecare descoperire aduce resurse bonus de explorare.'
            ]
          : [
              'Victory condition: 12 Victory Points.',
              'The sea contains an uncharted fog bank. Ships that sail into the fog reveal hidden tiles (land, sea, or gold fields).',
              'Each discovery grants exploration bonus resources.'
            ]
      });
    } else if (scenario === 'world_map') {
      sections.push({
        title: isRo ? '🌍 Scenariu: Harta Lumii' : '🌍 Scenario: World Map',
        body: isRo
          ? [
              'Scop victorie: 14 Puncte de Victorie (până la 6 jucători).',
              'O hartă vastă cu mai multe continente și oceane, aur abundent și oportunități extinse de navigație și rute comerciale.'
            ]
          : [
              'Victory condition: 14 Victory Points (up to 6 players).',
              'A grand map featuring multiple continents and vast oceans, abundant gold fields, and major naval trade route competition.'
            ]
      });
    }
  }

  if (scenario === 'expansion') {
    sections.push({
      title: isRo ? '👥 Extensia 5-6 Jucători' : '👥 5-6 Player Expansion',
      body: isRo
        ? [
            'Scop victorie: 11 Puncte de Victorie.',
            'Faza Specială de Construire (Special Building Phase): la finalul turei oricărui jucător, ceilalți jucători pot construi clădiri sau cumpăra cărți de dezvoltare folosind resursele din mână (fără a putea face schimburi cu banca sau ceilalți jucători).',
            'Ajută la prevenirea acumulării de cărți peste limita de 7 și menține jocul alert.'
          ]
        : [
            'Victory condition: 11 Victory Points.',
            'Special Building Phase: at the end of each player\'s turn, other players may build pieces or buy development cards using cards in their hands (without bank or player trading).',
            'Prevents excessive card buildup over the 7-card discard threshold and keeps gameplay active for all players.'
          ]
    });
  }

  return sections;
}

export const SCENARIO_LABELS: Record<BoardScenario, { ro: string; en: string }> = {
  classic: { ro: 'Standard / Clasic (19 hexuri)', en: 'Standard / Classic (19 hexes)' },
  expansion: { ro: 'Extensie 5-6 Jucători (30 hexuri)', en: '5-6 Player Expansion (30 hexes)' },
  seafarers_shores: { ro: 'Navigatori: Spre Tărâmuri Noi', en: 'Seafarers: Heading for New Shores' },
  seafarers_islands: { ro: 'Navigatori: Cele Patru Insule', en: 'Seafarers: The Four Islands' },
  seafarers_fog: { ro: 'Navigatori: Insula din Ceață', en: 'Seafarers: The Fog Island' },
  world_map: { ro: 'Navigatori: Harta Lumii', en: 'Seafarers: World Map' }
};
