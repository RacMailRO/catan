// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { useTheme } from '../../../apps/web/src/hooks/useTheme';

function Harness(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme('xmas')}>
        Pick Xmas
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
});

describe('useTheme', () => {
  it('defaults to dark (the app has no separate legacy light mode) and applies it to <html> on mount', () => {
    render(<Harness />);
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('reads a previously stored theme instead of the default', () => {
    window.localStorage.setItem('catan-theme', 'xmas');
    render(<Harness />);
    expect(screen.getByTestId('theme')).toHaveTextContent('xmas');
    expect(document.documentElement.getAttribute('data-theme')).toBe('xmas');
  });

  it('setTheme updates <html data-theme> and persists to localStorage', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Pick Xmas' }));

    expect(screen.getByTestId('theme')).toHaveTextContent('xmas');
    expect(document.documentElement.getAttribute('data-theme')).toBe('xmas');
    expect(window.localStorage.getItem('catan-theme')).toBe('xmas');
  });
});
