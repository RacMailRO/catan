// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { AiThinkingIndicator } from '../../../../apps/web/src/components/game/AiThinkingIndicator';

afterEach(() => {
  cleanup();
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
});
