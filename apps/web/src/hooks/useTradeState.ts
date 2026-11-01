import React, { useEffect, useState } from 'react';
import { GameAction, GameState, ResourceCount, ResourceType, TradeOffer, createEmptyResources } from '@catan/core';
import { Locale } from '../i18n';

/** A trade offer's banner snapshot, kept around for a minimum visible duration even after the
 *  underlying offer is cleared from gameState (see the tracking/pruning effects inside
 *  useTradeState) so a fast resolution doesn't flicker the negotiation banner away instantly. */
export interface TradeBannerEntry {
  /** Last known snapshot of the offer (status, who accepted/rejected it, etc). */
  offer: TradeOffer;
  /** When this offer was first observed, in ms since epoch - anchors the "stay visible at
   *  least N seconds" floor for an still-open offer. */
  firstShownAtMs: number;
  /** When the offer resolved (accepted/rejected/cancelled/expired), in ms since epoch - anchors
   *  the post-resolution visibility floor. Undefined while still open. */
  resolvedAtMs?: number;
}

export interface UseTradeStateParams {
  /** Current game state; the offer-tracking effect reads gameState.activeTradeOffers from it,
   *  and dismissTradeOffer reads it to confirm an offer is still open before responding. */
  gameState: GameState | null;
  /** Dispatches a game action for the given player, exactly as used elsewhere in App.tsx. */
  executeAction: (playerId: string, action: GameAction) => void;
  /** The local viewer's player id, used by dismissTradeOffer to respond on their behalf. */
  viewerId: string;
  /** Pushes a transient feedback toast, used by dismissTradeOffer to confirm a decline. */
  showActionFeedback: (content: React.ReactNode) => void;
  /** Active UI locale, used to localize dismissTradeOffer's feedback message. */
  locale: Locale;
}

export interface UseTradeStateResult {
  /** The two resources selected in the Year of Plenty sub-modal. */
  yopResources: [ResourceType, ResourceType];
  /** Replaces the Year of Plenty selection. */
  setYopResources: React.Dispatch<React.SetStateAction<[ResourceType, ResourceType]>>;
  /** The resource selected in the Monopoly sub-modal. */
  monopolyResource: ResourceType;
  /** Replaces the Monopoly selection. */
  setMonopolyResource: React.Dispatch<React.SetStateAction<ResourceType>>;
  /** Resource the active player is currently offering the bank in the maritime-trade selector. */
  bankGiveRes: ResourceType;
  /** Replaces the bank-trade "give" selection. */
  setBankGiveRes: React.Dispatch<React.SetStateAction<ResourceType>>;
  /** Resource the active player wants back from the bank. */
  bankReceiveRes: ResourceType;
  /** Replaces the bank-trade "receive" selection. */
  setBankReceiveRes: React.Dispatch<React.SetStateAction<ResourceType>>;
  /** Resources currently staged to offer in the player-to-player trade/counter-trade builder. */
  p2pOffer: ResourceCount;
  /** Replaces the staged offer amounts. */
  setP2pOffer: React.Dispatch<React.SetStateAction<ResourceCount>>;
  /** Resources currently staged to request in the player-to-player trade/counter-trade builder. */
  p2pRequest: ResourceCount;
  /** Replaces the staged request amounts. */
  setP2pRequest: React.Dispatch<React.SetStateAction<ResourceCount>>;
  /** Which incoming offer the counter_trade modal is answering (reuses p2pOffer/p2pRequest) -
   *  a responder proposing their own terms isn't the active player, so this can't reuse the
   *  main trade modal's "propose_trade as activePlayerObj" flow. Null when no counter is open. */
  counterOfferOriginalId: string | null;
  /** Sets which offer the counter-trade modal is answering. */
  setCounterOfferOriginalId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Offer ids the viewer has dismissed (via reject, cancel, or closing the banner/modal) and
   *  that should no longer trigger the incoming-offer modal or negotiation banner this turn. */
  dismissedTradeOfferIds: Set<string>;
  /** Replaces the dismissed-offer id set. */
  setDismissedTradeOfferIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Whether the discard-cards dialog is collapsed to a small banner (so the map stays visible). */
  minimizedDiscard: boolean;
  /** Toggles the minimized discard banner. */
  setMinimizedDiscard: React.Dispatch<React.SetStateAction<boolean>>;
  /** Which incoming offer's "reject reason" dropdown is currently open, if any. */
  rejectDropdownOfferId: string | null;
  /** Sets which offer's reject-reason dropdown is open; a click-outside effect (wired inside
   *  this hook) closes it automatically. */
  setRejectDropdownOfferId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Resources currently selected to discard in the discard-cards dialog. */
  discardSelection: ResourceCount;
  /** Replaces the discard selection. */
  setDiscardSelection: React.Dispatch<React.SetStateAction<ResourceCount>>;
  /** Every active/recently-resolved trade offer to render as a negotiation banner, keyed by
   *  offer id and kept for a minimum visible duration (see TradeBannerEntry). */
  visibleTradeOffers: Record<string, TradeBannerEntry>;
  /** Declines an incoming offer on the viewer's behalf (respond_trade/reject when it's still
   *  open), marks it dismissed, closes the reject-reason dropdown, and shows a feedback toast. */
  dismissTradeOffer: (offerId: string, reason?: string) => void;
  /** Cancels an offer the viewer proposed (cancel_trade) and marks it dismissed. */
  cancelMyTradeOffer: (offerId: string) => void;
}

