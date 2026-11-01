// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { ThemeToggle } from '../../../../apps/web/src/components/ui/ThemeToggle';

afterEach(() => {
  cleanup();
});

describe('ThemeToggle', () => {
  it('renders Light/Dark/Xmas buttons, highlighting whichever theme prop is active', () => {
    render(<ThemeToggle theme="dark" setTheme={() => {}} />);
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Xmas' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls setTheme with the picked theme', async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    render(<ThemeToggle theme="light" setTheme={setTheme} />);

    await user.click(screen.getByRole('button', { name: 'Xmas' }));

    expect(setTheme).toHaveBeenCalledWith('xmas');
  });
});
