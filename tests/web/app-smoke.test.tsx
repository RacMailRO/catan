// @vitest-environment jsdom
//
// App-level smoke/regression test for apps/web/src/App.tsx — a 6,000+ line component with
// zero render coverage before this file existed. This is NOT meant to exercise every feature;
// it is a safety net ahead of an incremental UI refactor (component extraction, AdaptiveSurface/
// Dialog/AppNav pattern, Tailwind). Assertions deliberately target visible Romanian text and
// ARIA roles rather than CSS classes, since markup/class names are expected to change across
// refactor phases while the underlying behavior (what the user sees/can click) should not.
//
// Scope note: most of the 18 `modal-backdrop` modals in App.tsx (score_bank, event_log,
// dev_cards, trade, costs_help's in-game trigger, etc.) only render once a real game is in
// progress. "Local hot-seat" play has been removed from the UI (the `recorder` state that would
// drive it is declared but never set — see App.tsx line ~414) and the only way to reach the
// 'game' tab today is the online lobby flow (REST + WebSocket against apps/server). Faking that
// whole flow here would require deeply mocking apps/web/src/online.ts's network calls, which
// would make this test tightly coupled to online.ts internals and prone to breaking for reasons
// unrelated to the refactor this safety net exists to protect against. So this file covers the
// two modals that ARE reachable directly from a fresh lobby render (Full Rules, Release Notes),
// plus tab navigation and the lobby screen itself. If/when a local-only test/dev game path is
// reintroduced, extend this file to cover the in-game modals too.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { App } from '../../apps/web/src/App';

// Heavy/feature-area subcomponents rendered by whole tabs — stubbed so this App-shell smoke
// test doesn't depend on (or pay the cost of) their internals, and doesn't break when they
// change shape during the refactor. App.tsx's own tab-switching logic is still exercised for
// real; only what's *inside* those tabs is replaced.
vi.mock('../../apps/web/src/components/ReplayAndAnalysisView', () => ({
  ReplayAndAnalysisView: () => <div>Replay &amp; Analysis Stub</div>
}));
vi.mock('../../apps/web/src/components/HallOfFameView', () => ({
  HallOfFameView: () => <div>Hall of Fame Stub</div>
}));
vi.mock('../../apps/web/src/components/SandboxMode', () => ({
  SandboxMode: () => <div>Sandbox Mode Stub</div>
}));

const VERSION_PAYLOAD = {
  version: 'v9.9.9-test',
  commitCount: 42,
  shortHash: 'abc1234',
  releaseNotes: [{ hash: 'abc1234', date: '2026-01-01', message: 'Test release note' }]
};

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/version')) {
      return {
        ok: true,
        json: async () => VERSION_PAYLOAD
      } as Response;
    }
    // Everything else (public lobby list, etc.) — App.tsx/online.ts already handle a failed
    // fetch gracefully (caught and swallowed), so a generic 404 keeps the test deterministic
    // and network-free without needing to model every endpoint.
    return {
      ok: false,
      status: 404,
      json: async () => ({})
    } as Response;
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', mockFetch());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App (smoke)', () => {
  it('renders the lobby screen in Romanian by default', async () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /Reguli & Opțiuni Partidă/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Creează Partidă Online/i })
    ).toBeInTheDocument();
  });

  it('switches tabs via the nav menu without throwing, including stubbed feature tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    const navTrigger = screen.getByRole('button', { name: /☰/ });

    // Benchmark tab — plain in-shell content, no network/game needed.
    await user.click(navTrigger);
    await user.click(screen.getByRole('button', { name: /Simulator & Reguli/i }));
    expect(
      await screen.findByRole('button', { name: /Rulează Benchmark AI/i })
    ).toBeInTheDocument();

    // Hall of Fame tab — stubbed subcomponent.
    await user.click(navTrigger);
    await user.click(screen.getByRole('button', { name: /Hall of Fame/i }));
    expect(await screen.findByText(/Hall of Fame Stub/i)).toBeInTheDocument();

    // Sandbox tab (only shown for a "local" hostname — jsdom defaults to localhost).
    await user.click(navTrigger);
    const sandboxBtn = screen.queryByRole('button', { name: /Mediu de Test/i });
    if (sandboxBtn) {
      await user.click(sandboxBtn);
      expect(await screen.findByText(/Sandbox Mode Stub/i)).toBeInTheDocument();
    }

    // Back to Lobby.
    await user.click(navTrigger);
    await user.click(screen.getByRole('button', { name: /Lobby & Configurare/i }));
    expect(
      await screen.findByRole('heading', { name: /Reguli & Opțiuni Partidă/i })
    ).toBeInTheDocument();
  });

  it('opens and closes the Full Rules modal from the lobby', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Regulile Jocului/i }));

    const heading = await screen.findByRole('heading', { name: /Regulament Oficial/i });
    expect(heading).toBeInTheDocument();

    const dialog = heading.closest('div')!.parentElement as HTMLElement;
    await user.click(within(dialog).getByRole('button', { name: /Închide/i }));

    expect(screen.queryByRole('heading', { name: /Regulament Oficial/i })).not.toBeInTheDocument();
  });

  it('opens and closes the Release Notes modal via the version badge', async () => {
    const user = userEvent.setup();
    render(<App />);

    const versionBadge = await screen.findByRole('button', { name: VERSION_PAYLOAD.version });
    await user.click(versionBadge);

    const heading = await screen.findByRole('heading', { name: /Note de Lansare/i });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(/Test release note/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Închide/i }));

    expect(screen.queryByRole('heading', { name: /Note de Lansare/i })).not.toBeInTheDocument();
  });
});
