// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { Dialog } from '../../../../apps/web/src/components/ui/Dialog';

afterEach(() => {
  cleanup();
});

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Discard a card">
        content
      </Dialog>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title, children and footer when open', () => {
    render(
      <Dialog open onClose={() => {}} title="Discard a card" footer={<button>Confirm</button>}>
        <p>Pick a card to discard.</p>
      </Dialog>
    );
    expect(screen.getByRole('dialog', { name: 'Discard a card' })).toBeInTheDocument();
    expect(screen.getByText('Pick a card to discard.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('calls onClose on backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Discard a card">
        content
      </Dialog>
    );
    // The backdrop is the outer presentation element; clicking it (not the dialog itself)
    // should trigger onClose, while clicking inside the dialog should not.
    await user.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the dialog', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Discard a card">
        <p>inner content</p>
      </Dialog>
    );
    await user.click(screen.getByText('inner content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Discard a card">
        content
      </Dialog>
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
