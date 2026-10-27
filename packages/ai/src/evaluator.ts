import {
  ALL_RESOURCES,
  AICandidateEvaluation,
  AIStrategyStyle,
  BUILDING_COSTS,
  DICE_PIPS,
  GameAction,
  PlayerView,
  ResourceCount,
  ResourceType,
  TERRAIN_TO_RESOURCE,
  createEmptyResources,
  getPlayerBankTradeRatio,
  hasResources,
  isVertexAvailableForSettlement,
  totalResourceCount
} from '@catan/core';
import { StrategyWeights, resolveStrategyWeights } from './styles';

/**
 * Computes the expected resource production profile (in pips per 36 rolls) for a given player on `view.board`.
 */
export function computePlayerProductionProfile(
  view: PlayerView,
  playerId: string
): ResourceCount {
  const prod = createEmptyResources();
  for (const b of Object.values(view.board.buildings)) {
    if (b.ownerId !== playerId) continue;
    const vert = view.board.vertices[b.vertexId];
    if (!vert) continue;
    const multiplier = b.type === 'city' ? 2 : 1;

    for (const hId of vert.adjacentHexIds) {
      if (hId === view.board.robberHexId) continue;
      const hex = view.board.hexes[hId];
      if (!hex || !hex.numberToken) continue;
      const res = TERRAIN_TO_RESOURCE[hex.terrain];
      if (!res) continue;
      const pips = DICE_PIPS[hex.numberToken] ?? 0;
      prod[res] += pips * multiplier;
    }
  }
  return prod;
}

/**
 * Evaluates the intrinsic quality of a vertex for building a settlement by `playerId`.
 */
export function evaluateVertexForSettlement(
  view: PlayerView,
  vertexId: string,
  playerId: string,
  weights: StrategyWeights
): { total: number; factors: Record<string, number>; summary: string } {
  const vert = view.board.vertices[vertexId];
  if (!vert) {
    return { total: -100, factors: {}, summary: 'Intersecție invalidă' };
  }

  const currentProd = computePlayerProductionProfile(view, playerId);
  let pipSum = 0;
  let newResourcesGain = 0;
  const resourcesAtVertex = new Set<ResourceType>();

  for (const hId of vert.adjacentHexIds) {
    const hex = view.board.hexes[hId];
    if (!hex || !hex.numberToken) continue;
    const res = TERRAIN_TO_RESOURCE[hex.terrain];
    if (!res) continue;
    const pips = DICE_PIPS[hex.numberToken] ?? 0;
    pipSum += pips;
    resourcesAtVertex.add(res);
    if (currentProd[res] === 0) {
      newResourcesGain += pips * 1.4;
    }
  }

  const prodScore = (pipSum / 5) * weights.expectedProduction;
  const diversityScore =
    (resourcesAtVertex.size + newResourcesGain / 4) * weights.resourceDiversity;

  let harborScore = 0;
  if (vert.harbor) {
    if (vert.harbor === 'generic') {
      harborScore = 1.2 * weights.harborAccess;
    } else {
      const hasStrongProd = currentProd[vert.harbor] >= 5 || resourcesAtVertex.has(vert.harbor);
      harborScore = (hasStrongProd ? 2.2 : 0.9) * weights.harborAccess;
    }
  }

  // Opponent blocking value: if an opponent has a road adjacent to this vertex!
  const blocksOpponentRoad = vert.adjacentEdgeIds.some((eId) => {
    const r = view.board.roads[eId];
    return r && r.ownerId !== playerId;
  });
  const blockingScore = blocksOpponentRoad ? 1.8 * weights.opponentBlocking : 0;

  const vpScore = 1.0 * weights.victoryPoints;
  const total = Number(
    (vpScore + prodScore + diversityScore + harborScore + blockingScore).toFixed(3)
  );

  return {
    total,
    factors: {
      victoryPoints: Number(vpScore.toFixed(2)),
      production: Number(prodScore.toFixed(2)),
      diversity: Number(diversityScore.toFixed(2)),
      harbor: Number(harborScore.toFixed(2)),
      blocking: Number(blockingScore.toFixed(2))
    },
    summary: `Așezare ${vertexId} (${pipSum} pips, ${resourcesAtVertex.size} tipuri resurse${
      vert.harbor ? `, port ${vert.harbor}` : ''
    })`
  };
}

