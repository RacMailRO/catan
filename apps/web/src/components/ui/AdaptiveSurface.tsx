import React, { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 960px)';

/**
 * Tracks whether the mobile/tablet breakpoint (<= 960px, matching the breakpoint already used
 * in styles.css) is currently active, updating live as the viewport is resized.
 */
function useIsCompactViewport(): boolean {
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    try {
      return window.matchMedia(MOBILE_QUERY).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(MOBILE_QUERY);
    } catch {
      return;
    }
    const handleChange = (event: MediaQueryListEvent) => setIsCompact(event.matches);
    setIsCompact(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return isCompact;
}

export interface AdaptiveSurfaceProps {
  /** Whether the surface is visible. When false, nothing is rendered. */
  open: boolean;
  /** Called when the user dismisses the surface (backdrop click or close control). */
  onClose: () => void;
  /** Title shown in the surface header. */
  title: string;
  /** Main surface content. */
  children: React.ReactNode;
}

/**
 * Content surface for trade/dev-cards/event-log/rules/etc. Presents as a right-side slide-over
 * drawer above the ~960px breakpoint, and as a bottom sheet (with a drag-handle visual) below it.
 * The breakpoint is tracked via matchMedia rather than CSS alone, since the two presentations
 * need different DOM/animation treatment.
 */
export function AdaptiveSurface({ open, onClose, title, children }: AdaptiveSurfaceProps): React.ReactElement | null {
  const isCompact = useIsCompactViewport();

  if (!open) return null;

  const panelPositionClasses = isCompact
    ? 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl animate-[slideUp_0.2s_ease-out]'
    : 'inset-y-0 right-0 h-full w-full max-w-md animate-[slideIn_0.2s_ease-out]';

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} role="presentation">
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      <div
        className={`absolute flex flex-col border border-line bg-surface text-ink shadow-xl ${panelPositionClasses}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        {isCompact ? (
          <div className="flex justify-center pt-2">
            <div className="h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
          </div>
        ) : null}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 py-1 text-inkSoft hover:bg-surfaceMuted hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
