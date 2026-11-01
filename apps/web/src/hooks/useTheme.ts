import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'xmas';

const STORAGE_KEY = 'catan-theme';
// The app's legacy CSS has only ever shipped one look — navy/gold ('dark' here, which reuses
// those exact values, see tokens.css) — so that's the default, not an independently-chosen 'light'.
const DEFAULT_THEME: Theme = 'dark';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'xmas';
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'xmas') return stored;
    return DEFAULT_THEME;
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc.) — fall back silently.
    return DEFAULT_THEME;
  }
}

/**
 * Reads/writes the active theme ('light' | 'dark' | 'xmas') to localStorage under the
 * 'catan-theme' key (default 'light'), and reflects it onto <html data-theme="..."> so the
 * CSS variables in styles/tokens.css pick it up. Safe to call from multiple components; each
 * instance syncs independently via its own effect.
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
    } catch {
      // Non-DOM environment (unlikely in the browser, but keep this hook from throwing).
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore write failures — the in-memory state still updates for this session.
    }
  }, []);

  return { theme, setTheme };
}
