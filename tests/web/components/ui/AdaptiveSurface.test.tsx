// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { AdaptiveSurface } from '../../../../apps/web/src/components/ui/AdaptiveSurface';

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
  vi.unstubAllGlobals();
});

describe('AdaptiveSurface', () => {
  it('renders nothing when closed', () => {
    render(
      <AdaptiveSurface open={false} onClose={() => {}} title="Trade">
        content
      </AdaptiveSurface>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders as a drawer (no drag handle) above the breakpoint', () => {
    mockMatchMedia(false);
    render(
      <AdaptiveSurface open onClose={() => {}} title="Trade">
        <p>Trade panel</p>
      </AdaptiveSurface>
    );
    expect(screen.getByRole('dialog', { name: 'Trade' })).toBeInTheDocument();
    expect(screen.getByText('Trade panel')).toBeInTheDocument();
  });

  it('renders as a sheet with a drag handle below the breakpoint', () => {
    mockMatchMedia(true);
    render(
      <AdaptiveSurface open onClose={() => {}} title="Trade">
        <p>Trade panel</p>
      </AdaptiveSurface>
    );
    expect(screen.getByRole('dialog', { name: 'Trade' })).toBeInTheDocument();
  });

  it('calls onClose from the close button, header, and backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AdaptiveSurface open onClose={onClose} title="Trade">
        content
      </AdaptiveSurface>
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('heading', { name: 'Trade' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