/**
 * Evaluates a hex for moving the robber onto it.
 */
export function evaluateRobberPlacement(
  view: PlayerView,
  hexId: string,
  playerId: string,
  targetPlayerId: string | undefined,
  weights: StrategyWeights
): { total: number; factors: Record<string, number>; summary: string } {
  const hex = view.board.hexes[hexId];
  if (!hex) return { total: -999, factors: {}, summary: 'Hexagon invalid' };

  const pips = hex.numberToken ? DICE_PIPS[hex.numberToken] ?? 0 : 0;
  let ownPenalty = 0;
  let opponentImpact = 0;
  let leaderBonus = 0;

  const maxOppScore = Math.max(
    1,
    ...view.players.filter((p) => p.id !== playerId).map((p) => p.publicScore)
  );

  if (hex.terrain === 'sea') {
    for (const eId of Object.keys(view.board.edges)) {
      const e = view.board.edges[eId]!;
      if (!e.adjacentHexIds.includes(hexId)) continue;
      const ship = view.board.ships?.[eId];
      if (!ship) continue;
      if (ship.ownerId === playerId) {
        ownPenalty += 6.0;
      } else {
        const opp = view.players.find((p) => p.id === ship.ownerId);
        const isLeader = opp && opp.publicScore === maxOppScore;
        opponentImpact += isLeader ? 4.0 : 2.0;
        if (isLeader) leaderBonus += 2.0;
      }
    }
  } else {
    for (const vId of Object.keys(view.board.vertices)) {
      const v = view.board.vertices[vId]!;
      if (!v.adjacentHexIds.includes(hexId)) continue;
      const b = view.board.buildings[vId];
      if (!b) continue;
      const mult = b.type === 'city' ? 2 : 1;
      if (b.ownerId === playerId) {
        ownPenalty += pips * mult * 8.0;
      } else {
        const opp = view.players.find((p) => p.id === b.ownerId);
        const isLeader = opp && opp.publicScore === maxOppScore;
        opponentImpact += pips * mult * (isLeader ? 2.5 : 1.4);
        if (isLeader) {
          leaderBonus += 3.0;
        }
      }
    }
  }

  let targetStealBonus = 0;
  if (targetPlayerId) {
    const target = view.players.find((p) => p.id === targetPlayerId);
    if (target) {
      targetStealBonus =
        (target.resourceCount > 0 ? 4.0 : 0) +
        (target.publicScore === maxOppScore ? 3.5 : 1.0);
    }
  }

  const blockFactor = ((opponentImpact + leaderBonus) / 5) * weights.opponentBlocking;
  const total = Number((blockFactor + targetStealBonus - ownPenalty).toFixed(3));

  return {
    total,
    factors: {
      opponentBlocking: Number(blockFactor.toFixed(2)),
      stealValue: Number(targetStealBonus.toFixed(2)),
      ownPenalty: Number((-ownPenalty).toFixed(2))
    },
    summary:
      ownPenalty > 0
        ? `Evitare blocare proprie pe ${hexId}`
        : `Blocare ${hexId} (număr ${hex.numberToken ?? '-'}, ${pips} pips)`
  };
}

/**
 * Evaluates how useful acquiring 1 unit of `res` is right now for `playerId` based on missing build costs.
 */
