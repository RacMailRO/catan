import React, { useState } from 'react';

export interface AppNavItem {
  /** Stable identifier passed back to onNavigate. */
  id: string;
  /** Display label shown in the nav drawer. */
  label: string;
  /** Optional leading icon (emoji or element) shown before the label. */
  icon?: React.ReactNode;
}

export interface AppNavProps {
  /** Nav items to list in the drawer, in display order. */
  items: AppNavItem[];
  /** id of the currently active item, used to highlight it in the drawer. */
  activeId: string;
  /** Called with an item's id when the user picks it from the drawer. */
  onNavigate: (id: string) => void;
  /**
   * Optional content rendered below the main nav list (e.g. quick links, theme toggle).
   * Pass a render function instead of a plain node when footer content needs to close the
   * drawer itself (e.g. a quick link that opens a modal) — it receives a `closeNav` callback.
   */
  footer?: React.ReactNode | ((closeNav: () => void) => React.ReactNode);
}

/**
 * Hamburger trigger plus a left-side off-canvas nav drawer. Owns its own open/closed state
 * (following this codebase's convention of components owning their UI state, see
 * SandboxMode.tsx) — callers only provide the list of items, the active id, and a callback.
 * Generic over nav items; knows nothing about any app-specific tab type.
 */
export function AppNav({ items, activeId, onNavigate, footer }: AppNavProps): React.ReactElement {
  const [open, setOpen] = useState(false);

  const handleNavigate = (id: string) => {
    onNavigate(id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-3 py-2 text-ink hover:bg-surfaceMuted"
      >
        ☰
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <nav
            aria-label="Main navigation"
            className="absolute inset-y-0 left-0 h-full w-64 overflow-y-auto border-r border-line bg-surface text-ink shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-semibold text-inkSoft">Menu</span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 py-1 text-inkSoft hover:bg-surfaceMuted hover:text-ink"
              >
                ×
              </button>
            </div>
            <ul className="flex flex-col py-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    aria-current={item.id === activeId ? 'page' : undefined}
                    className={`flex min-h-[44px] w-full items-center gap-2 px-4 py-3 text-left ${
                      item.id === activeId
                        ? 'bg-accent text-accentInk'
                        : 'text-ink hover:bg-surfaceMuted'
                    }`}
                  >
                    {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            {footer ? (
              <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
                {typeof footer === 'function' ? footer(() => setOpen(false)) : footer}
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}
    </>
  );
}
