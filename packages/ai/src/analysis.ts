import {
  AICandidateEvaluation,
  AIDecisionRecord,
  AIStrategyStyle,
  GameAction,
  PlayerColor,
  ReplayFile,
  calculateScore,
  getLegalActions,
  getPlayerView,
  reconstructStateAtSequence
} from '@catan/core';
import { evaluateCandidateAction } from './evaluator';

export interface StepDecisionComparison {
  sequence: number;
  turn: number;
  playerId: string;
  playerName: string;
  actualAction: GameAction;
  actualScore: number;
  bestAlternativeAction: GameAction;
  bestAlternativeScore: number;
  scoreGap: number;
  isOptimal: boolean;
  recordedAIDecision?: AIDecisionRecord;
  evaluatedAlternatives: AICandidateEvaluation[];
}

export interface PlayerGameAnalysisSummary {
  playerId: string;
  playerName: string;
  finalScore: number;
  totalActions: number;
  optimalDecisionsCount: number;
  suboptimalDecisionsCount: number;
  averageDecisionGap: number;
  biggestMistakes: StepDecisionComparison[];
}

export interface PlayerTurnScorePoint {
  turn: number;
  sequence: number;
  score: number;
  settlements: number;
  cities: number;
  longestRoad: boolean;
  largestArmy: boolean;
}

export interface PlayerStrategicProfile {
  playerId: string;
  playerName: string;
  color: PlayerColor;
  aiStyle?: string;
  aiDifficulty?: string;
  finalScore: number;
  isWinner: boolean;
  scoreBreakdown: {
    settlements: number;
    cities: number;
    longestRoad: number;
    largestArmy: number;
    victoryPointCards: number;
  };
  initialPlacement: {
    vertexIds: string[];
    numbers: number[];
    totalPips: number;
    resourceDiversity: number;
    resources: string[];
    analysisText: string;
  };
  ports: {
    firstPortTurn: number | null;
    firstPortType: string | null;
    harborsAcquired: Array<{ turn: number; sequence: number; type: string; vertexId: string }>;
    bankTradesCount: number;
    portTradesCount: number;
  };
  trading: {
    tradesProposed: number;
    tradesAccepted: number;
    tradesRejected: number;
    successfulP2pTrades: number;
  };
  devCards: {
    bought: number;
    playedKnights: number;
    playedRoadBuilding: number;
    playedYearOfPlenty: number;
    playedMonopoly: number;
    hiddenVpCards: number;
    hasLargestArmy: boolean;
  };
  coverage: {
    uniqueHexCount: number;
    uniqueNumbers: number[];
    diceHitsCount: number;
    diceHitRatePct: number;
  };
  economy: {
    totalResourcesProduced: number;
    avgResourcesPerTurn: number;
    resourcesDiscardedOn7: number;
    resourcesStolenFromOthers: number;
    resourcesStolenByOthers: number;
  };
  scoreTimeline: PlayerTurnScorePoint[];
  strategyVerdict: string;
  keyWinFactors: string[];
}

export interface GameKeyMilestone {
  turn: number;
  sequence: number;
  title: string;
  description: string;
  playerId: string;
  type: 'settlement' | 'city' | 'port' | 'largest_army' | 'longest_road' | 'win';
}

export interface ReplayStrategicReport {
  gameId: string;
  totalTurns: number;
  totalEvents: number;
  winnerId: string | null;
  winnerName: string | null;
  winningReason: string;
  diceHistogram: Record<number, number>;
  playerSummaries: Record<string, PlayerGameAnalysisSummary>;
  playerProfiles: Record<string, PlayerStrategicProfile>;
  milestones: GameKeyMilestone[];
  timelineData: Array<{ turn: number; sequence: number; [playerId: string]: any }>;
}

const PIPS_MAP: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1
};

const TERRAIN_TO_RES: Record<string, string> = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'sheep',
  fields: 'wheat',
  mountains: 'ore'
};

