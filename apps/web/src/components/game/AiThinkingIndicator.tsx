import React, { useEffect, useState } from 'react';
import { Locale } from '../../i18n';

export type AiThinkingVariant = 'negotiating' | 'ai_turn' | 'syncing';

export interface AiThinkingIndicatorProps {
  /** `Date.now()` timestamp when the pending AI/server request started, or null when idle. */
  since: number | null;
  locale: Locale;
  /** Contextual label explaining what the client is actually waiting on. Defaults to 'negotiating'. */
  variant?: AiThinkingVariant;
  /** Optional grace period (ms) before revealing the banner so fast local/server roundtrips never flicker. */
  delayMs?: number;
}

const VARIANT_LABELS: Record<AiThinkingVariant, { ro: string; en: string }> = {
  negotiating: {
    ro: 'Adversarii (AI) negociază…',
    en: 'Opponents (AI) are negotiating…'
  },
  ai_turn: {
    ro: 'Adversarii (AI) își joacă tura…',
    en: 'AI opponents are taking their turn…'
  },
  syncing: {
    ro: 'Se sincronizează cu serverul…',
    en: 'Syncing with server…'
  }
};

/**
 * Prominent banner shown while waiting on a server request that takes longer than `delayMs`
 * (for instance when the server steps AI turns or negotiates a trade offer). Without this,
 * multi-second AI waits are indistinguishable from the game being stuck.
 *
 * Intentionally has no close/dismiss affordance and isn't rendered as a backdrop-style modal —
 * it must stay visible regardless of what the player clicks (including the board) until the
 * request actually resolves.
 */
export function AiThinkingIndicator({
  since,
  locale,
  variant = 'negotiating',
  delayMs = 0
}: AiThinkingIndicatorProps): React.ReactElement | null {
  const [, tick] = useState(0);

  useEffect(() => {
    if (since === null) return;
    const id = setInterval(() => tick((t) => t + 1), 500);
    const remainingDelay = delayMs > 0 ? Math.max(0, delayMs - (Date.now() - since)) : 0;
    const delayTimer = remainingDelay > 0 ? setTimeout(() => tick((t) => t + 1), remainingDelay) : null;
    return () => {
      clearInterval(id);
      if (delayTimer !== null) clearTimeout(delayTimer);
    };
  }, [since, delayMs]);

  if (since === null) return null;
  const elapsedMs = Date.now() - since;
  if (delayMs > 0 && elapsedMs < delayMs) return null;
  const elapsedSec = Math.max(0, Math.round(elapsedMs / 1000));
  const label = VARIANT_LABELS[variant][locale];

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
          {label} {elapsedSec}s
        </span>
      </div>
    </div>
  );
}
