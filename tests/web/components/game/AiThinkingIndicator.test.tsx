// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { AiThinkingIndicator } from '../../../../apps/web/src/components/game/AiThinkingIndicator';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AiThinkingIndicator', () => {
  it('renders nothing while idle (since is null)', () => {
    render(<AiThinkingIndicator since={null} locale="ro" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders a visible status banner while a request is pending', () => {
    render(<AiThinkingIndicator since={Date.now()} locale="ro" />);
    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/negociază/i);
  });

  it('has no close/dismiss control, so it cannot be clicked away', () => {
    render(<AiThinkingIndicator since={Date.now()} locale="en" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders contextual labels for ai_turn and syncing variants', () => {
    const { rerender } = render(
      <AiThinkingIndicator since={Date.now()} variant="ai_turn" locale="ro" />
    );
    expect(screen.getByRole('status')).toHaveTextContent(/își joacă tura/i);

    rerender(<AiThinkingIndicator since={Date.now()} variant="ai_turn" locale="en" />);
    expect(screen.getByRole('status')).toHaveTextContent(/taking their turn/i);

    rerender(<AiThinkingIndicator since={Date.now()} variant="syncing" locale="ro" />);
    expect(screen.getByRole('status')).toHaveTextContent(/se sincronizează/i);

    rerender(<AiThinkingIndicator since={Date.now()} variant="syncing" locale="en" />);
    expect(screen.getByRole('status')).toHaveTextContent(/syncing/i);
  });

  it('stays hidden during delayMs grace period and appears once delayMs elapses', () => {
    vi.useFakeTimers();
    const start = Date.now();
    render(<AiThinkingIndicator since={start} variant="syncing" delayMs={1200} locale="ro" />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/se sincronizează/i);
  });
});