/**
 * Evaluates a specific step (`sequence`, 1-based) in a `ReplayFile`, comparing the move that was actually
 * chosen by the participant (human or AI) against all legal alternatives visible at that exact moment (`PlayerView`).
 */
export function analyzeDecisionAtSequence(
  replay: ReplayFile,
  sequence: number,
  referenceStyle: AIStrategyStyle = 'balanced'
): StepDecisionComparison {
  if (sequence < 1 || sequence > replay.events.length) {
    throw new Error(`Sequence ${sequence} out of bounds (1..${replay.events.length})`);
  }

  const stateBefore = reconstructStateAtSequence(replay, sequence - 1, false);
  const event = replay.events[sequence - 1]!;
  const playerId = event.playerId;
  const player = stateBefore.players.find((p) => p.id === playerId);
  const viewBefore = getPlayerView(stateBefore, playerId);

  const legal = getLegalActions(stateBefore, playerId);
  const style = player?.aiStyle ?? referenceStyle;

  const evaluated = legal
    .map((act) => evaluateCandidateAction(viewBefore, playerId, act, style))
    .sort((a, b) => b.score - a.score);

  const actualEval = evaluateCandidateAction(viewBefore, playerId, event.action, style);
  const bestAlt = evaluated[0] ?? actualEval;
  const scoreGap = Number(Math.max(0, bestAlt.score - actualEval.score).toFixed(3));

  const recordedAIDecision = event.aiDecisionId
    ? replay.aiDecisions.find((d) => d.id === event.aiDecisionId)
    : undefined;

  return {
    sequence,
    turn: event.turn,
    playerId,
    playerName: player?.name ?? playerId,
    actualAction: event.action,
    actualScore: actualEval.score,
    bestAlternativeAction: bestAlt.action,
    bestAlternativeScore: bestAlt.score,
    scoreGap,
    isOptimal: scoreGap <= 0.5,
    recordedAIDecision,
    evaluatedAlternatives: evaluated.slice(0, 8)
  };
}

/**
 * Generates a full post-game strategic analysis report from a ReplayFile,
 * computing development progression over time, initial placement pips,
 * harbor acquisitions, trading effectiveness, and key win factors.
 */
