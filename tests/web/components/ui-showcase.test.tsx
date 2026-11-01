// @vitest-environment jsdom
//
// Smoke test for the dev-only UI Showcase page (apps/web/src/components/UiShowcase.tsx), which
// runs a real local AI-vs-AI simulation (via @catan/ai's runSimulatedGame) to build its sample
// GameState/PlayerView backbone. This just proves the page mounts without throwing and exposes
// at least a few of its "Open X" demo buttons — it deliberately does not click through all 17
// panels (each panel's own component already has/gets its own focused tests elsewhere).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { UiShowcase } from '../../../apps/web/src/components/UiShowcase';

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
}

beforeEach(() => {
  mockMatchMedia(false);
});

afterEach(() => {
  cleanup();
});

describe('UiShowcase', () => {
  it('renders without throwing, with a sample simulated game as its backbone', () => {
    render(<UiShowcase locale="ro" />);
    expect(screen.getByText('🧪 UI Showcase')).toBeInTheDocument();
  });

  it('exposes independently-triggerable "Open X" buttons for the game panels', () => {
    render(<UiShowcase locale="en" />);
    expect(screen.getByRole('button', { name: /Open ScoreBank/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open EventLog/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open TradeOfferBuilder/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open DiscardDialog/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open WaitingRoomPanel/i })).toBeInTheDocument();
  });

  it('opens a panel on demand (ScoreBank) without affecting any real game state', () => {
    render(<UiShowcase locale="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Open ScoreBank/i }));
    expect(screen.getByText(/Leaderboard, Players & Bank/i)).toBeInTheDocument();
  });

  it('calls onExit when the back-to-lobby button is clicked', () => {
    const onExit = vi.fn();
    render(<UiShowcase locale="en" onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /Back to Lobby/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