/**
 * Owns the trade/bank/discard negotiation state cluster: the dev-card sub-modal selections
 * (Monopoly, Year of Plenty), the bank and player-to-player trade builder staging, the
 * discard-cards selection, the incoming-offer reject-reason dropdown, and the trade negotiation
 * banner's visibility tracking - plus the dismiss/cancel handlers that mutate dismissed-offer
 * state and dispatch the corresponding game actions.
 *
 * visibleTradeOffers (and its two tracking/pruning effects) is included here rather than left
 * in App.tsx because both effects read AND write dismissedTradeOfferIds to maintain its "stay
 * dismissed for the rest of the turn" invariant - splitting those mutations across two files
 * would leave the same piece of state written from two places for no benefit, since nothing
 * outside the trade-offer banner/modal flow touches visibleTradeOffers.
 */
export function useTradeState({
  gameState,
  executeAction,
  viewerId,
  showActionFeedback,
  locale
}: UseTradeStateParams): UseTradeStateResult {
  // Dev card & trade sub-modals state
  const [yopResources, setYopResources] = useState<[ResourceType, ResourceType]>(['wheat', 'ore']);
  const [monopolyResource, setMonopolyResource] = useState<ResourceType>('wheat');
  const [bankGiveRes, setBankGiveRes] = useState<ResourceType>('wood');
  const [bankReceiveRes, setBankReceiveRes] = useState<ResourceType>('ore');
  const [p2pOffer, setP2pOffer] = useState<ResourceCount>(createEmptyResources());
  // Which incoming offer the counter_trade modal (reuses p2pOffer/p2pRequest below) is
  // answering - a responder proposing their own terms isn't the active player, so this can't
  // reuse the main trade modal's "propose_trade as activePlayerObj" flow.
  const [counterOfferOriginalId, setCounterOfferOriginalId] = useState<string | null>(null);
  const [dismissedTradeOfferIds, setDismissedTradeOfferIds] = useState<Set<string>>(new Set());

  const [minimizedDiscard, setMinimizedDiscard] = useState<boolean>(false);
  const [rejectDropdownOfferId, setRejectDropdownOfferId] = useState<string | null>(null);

  useEffect(() => {
    if (!rejectDropdownOfferId) return;
    const handleClickOutside = () => setRejectDropdownOfferId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [rejectDropdownOfferId]);

  const dismissTradeOffer = (offerId: string, reason = 'Refuz') => {
    setRejectDropdownOfferId(null);
    if (dismissedTradeOfferIds.has(offerId)) return;
    setDismissedTradeOfferIds((prev) => new Set(prev).add(offerId));

    // Guard: only execute respond_trade if the offer actually exists and is still open!
    const curOffer = gameState?.activeTradeOffers?.find((o) => o.id === offerId);
    if (!curOffer || curOffer.status !== 'open') {
      return;
    }

    executeAction(viewerId, {
      type: 'respond_trade',
      offerId,
      response: 'reject',
      reason
    });
    showActionFeedback(locale === 'ro' ? `Refuz trimis: "${reason}"` : `Decline sent: "${reason}"`);
  };

  const cancelMyTradeOffer = (offerId: string) => {
    setDismissedTradeOfferIds((prev) => new Set(prev).add(offerId));
    executeAction(viewerId, {
      type: 'cancel_trade',
      offerId
    });
  };
  const [p2pRequest, setP2pRequest] = useState<ResourceCount>(createEmptyResources());
  const [discardSelection, setDiscardSelection] = useState<ResourceCount>(createEmptyResources());

  // Trade negotiation banners: every active/recently-resolved offer, kept visible for a minimum
  // of 5s from when each was first observed even if the underlying offer is cleared from state
  // faster than that (e.g. an AI proposer ending its turn right after an acceptance) - so
  // nobody has to react instantly to see what happened.
  const [visibleTradeOffers, setVisibleTradeOffers] = useState<Record<string, TradeBannerEntry>>({});

  // Track every active trade offer for the negotiation banner(s), keyed by offer id so a
  // resolved one keeps its last known snapshot (status, who accepted...) after it's cleared from
  // gameState - the pruning effect right after this one is what actually removes it, once it's
  // both resolved AND has been visible for the 5s floor.
  //
  // A resolved offer stays in gameState.activeTradeOffers (status 'accepted'/'rejected'/...)
  // until end_turn clears the whole array - it is NOT removed just because it resolved. Once
  // the pruning effect below drops it from visibleTradeOffers, it's still sitting right there
  // in activeTradeOffers for the rest of that turn, so without the dismissedTradeOfferIds check
  // below, the very next unrelated action (e.g. building something) recreates gameState, this
  // effect sees "an offer not currently tracked" again, and the banner pops back up out of
  // nowhere. Skipping anything already dismissed - manually or via that same prune - is what
  // makes a resolved offer actually stay gone for the rest of the turn.
  useEffect(() => {
    if (!gameState) return;
    const now = Date.now();
    setVisibleTradeOffers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const offer of gameState.activeTradeOffers) {
        if (dismissedTradeOfferIds.has(offer.id)) continue;
        const existing = next[offer.id];
        const isResolved = offer.status !== 'open';
        const resolvedAt = isResolved ? (existing?.resolvedAtMs ?? now) : undefined;
        if (!existing || existing.offer !== offer) {
          next[offer.id] = {
            offer,
            firstShownAtMs: existing?.firstShownAtMs ?? now,
            resolvedAtMs: resolvedAt
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [gameState?.activeTradeOffers, dismissedTradeOfferIds]);

  useEffect(() => {
    const timers = Object.entries(visibleTradeOffers).map(([id, entry]) => {
      const now = Date.now();
      // Auto-dismiss open offers after 7 seconds (within the 5-8s requested by the user).
      // If resolved (accepted/rejected/cancelled), stay visible for 4.5 seconds after resolution.
      const remaining = entry.offer.status === 'open'
        ? Math.max(0, 7000 - (now - entry.firstShownAtMs))
        : Math.max(0, 4500 - (now - (entry.resolvedAtMs ?? entry.firstShownAtMs)));

      return setTimeout(() => {
        // Marking it dismissed (not just dropping it from visibleTradeOffers) is what stops the
        // tracking effect above from reviving it the next time gameState changes.
        setDismissedTradeOfferIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
        setVisibleTradeOffers((prev) => {
          if (!(id in prev)) return prev;
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
      }, remaining);
    });
    return () => {
      for (const t of timers) if (t) clearTimeout(t);
    };
  }, [visibleTradeOffers]);

  return {
    yopResources,
    setYopResources,
    monopolyResource,
    setMonopolyResource,
    bankGiveRes,
    setBankGiveRes,
    bankReceiveRes,
    setBankReceiveRes,
    p2pOffer,
    setP2pOffer,
    p2pRequest,
    setP2pRequest,
    counterOfferOriginalId,
    setCounterOfferOriginalId,
    dismissedTradeOfferIds,
    setDismissedTradeOfferIds,
    minimizedDiscard,
    setMinimizedDiscard,
    rejectDropdownOfferId,
    setRejectDropdownOfferId,
    discardSelection,
    setDiscardSelection,
    visibleTradeOffers,
    dismissTradeOffer,
    cancelMyTradeOffer
  };
}