export function analyzeReplayGame(replay: ReplayFile): ReplayStrategicReport {
  const diceHistogram: Record<number, number> = {
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
    10: 0,
    11: 0,
    12: 0
  };

  const finalState = reconstructStateAtSequence(replay, replay.events.length, false);
  const board = replay.initialState.board;

  // Map vertexId -> harbor type
  const vToHarbor: Record<string, string> = {};
  for (const h of board.harbors ?? []) {
    for (const vId of h.vertexIds) {
      vToHarbor[vId] = h.type;
    }
  }

  // Determine winner (if finalState.winnerId is not set, compute player with highest score)
  let winnerId = finalState.winnerId;
  let highestScore = -1;
  const computedScores: Record<string, { publicScore: number; totalScore: number }> = {};
  for (const p of finalState.players) {
    const s = calculateScore(finalState, p.id);
    computedScores[p.id] = s;
    if (s.totalScore > highestScore) {
      highestScore = s.totalScore;
      if (!finalState.winnerId) {
        winnerId = p.id;
      }
    }
  }

  const winnerPlayer = finalState.players.find((p) => p.id === winnerId);
  const winnerName = winnerPlayer?.name ?? (winnerId ? `Jucător ${winnerId}` : 'Nedecis');

  // Initialize profiles
  const playerProfiles: Record<string, PlayerStrategicProfile> = {};
  const playerSummaries: Record<string, PlayerGameAnalysisSummary> = {};
  const gapsByPlayer: Record<string, number[]> = {};

  for (const p of finalState.players) {
    const sc = computedScores[p.id]!;
    gapsByPlayer[p.id] = [];
    playerSummaries[p.id] = {
      playerId: p.id,
      playerName: p.name,
      finalScore: sc.totalScore,
      totalActions: 0,
      optimalDecisionsCount: 0,
      suboptimalDecisionsCount: 0,
      averageDecisionGap: 0,
      biggestMistakes: []
    };

    const settlementsBuilt = 5 - p.remainingPieces.settlements;
    const citiesBuilt = 4 - p.remainingPieces.cities;
    const devVp = p.devCards ? p.devCards.filter((c) => c.type === 'victory_point').length : 0;
    const hasLongestRoad = finalState.longestRoadOwnerId === p.id;
    const hasLargestArmy = finalState.largestArmyOwnerId === p.id;

    playerProfiles[p.id] = {
      playerId: p.id,
      playerName: p.name,
      color: p.color,
      aiStyle: p.aiStyle,
      aiDifficulty: p.aiDifficulty,
      finalScore: sc.totalScore,
      isWinner: p.id === winnerId,
      scoreBreakdown: {
        settlements: settlementsBuilt,
        cities: citiesBuilt * 2,
        longestRoad: hasLongestRoad ? 2 : 0,
        largestArmy: hasLargestArmy ? 2 : 0,
        victoryPointCards: devVp
      },
      initialPlacement: {
        vertexIds: [],
        numbers: [],
        totalPips: 0,
        resourceDiversity: 0,
        resources: [],
        analysisText: ''
      },
      ports: {
        firstPortTurn: null,
        firstPortType: null,
        harborsAcquired: [],
        bankTradesCount: 0,
        portTradesCount: 0
      },
      trading: {
        tradesProposed: 0,
        tradesAccepted: 0,
        tradesRejected: 0,
        successfulP2pTrades: 0
      },
      devCards: {
        bought: 0,
        playedKnights: 0,
        playedRoadBuilding: 0,
        playedYearOfPlenty: 0,
        playedMonopoly: 0,
        hiddenVpCards: devVp,
        hasLargestArmy
      },
      coverage: {
        uniqueHexCount: 0,
        uniqueNumbers: [],
        diceHitsCount: 0,
        diceHitRatePct: 0
      },
      economy: {
        totalResourcesProduced: 0,
        avgResourcesPerTurn: 0,
        resourcesDiscardedOn7: 0,
        resourcesStolenFromOthers: 0,
        resourcesStolenByOthers: 0
      },
      scoreTimeline: [],
      strategyVerdict: '',
      keyWinFactors: []
    };
  }

  const hexesCoveredByPlayer: Record<string, Set<string>> = {};
  const numbersCoveredByPlayer: Record<string, Set<number>> = {};
  for (const p of finalState.players) {
    hexesCoveredByPlayer[p.id] = new Set();
    numbersCoveredByPlayer[p.id] = new Set();
  }

  const milestones: GameKeyMilestone[] = [];
  let totalDiceRolls = 0;
  let armyClaimed = false;
  let roadClaimed = false;

  // Process all replay events
  for (const ev of replay.events) {
    const pId = ev.playerId;
    const act = ev.action;
    const prof = playerProfiles[pId];

    if (act.type === 'roll_dice' && ev.details.dice) {
      const dice = ev.details.dice as { total: number };
      if (dice.total >= 2 && dice.total <= 12) {
        diceHistogram[dice.total] = (diceHistogram[dice.total] ?? 0) + 1;
        totalDiceRolls++;
      }

      if (ev.details.production) {
        const prod = ev.details.production as Record<string, Record<string, number>>;
        for (const [targetId, resMap] of Object.entries(prod)) {
          const targetProf = playerProfiles[targetId];
          if (targetProf) {
            let rollCount = 0;
            for (const count of Object.values(resMap)) {
              rollCount += count;
            }
            targetProf.economy.totalResourcesProduced += rollCount;
            if (rollCount > 0) {
              targetProf.coverage.diceHitsCount++;
            }
          }
        }
      }
      continue;
    }

    if (!prof) continue;

    if (act.type === 'place_initial_settlement') {
      prof.initialPlacement.vertexIds.push(act.vertexId);
      const vert = board.vertices[act.vertexId];
      if (vert) {
        for (const hId of vert.adjacentHexIds) {
          const hex = board.hexes[hId];
          if (hex && hex.terrain !== 'desert' && hex.numberToken) {
            prof.initialPlacement.numbers.push(hex.numberToken);
            prof.initialPlacement.totalPips += PIPS_MAP[hex.numberToken] ?? 0;
            const res = TERRAIN_TO_RES[hex.terrain];
            if (res && !prof.initialPlacement.resources.includes(res)) {
              prof.initialPlacement.resources.push(res);
            }
            hexesCoveredByPlayer[pId]?.add(hId);
            numbersCoveredByPlayer[pId]?.add(hex.numberToken);
          }
        }
      }
      if (vToHarbor[act.vertexId]) {
        const hType = vToHarbor[act.vertexId]!;
        prof.ports.harborsAcquired.push({
          turn: ev.turn,
          sequence: ev.sequence,
          type: hType,
          vertexId: act.vertexId
        });
        if (prof.ports.firstPortTurn === null) {
          prof.ports.firstPortTurn = ev.turn;
          prof.ports.firstPortType = hType;
        }
      }
    } else if (act.type === 'build_settlement') {
      const vert = board.vertices[act.vertexId];
      if (vert) {
        for (const hId of vert.adjacentHexIds) {
          const hex = board.hexes[hId];
          if (hex && hex.terrain !== 'desert' && hex.numberToken) {
            hexesCoveredByPlayer[pId]?.add(hId);
            numbersCoveredByPlayer[pId]?.add(hex.numberToken);
          }
        }
      }
      if (vToHarbor[act.vertexId]) {
        const hType = vToHarbor[act.vertexId]!;
        prof.ports.harborsAcquired.push({
          turn: ev.turn,
          sequence: ev.sequence,
          type: hType,
          vertexId: act.vertexId
        });
        if (prof.ports.firstPortTurn === null) {
          prof.ports.firstPortTurn = ev.turn;
          prof.ports.firstPortType = hType;
        }
        milestones.push({
          turn: ev.turn,
          sequence: ev.sequence,
          playerId: pId,
          type: 'port',
          title: `Port conectat: ${hType}`,
          description: `${prof.playerName} a conectat portul ${hType} la tura ${ev.turn}`
        });
      }
    } else if (act.type === 'build_city') {
      milestones.push({
        turn: ev.turn,
        sequence: ev.sequence,
        playerId: pId,
        type: 'city',
        title: 'Oraș construit',
        description: `${prof.playerName} a upgradat așezarea în oraș la tura ${ev.turn}`
      });
    } else if (act.type === 'trade_bank') {
      prof.ports.bankTradesCount++;
    } else if (act.type === 'propose_trade') {
      prof.trading.tradesProposed++;
    } else if (act.type === 'respond_trade') {
      if (act.response === 'accept') {
        prof.trading.tradesAccepted++;
        prof.trading.successfulP2pTrades++;
      } else {
        prof.trading.tradesRejected++;
      }
    } else if (act.type === 'buy_dev_card') {
      prof.devCards.bought++;
    } else if (act.type === 'play_knight') {
      prof.devCards.playedKnights++;
      if (prof.devCards.playedKnights >= 3 && !armyClaimed) {
        armyClaimed = true;
        milestones.push({
          turn: ev.turn,
          sequence: ev.sequence,
          playerId: pId,
          type: 'largest_army',
          title: 'Armata Mare revendicată',
          description: `${prof.playerName} a atins 3 cavaleri și a obținut Armata Mare (+2 VP)`
        });
      }
    } else if (act.type === 'play_road_building') {
      prof.devCards.playedRoadBuilding++;
    } else if (act.type === 'play_year_of_plenty') {
      prof.devCards.playedYearOfPlenty++;
    } else if (act.type === 'play_monopoly') {
      prof.devCards.playedMonopoly++;
    } else if (act.type === 'discard_cards') {
      const amt = Object.values(act.resources || {}).reduce((a, b) => a + b, 0);
      prof.economy.resourcesDiscardedOn7 += amt;
    } else if (act.type === 'steal_from_player') {
      prof.economy.resourcesStolenFromOthers++;
      if (playerProfiles[act.targetPlayerId]) {
        playerProfiles[act.targetPlayerId].economy.resourcesStolenByOthers++;
      }
    }

    if (act.type === 'build_road' && !roadClaimed && ev.turn > 10) {
      milestones.push({
        turn: ev.turn,
        sequence: ev.sequence,
        playerId: pId,
        type: 'longest_road',
        title: 'Expansiune Drumuri',
        description: `${prof.playerName} a avansat expansiunea rețelei de drumuri`
      });
      roadClaimed = true;
    }

    // Evaluation for strategic summary
    const summary = playerSummaries[pId];
    if (summary) {
      summary.totalActions++;
      // Selectively evaluate key strategic moves for quick responsiveness
      if (
        summary.totalActions <= 60 &&
        (act.type === 'build_settlement' ||
          act.type === 'build_city' ||
          act.type === 'buy_dev_card' ||
          act.type === 'play_knight' ||
          act.type === 'play_monopoly' ||
          act.type === 'trade_bank')
      ) {
        try {
          const cmp = analyzeDecisionAtSequence(replay, ev.sequence);
          gapsByPlayer[pId]?.push(cmp.scoreGap);
          if (cmp.isOptimal) {
            summary.optimalDecisionsCount++;
          } else {
            summary.suboptimalDecisionsCount++;
            summary.biggestMistakes.push(cmp);
          }
        } catch {
          // ignore transient step boundary error
        }
      }
    }
  }

  // Build timeline progression from periodic snapshots
  const timelineData: Array<{ turn: number; sequence: number; [playerId: string]: any }> = [];
  const maxTurn = Math.max(1, finalState.turn);

  for (const s of replay.snapshots ?? []) {
    const st = s.state;
    const point: { turn: number; sequence: number; [key: string]: any } = {
      turn: st.turn,
      sequence: s.sequence
    };

    for (const p of st.players) {
      let vp = (5 - p.remainingPieces.settlements) * 1 + (4 - p.remainingPieces.cities) * 2;
      if (st.longestRoadOwnerId === p.id) vp += 2;
      if (st.largestArmyOwnerId === p.id) vp += 2;
      const devVp = p.devCards ? p.devCards.filter((c) => c.type === 'victory_point').length : 0;
      const totalVp = vp + devVp;
      point[p.id] = totalVp;

      const prof = playerProfiles[p.id];
      if (prof) {
        prof.scoreTimeline.push({
          turn: st.turn,
          sequence: s.sequence,
          score: totalVp,
          settlements: 5 - p.remainingPieces.settlements,
          cities: 4 - p.remainingPieces.cities,
          longestRoad: st.longestRoadOwnerId === p.id,
          largestArmy: st.largestArmyOwnerId === p.id
        });
      }
    }
    timelineData.push(point);
  }

  // Ensure initial and final points exist in timeline
  if (timelineData.length === 0 || timelineData[0]?.turn !== 0) {
    const initPoint: any = { turn: 0, sequence: 0 };
    for (const p of finalState.players) initPoint[p.id] = 2;
    timelineData.unshift(initPoint);
  }

  // Calculate final coverage and economy averages
  for (const pId of Object.keys(playerProfiles)) {
    const prof = playerProfiles[pId]!;
    const hexes = hexesCoveredByPlayer[pId] ?? new Set();
    const nums = numbersCoveredByPlayer[pId] ?? new Set();
    prof.coverage.uniqueHexCount = hexes.size;
    prof.coverage.uniqueNumbers = Array.from(nums).sort((a, b) => a - b);
    prof.coverage.diceHitRatePct =
      totalDiceRolls > 0 ? Math.round((prof.coverage.diceHitsCount / totalDiceRolls) * 100) : 0;

    prof.economy.avgResourcesPerTurn =
      maxTurn > 0 ? Number((prof.economy.totalResourcesProduced / maxTurn).toFixed(2)) : 0;

    // Initial placement analysis
    const pips = prof.initialPlacement.totalPips;
    const resCount = prof.initialPlacement.resources.length;
    prof.initialPlacement.resourceDiversity = resCount;
    prof.initialPlacement.analysisText =
      pips >= 20
        ? `Start excelent (${pips} pips, ${resCount}/5 resurse): producție masivă de la debut.`
        : pips >= 16
          ? `Start solid (${pips} pips, ${resCount}/5 resurse): distribuție echilibrată de zaruri.`
          : `Start moderat/redus (${pips} pips, ${resCount}/5 resurse): a necesitat expansiune rapidă.`;

    // Key win factors & verdict
    const keyFactors: string[] = [];
    if (prof.scoreBreakdown.cities >= 6) {
      keyFactors.push(`Dominanță industrială: ${prof.scoreBreakdown.cities / 2} orașe construite (${prof.scoreBreakdown.cities} VP)`);
    }
    if (prof.scoreBreakdown.largestArmy > 0) {
      keyFactors.push('Controlul Armatei Mari (+2 VP) prin utilizarea frecventă a Cavalerilor');
    }
    if (prof.scoreBreakdown.longestRoad > 0) {
      keyFactors.push('Controlul Drumului cel mai Lung (+2 VP)');
    }
    if (prof.scoreBreakdown.victoryPointCards > 0) {
      keyFactors.push(`${prof.scoreBreakdown.victoryPointCards} Puncte din Cărți de Dezvoltare`);
    }
    if (prof.economy.totalResourcesProduced >= 120) {
      keyFactors.push(`Producție ridicată: ${prof.economy.totalResourcesProduced} resurse colectate din zaruri`);
    }
    if (prof.ports.harborsAcquired.length > 0) {
      keyFactors.push(`Acces maritim timpuriu: ${prof.ports.harborsAcquired.map((h) => h.type).join(', ')}`);
    }
    prof.keyWinFactors = keyFactors;

    if (prof.isWinner) {
      prof.strategyVerdict = `Câștigătorul a dominat partida acumulând ${prof.finalScore} VP. Factorii determinanți au fost: ${keyFactors.join('; ')}.`;
    } else {
      const gap = highestScore - prof.finalScore;
      prof.strategyVerdict = `A încheiat cu ${prof.finalScore} VP (la ${gap} VP de lider). Producție: ${prof.economy.totalResourcesProduced} resurse (${prof.economy.avgResourcesPerTurn}/tură). ${prof.ports.harborsAcquired.length > 0 ? `A deținut portul ${prof.ports.harborsAcquired[0]?.type}.` : 'Nu a reușit să se conecteze la un port cheie.'}`;
    }

    // Summaries
    const summary = playerSummaries[pId]!;
    const gaps = gapsByPlayer[pId] ?? [];
    summary.averageDecisionGap =
      gaps.length > 0 ? Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(3)) : 0;
    summary.biggestMistakes.sort((a, b) => b.scoreGap - a.scoreGap);
    summary.biggestMistakes = summary.biggestMistakes.slice(0, 5);
  }

  // Winning milestone
  if (winnerId && winnerPlayer) {
    milestones.push({
      turn: maxTurn,
      sequence: replay.events.length,
      playerId: winnerId,
      type: 'win',
      title: 'Victorie!',
      description: `${winnerName} atinge ${highestScore} puncte de victorie și câștigă partida!`
    });
  }

  const winningReason =
    playerProfiles[winnerId ?? '']?.keyWinFactors.join(' · ') ||
    `Jucătorul a atins ${highestScore} puncte de victorie`;

  return {
    gameId: replay.gameId,
    totalTurns: maxTurn,
    totalEvents: replay.events.length,
    winnerId,
    winnerName,
    winningReason,
    diceHistogram,
    playerSummaries,
    playerProfiles,
    milestones: milestones.sort((a, b) => a.sequence - b.sequence),
    timelineData
  };
}
