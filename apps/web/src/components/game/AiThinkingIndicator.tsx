import React, { useEffect, useState } from 'react';
import { Locale } from '../../i18n';

export interface AiThinkingIndicatorProps {
  /** `Date.now()` timestamp when the pending AI/server request started, or null when idle. */
  since: number | null;
  locale: Locale;
}

/**
 * Prominent, full-width banner shown while waiting on a server request that may process several
 * AI turns in one batch (apps/server processes up to 80 bot actions synchronously, and each bot
 * decision can call an LLM with its own ~2.5s timeout — a multi-bot trade negotiation can take
 * close to a minute). Without this, that wait is indistinguishable from the game being stuck.
 *
 * Intentionally has no close/dismiss affordance and isn't rendered as a backdrop-style modal —
 * it must stay visible regardless of what the player clicks (including the board) until the
 * request actually resolves.
 */
export function AiThinkingIndicator({ since, locale }: AiThinkingIndicatorProps): React.ReactElement | null {
  const [, tick] = useState(0);

  useEffect(() => {
    if (since === null) return;
    const id = setInterval(() => tick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [since]);

  if (since === null) return null;
  const elapsedSec = Math.max(0, Math.round((Date.now() - since) / 1000));

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[250] flex justify-center p-2"
    >
      <div className="flex items-center gap-3 rounded-full border-2 border-accent bg-surface px-5 py-2.5 text-ink shadow-xl">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
        </span>
        <span className="text-sm font-semibold">
          {locale === 'ro'
            ? `Adversarii (AI) negociază… ${elapsedSec}s`
            : `Opponents (AI) are negotiating… ${elapsedSec}s`}
        </span>
      </div>
    </div>
  );
}
