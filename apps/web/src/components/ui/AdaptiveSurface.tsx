import React, { useEffect, useId, useState } from 'react';

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
  /** Called when the user dismisses the surface (backdrop click, header click, or close button). */
  onClose: () => void;
  /** Title shown in the surface header. Usually plain text, but accepts rich content
   *  (e.g. a styled badge or subtitle) for callers that need it. */
  title: React.ReactNode;
  /** Main surface content. */
  children: React.ReactNode;
  /** Whether the body content is vertically scrollable. Defaults to true. When false, avoids scrollbars. */
  scrollable?: boolean;
  /** Desktop presentation mode: 'drawer' (default right slide-over) or 'modal' (large centered modal for charts/stats). */
  desktopVariant?: 'drawer' | 'modal';
}

/**
 * Content surface for trade/dev-cards/event-log/rules/etc. Presents as a right-side slide-over
 * drawer (or large centered modal when `desktopVariant="modal"`) above the ~960px breakpoint, and
 * as a bottom sheet (with a drag-handle visual) below it.
 * The breakpoint is tracked via matchMedia rather than CSS alone, since the two presentations
 * need different DOM/animation treatment.
 */
export function AdaptiveSurface({
  open,
  onClose,
  title,
  children,
  scrollable = true,
  desktopVariant = 'drawer'
}: AdaptiveSurfaceProps): React.ReactElement | null {
  const isCompact = useIsCompactViewport();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isDesktopModal = !isCompact && desktopVariant === 'modal';

  const backdropClassName = isDesktopModal
    ? 'fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-4 sm:p-6'
    : 'fixed inset-0 z-[150] bg-black/60';

  const panelPositionClasses = isCompact
    ? 'absolute inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl animate-[slideUp_0.2s_ease-out]'
    : isDesktopModal
      ? 'relative h-[88vh] max-h-[920px] w-full max-w-5xl rounded-xl animate-[modalIn_0.18s_ease-out]'
      : 'absolute inset-y-0 right-0 h-full w-full max-w-md animate-[slideIn_0.2s_ease-out]';

  return (
    <div className={backdropClassName} onClick={onClose} role="presentation">
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
      `}</style>
      <div
        className={`flex flex-col border border-line bg-surface text-ink shadow-2xl ${panelPositionClasses}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        {isCompact ? (
          <div
            className="flex cursor-pointer justify-center pt-2.5 pb-1 select-none transition-opacity hover:opacity-75"
            onClick={onClose}
            title="Apasă pentru a închide / Click to close"
          >
            <div className="h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
          </div>
        ) : null}
        {/* Header - entire bar triggers close on click */}
        <div
          onClick={onClose}
          className="group flex cursor-pointer select-none items-center justify-between border-b border-line px-5 py-3.5 transition-colors hover:bg-surfaceMuted/60"
          title="Apasă oriunde pe antet sau pe butonul X pentru a închide / Click header or X to close"
        >
          <h2 id={titleId} className="flex-1 pr-2 text-base font-semibold text-ink sm:text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-line bg-surfaceMuted font-bold text-ink shadow-sm transition-all hover:border-red-400 hover:bg-red-500/20 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <span className="text-lg leading-none">✕</span>
          </button>
        </div>
        <div className={`flex-1 min-h-0 ${scrollable ? 'overflow-y-auto' : 'flex flex-col overflow-hidden'} px-5 py-4`}>
          {children}
        </div>
      </div>
    </div>
  );
}
