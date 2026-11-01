// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { AppNav } from '../../../../apps/web/src/components/ui/AppNav';

const ITEMS = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'game', label: 'Game' }
];

afterEach(() => {
  cleanup();
});

describe('AppNav', () => {
  it('shows the hamburger trigger and keeps the drawer closed initially', () => {
    render(<AppNav items={ITEMS} activeId="lobby" onNavigate={() => {}} />);
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('opens the drawer and lists the items, highlighting the active one', async () => {
    const user = userEvent.setup();
    render(<AppNav items={ITEMS} activeId="game" onNavigate={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lobby' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Game' })).toHaveAttribute('aria-current', 'page');
  });

  it('calls onNavigate with the item id and closes the drawer', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AppNav items={ITEMS} activeId="lobby" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('button', { name: 'Game' }));

    expect(onNavigate).toHaveBeenCalledWith('game');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('closes the drawer via the close button', async () => {
    const user = userEvent.setup();
    render(<AppNav items={ITEMS} activeId="lobby" onNavigate={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
