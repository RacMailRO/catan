// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GameAction, GameState, createEmptyResources, createGame, createRulesConfig } from '@catan/core';
import { useTradeState } from '../../../apps/web/src/hooks/useTradeState';

function makeStateWithOpenOffer(): GameState {
  const state = createGame({
    gameId: 'trade-hook-test',
    seed: 'trade-hook-seed',
    rules: createRulesConfig(),
    participants: [
      { id: 'p1', name: 'Human', type: 'human' },
      { id: 'p2', name: 'Bot', type: 'ai' }
    ]
  });
  state.phase = 'main_actions';
  state.activePlayerId = 'p2';
  state.activeTradeOffers = [
    {
      id: 'TR_1',
      fromPlayerId: 'p2',
      toPlayerId: 'p1',
      offering: { ...createEmptyResources(), wood: 1 },
      requesting: { ...createEmptyResources(), brick: 1 },
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 30000,
      rejectedByPlayerIds: [],
      status: 'open'
    }
  ];
  return state;
}

function Harness({
  gameState,
  executeAction,
  showActionFeedback
}: {
  gameState: GameState;
  executeAction: (playerId: string, action: GameAction) => void;
  showActionFeedback: (content: React.ReactNode) => void;
}): React.ReactElement {
  const {
    visibleTradeOffers,
    dismissedTradeOfferIds,
    hideTradeBanner,
    dismissTradeOffer
  } = useTradeState({
    gameState,
    executeAction,
    viewerId: 'p1',
    showActionFeedback,
    locale: 'ro'
  });

  return (
    <div>
      <span data-testid="visible-offers">{Object.keys(visibleTradeOffers).join(',')}</span>
      <span data-testid="dismissed-offers">{Array.from(dismissedTradeOfferIds).join(',')}</span>
      <button type="button" onClick={() => hideTradeBanner('TR_1')}>
        Hide Banner
      </button>
      <button type="button" onClick={() => dismissTradeOffer('TR_1', 'Refuz')}>
        Dismiss Offer
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useTradeState', () => {
  it('auto-hides the floating trade banner after 7s without adding the offer to dismissedTradeOfferIds', () => {
    const executeAction = vi.fn();
    const showActionFeedback = vi.fn();
    const state = makeStateWithOpenOffer();

    render(
      <Harness
        gameState={state}
        executeAction={executeAction}
        showActionFeedback={showActionFeedback}
      />
    );

    expect(screen.getByTestId('visible-offers')).toHaveTextContent('TR_1');
    expect(screen.getByTestId('dismissed-offers')).toHaveTextContent('');

    act(() => {
      vi.advanceTimersByTime(7500);
    });

    expect(screen.getByTestId('visible-offers')).toHaveTextContent('');
    expect(screen.getByTestId('dismissed-offers')).toHaveTextContent('');
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('keeps hideTradeBanner separate from dismissTradeOffer', () => {
    const executeAction = vi.fn();
    const showActionFeedback = vi.fn();
    const state = makeStateWithOpenOffer();

    render(
      <Harness
        gameState={state}
        executeAction={executeAction}
        showActionFeedback={showActionFeedback}
      />
    );

    expect(screen.getByTestId('visible-offers')).toHaveTextContent('TR_1');

    fireEvent.click(screen.getByRole('button', { name: 'Hide Banner' }));
    expect(screen.getByTestId('visible-offers')).toHaveTextContent('');
    expect(screen.getByTestId('dismissed-offers')).toHaveTextContent('');
    expect(executeAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Offer' }));
    expect(screen.getByTestId('dismissed-offers')).toHaveTextContent('TR_1');
    expect(executeAction).toHaveBeenCalledWith('p1', {
      type: 'respond_trade',
      offerId: 'TR_1',
      response: 'reject',
      reason: 'Refuz'
    });
  });
});