export function evaluateResourceNeed(
  inventory: ResourceCount,
  res: ResourceType,
  style: AIStrategyStyle
): number {
  let score = 1.0;
  if (inventory[res] === 0) score += 2.2;
  else if (inventory[res] === 1) score += 1.0;
  else if (inventory[res] >= 4) score -= 1.2;

  // Check if 1 more of `res` completes a Settlement, City, Road, or Dev Card
  const withOneMore = { ...inventory, [res]: inventory[res] + 1 };
  if (
    !hasResources(inventory, BUILDING_COSTS.city) &&
    hasResources(withOneMore, BUILDING_COSTS.city)
  ) {
    score += 5.5;
  }
  if (
    !hasResources(inventory, BUILDING_COSTS.settlement) &&
    hasResources(withOneMore, BUILDING_COSTS.settlement)
  ) {
    score += 5.0;
  }
  if (
    !hasResources(inventory, BUILDING_COSTS.dev_card) &&
    hasResources(withOneMore, BUILDING_COSTS.dev_card)
  ) {
    score += style === 'development' ? 4.0 : 2.8;
  }
  if (
    !hasResources(inventory, BUILDING_COSTS.road) &&
    hasResources(withOneMore, BUILDING_COSTS.road)
  ) {
    score += style === 'expansion' ? 3.2 : 2.0;
  }

  return score;
}

/**
 * Evaluates a candidate GameAction strictly using information visible in `view` (PlayerView).
 */
