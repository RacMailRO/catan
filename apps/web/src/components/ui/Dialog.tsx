import React, { useEffect } from 'react';

export interface DialogProps {
  /** Whether the dialog is visible. When false, nothing is rendered. */
  open: boolean;
  /** Called when the user dismisses the dialog (backdrop click or Escape key). */
  onClose: () => void;
  /** Title shown in the dialog header. */
  title: string;
  /** Main dialog content. */
  children: React.ReactNode;
  /** Optional footer content, typically action buttons. */
  footer?: React.ReactNode;
}

/**
 * Small centered blocking dialog for true yes/no decisions (discard cards, confirmations).
 * Closes on backdrop click or Escape. Styled with Tailwind utilities using the token-mapped
 * theme colors, so it follows whichever theme is active via `data-theme`.
 */
export function Dialog({ open, onClose, title, children, footer }: DialogProps): React.ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg border border-line bg-surface text-ink shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
        </div>
        <div className="px-5 py-4 text-ink">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