export function evaluateCandidateAction(
  view: PlayerView,
  playerId: string,
  action: GameAction,
  style: AIStrategyStyle
): AICandidateEvaluation {
  const weights = resolveStrategyWeights(style, view, playerId);
  const me = view.players.find((p) => p.id === playerId)!;
  const inv = me.resources ?? createEmptyResources();

  switch (action.type) {
    case 'place_initial_settlement': {
      const ev = evaluateVertexForSettlement(view, action.vertexId, playerId, weights);
      return {
        action,
        score: ev.total,
        factors: ev.factors,
        explanation: `Plasare inițială: ${ev.summary}`
      };
    }

    case 'place_initial_road':
    case 'place_initial_ship':
    case 'place_free_road':
    case 'build_road':
    case 'build_ship': {
      const edge = view.board.edges[action.edgeId];
      if (!edge) {
        return { action, score: -50, factors: {}, explanation: 'Muchie invalidă' };
      }

      // Check if either endpoint of this road is a legal future settlement spot or leads to one
      let bestReachableSpot = 0;
      for (const vId of [edge.v1, edge.v2]) {
        if (isVertexAvailableForSettlement(view.board, vId)) {
          const spotVal = evaluateVertexForSettlement(view, vId, playerId, weights).total;
          bestReachableSpot = Math.max(bestReachableSpot, spotVal * 0.65);
        } else {
          const v = view.board.vertices[vId];
          if (v) {
            for (const nextV of v.adjacentVertexIds) {
              if (isVertexAvailableForSettlement(view.board, nextV)) {
                const spotVal = evaluateVertexForSettlement(view, nextV, playerId, weights).total;
                bestReachableSpot = Math.max(bestReachableSpot, spotVal * 0.4);
              }
            }
          }
        }
      }

      const roadTitleBonus =
        me.longestRoadLength >= 4 && view.longestRoadOwnerId !== playerId
          ? weights.roadAndArmyTitles * 2.2
          : weights.expansionPotential * 1.4;

      const total = Number((bestReachableSpot + roadTitleBonus).toFixed(3));
      return {
        action,
        score: total,
        factors: {
          expansion: Number(bestReachableSpot.toFixed(2)),
          roadNetwork: Number(roadTitleBonus.toFixed(2))
        },
        explanation: `Construcție drum pe ${action.edgeId} spre intersecții fertile`
      };
    }

    case 'build_settlement': {
      const ev = evaluateVertexForSettlement(view, action.vertexId, playerId, weights);
      const boost = weights.victoryPoints * 2.5;
      return {
        action,
        score: Number((ev.total + boost).toFixed(3)),
        factors: { ...ev.factors, buildBonus: Number(boost.toFixed(2)) },
        explanation: `Construiește ${ev.summary} (+1 VP)`
      };
    }

    case 'build_city': {
      const vert = view.board.vertices[action.vertexId];
      let addedPips = 0;
      if (vert) {
        for (const hId of vert.adjacentHexIds) {
          const hex = view.board.hexes[hId];
          if (hex?.numberToken) {
            addedPips += DICE_PIPS[hex.numberToken] ?? 0;
          }
        }
      }
      const vpGain = weights.victoryPoints * 3.0;
      const prodGain = (addedPips / 4) * weights.expectedProduction * 1.6;
      const total = Number((vpGain + prodGain).toFixed(3));
      return {
        action,
        score: total,
        factors: {
          victoryPoints: Number(vpGain.toFixed(2)),
          productionDoubling: Number(prodGain.toFixed(2))
        },
        explanation: `Modernizare la Oraș pe ${action.vertexId} (+1 VP, +${addedPips} pips producție)`
      };
    }

    case 'buy_dev_card': {
      const devScore = weights.devCardsAndKnights * 3.2;
      const armyProximity =
        me.knightsPlayed >= 2 && view.largestArmyOwnerId !== playerId
          ? weights.roadAndArmyTitles * 1.8
          : 0;
      const total = Number((devScore + armyProximity).toFixed(3));
      return {
        action,
        score: total,
        factors: {
          development: Number(devScore.toFixed(2)),
          armyPotential: Number(armyProximity.toFixed(2))
        },
        explanation: 'Cumpără carte de dezvoltare (potențial Cavaler / Progres / VP)'
      };
    }

    case 'play_knight': {
      const robEv = evaluateRobberPlacement(
        view,
        action.hexId,
        playerId,
        action.targetPlayerId,
        weights
      );
      const armyBonus =
        me.knightsPlayed >= 2 && view.largestArmyOwnerId !== playerId
          ? weights.roadAndArmyTitles * 3.0
          : weights.devCardsAndKnights * 1.5;
      const unblockOwnHexBonus = Object.values(view.board.buildings).some(
        (b) =>
          b.ownerId === playerId &&
          view.board.vertices[b.vertexId]?.adjacentHexIds.includes(view.board.robberHexId)
      )
        ? 12.0
        : 0;

      const total = Number((robEv.total + armyBonus + unblockOwnHexBonus).toFixed(3));
      return {
        action,
        score: total,
        factors: {
          ...robEv.factors,
          armyBonus: Number(armyBonus.toFixed(2)),
          unblockSelf: Number(unblockOwnHexBonus.toFixed(2))
        },
        explanation: `Joacă Cavaler: ${robEv.summary}`
      };
    }

    case 'play_road_building': {
      const score = Number((weights.expansionPotential * 4.5 + weights.roadAndArmyTitles * 2.5).toFixed(3));
      return {
        action,
        score,
        factors: { freeRoads: score },
        explanation: 'Joacă Progres: 2 Drumuri Gratuite'
      };
    }

    case 'play_year_of_plenty': {
      const [r1, r2] = action.resources;
      const n1 = evaluateResourceNeed(inv, r1, style);
      const tempInv = { ...inv, [r1]: inv[r1] + 1 };
      const n2 = evaluateResourceNeed(tempInv, r2, style);
      const score = Number(((n1 + n2) * 3.2).toFixed(3));
      return {
        action,
        score,
        factors: { resourceUtility: score },
        explanation: `Joacă Anul Abundenței pentru ${r1} și ${r2}`
      };
    }

    case 'play_monopoly': {
      const prod = computePlayerProductionProfile(view, playerId);
      const need = evaluateResourceNeed(inv, action.resource, style);
      // Estimate scarcity/abundance on board
      let boardPips = 0;
      for (const h of Object.values(view.board.hexes)) {
        if (TERRAIN_TO_RESOURCE[h.terrain] === action.resource && h.numberToken) {
          boardPips += DICE_PIPS[h.numberToken] ?? 0;
        }
      }
      const score = Number(((need * 2.5 + boardPips * 0.8 - prod[action.resource] * 0.2) * 2.0).toFixed(3));
      return {
        action,
        score,
        factors: { monopolyEstimate: score },
        explanation: `Joacă Monopol pe resursa ${action.resource}`
      };
    }

    case 'move_robber': {
      const robEv = evaluateRobberPlacement(
        view,
        action.hexId,
        playerId,
        action.targetPlayerId,
        weights
      );
      return {
        action,
        score: robEv.total,
        factors: robEv.factors,
        explanation: `Mută hoțul: ${robEv.summary}`
      };
    }

    case 'steal_from_player': {
      const target = view.players.find((p) => p.id === action.targetPlayerId);
      const score = target ? target.publicScore * 2.5 + target.resourceCount * 1.2 : 1.0;
      return {
        action,
        score: Number(score.toFixed(3)),
        factors: { targetThreat: Number(score.toFixed(2)) },
        explanation: `Fură o resursă de la ${target?.name ?? action.targetPlayerId}`
      };
    }

    case 'discard_cards': {
      // Prefer keeping resources that complete cities/settlements, discarding surplus
      const remaining = { ...inv };
      for (const r of ALL_RESOURCES) {
        remaining[r] -= action.resources[r] ?? 0;
      }
      let keptValue = 0;
      for (const r of ALL_RESOURCES) {
        if (remaining[r] > 0) {
          keptValue += evaluateResourceNeed(createEmptyResources(), r, style) * Math.min(2, remaining[r]);
        }
      }
      if (hasResources(remaining, BUILDING_COSTS.city)) keptValue += 12;
      if (hasResources(remaining, BUILDING_COSTS.settlement)) keptValue += 10;
      return {
        action,
        score: Number(keptValue.toFixed(3)),
        factors: { keptInventoryUtility: Number(keptValue.toFixed(2)) },
        explanation: 'Decartează surplusul păstrând resursele critice pentru construcții'
      };
    }

    case 'trade_bank': {
      const afterGive = { ...inv, [action.give]: inv[action.give] - action.giveAmount };
      const needReceive = evaluateResourceNeed(afterGive, action.receive, style);
      const keepGiveUtility = evaluateResourceNeed(afterGive, action.give, style);
      const ratio = getPlayerBankTradeRatio(view.board, playerId, action.give);
      const netGain = needReceive * 3.2 - keepGiveUtility * 1.4 - ratio * 0.8;
      // Avoid trading if it doesn't improve build readiness or reduce >7 hand size risk
      const handSizeBonus = totalResourceCount(inv) > 7 ? 3.5 : 0;
      const score = Number((netGain + handSizeBonus).toFixed(3));
      return {
        action,
        score,
        factors: {
          tradeUtility: Number(netGain.toFixed(2)),
          robberRiskReduction: handSizeBonus
        },
        explanation: `Schimb maritim/bancă ${action.giveAmount} ${action.give} -> 1 ${action.receive}`
      };
    }

    case 'propose_trade': {
      let gainScore = 0;
      let lossScore = 0;
      for (const r of ALL_RESOURCES) {
        const req = action.requesting[r] ?? 0;
        const off = action.offering[r] ?? 0;
        if (req > 0) {
          gainScore += evaluateResourceNeed(inv, r, style) * req;
        }
        if (off > 0) {
          lossScore += evaluateResourceNeed(inv, r, style) * off;
        }
      }
      // AI proposes trade if it strongly needs the requested resource more than what it offers
      const netGain = gainScore * 1.4 - lossScore * 1.0;
      const score = Number((netGain + 2.5).toFixed(3));
      return {
        action,
        score,
        factors: {
          gain: Number(gainScore.toFixed(2)),
          cost: Number((-lossScore).toFixed(2)),
          tradeUtility: Number(netGain.toFixed(2))
        },
        explanation: 'Propune schimb de resurse cu ceilalți jucători'
      };
    }

    case 'cancel_trade': {
      const offer = view.activeTradeOffers.find((o) => o.id === action.offerId);
      const isRejected = !offer || offer.status === 'rejected';
      return {
        action,
        score: isRejected ? 4.2 : -10.0,
        factors: { cleanup: isRejected ? 4.2 : -10.0 },
        explanation: isRejected ? 'Anulează oferta de schimb refuzată' : 'Așteaptă răspunsul la ofertă'
      };
    }

    case 'respond_trade': {
      if (action.response === 'reject') {
        return {
          action,
          score: 0.0,
          factors: { caution: 0.0 },
          explanation: 'Refuză oferta de schimb neavantajoasă'
        };
      }
      const offer = view.activeTradeOffers.find((o) => o.id === action.offerId);
      if (!offer) {
        return { action, score: -10, factors: {}, explanation: 'Ofertă inexistentă' };
      }
      let gainScore = 0;
      let lossScore = 0;
      for (const r of ALL_RESOURCES) {
        if (offer.offering[r] > 0) {
          gainScore += evaluateResourceNeed(inv, r, style) * offer.offering[r];
        }
        if (offer.requesting[r] > 0) {
          lossScore += evaluateResourceNeed(inv, r, style) * offer.requesting[r];
        }
      }
      const proposer = view.players.find((p) => p.id === offer.fromPlayerId);
      const isLeaderNearWin = Boolean(proposer && proposer.publicScore >= view.rules.victoryPointsToWin - 2);
      const leaderPenalty = isLeaderNearWin ? 8.0 : 0.0;
      const countOffered = totalResourceCount(offer.offering);
      const countRequested = totalResourceCount(offer.requesting);
      const ratioBonus = (countOffered - countRequested) * 2.5;
      const total = Number((gainScore * 1.3 - lossScore * 1.0 + ratioBonus - leaderPenalty).toFixed(3));
      return {
        action,
        score: total,
        factors: {
          gain: Number(gainScore.toFixed(2)),
          cost: Number((-lossScore).toFixed(2)),
          ratioBonus: Number(ratioBonus.toFixed(2)),
          leaderPenalty: Number((-leaderPenalty).toFixed(2))
        },
        explanation: `Acceptă schimbul propus de ${proposer?.name ?? offer.fromPlayerId}`
      };
    }

    case 'roll_dice': {
      return {
        action,
        score: 8.0,
        factors: { mandatoryTurnFlow: 8.0 },
        explanation: 'Aruncă zarurile pentru producția turei'
      };
    }

    case 'move_ship': {
      const edge = view.board.edges[action.toEdgeId];
      if (!edge) {
        return { action, score: -50, factors: {}, explanation: 'Muchie destinație invalidă' };
      }
      let bestReachableSpot = 0;
      for (const vId of [edge.v1, edge.v2]) {
        if (isVertexAvailableForSettlement(view.board, vId)) {
          const spotVal = evaluateVertexForSettlement(view, vId, playerId, weights).total;
          bestReachableSpot = Math.max(bestReachableSpot, spotVal * 0.7);
        }
      }
      const score = Number((bestReachableSpot + weights.expansionPotential * 2.2).toFixed(3));
      return {
        action,
        score,
        factors: { expansion: score },
        explanation: 'Repoziționează nava pentru o rută strategică'
      };
    }

    case 'pass_special_building': {
      return {
        action,
        score: 3.0,
        factors: { passSpecialBuild: 3.0 },
        explanation: 'Încheie rândul în faza specială de construcție'
      };
    }

    case 'end_turn': {
      return {
        action,
        score: 3.5,
        factors: { turnCompletion: 3.5 },
        explanation: 'Încheie tura curentă'
      };
    }

    default:
      return {
        action,
        score: 0,
        factors: {},
        explanation: (action as { type?: string }).type ?? 'action'
      };
  }
}

/**
 * Evaluates the overall board position score of `playerId` for lookahead/rollout comparison.
 */
export function evaluateBoardPosition(
  view: PlayerView,
  playerId: string,
  style: AIStrategyStyle
): number {
  const weights = resolveStrategyWeights(style, view, playerId);
  const me = view.players.find((p) => p.id === playerId);
  if (!me) return -1000;

  if (view.winnerId === playerId) return 10000;
  if (view.winnerId && view.winnerId !== playerId) return -5000;

  const myPoints = me.totalScore ?? me.publicScore;
  const prod = computePlayerProductionProfile(view, playerId);
  const totalPips = totalResourceCount(prod);
  const distinctProduced = ALL_RESOURCES.filter((r) => prod[r] > 0).length;

  let score =
    myPoints * weights.victoryPoints * 3.0 +
    totalPips * weights.expectedProduction * 0.4 +
    distinctProduced * weights.resourceDiversity * 1.2 +
    me.longestRoadLength * weights.roadAndArmyTitles * 0.5 +
    me.knightsPlayed * weights.devCardsAndKnights * 0.8;

  if (me.resources) {
    score += totalResourceCount(me.resources) * 0.35;
  }

  return Number(score.toFixed(3));
}
