import React from 'react';
import { Theme } from '../../hooks/useTheme';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'xmas', label: 'Xmas' }
];

export interface ThemeToggleProps {
  /** Currently active theme. */
  theme: Theme;
  /** Called with the newly picked theme. */
  setTheme: (theme: Theme) => void;
}

/**
 * Three buttons (Light/Dark/Xmas). Takes `theme`/`setTheme` as props rather than calling
 * useTheme() itself — this component only mounts while a parent drawer/panel is open, so
 * owning the hook here would mean the theme never applies to anything rendered before that
 * first open (including the trigger that opens it). Call useTheme() once, somewhere always
 * mounted (e.g. the app root), and pass its result down.
 */
export function ThemeToggle({ theme, setTheme }: ThemeToggleProps): React.ReactElement {
  return (
    <div role="group" aria-label="Theme" className="flex gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          onClick={() => setTheme(option.value)}
          className={`flex min-h-[44px] items-center justify-center rounded border px-3 py-1.5 text-sm font-medium ${
            theme === option.value
              ? 'border-accent bg-accent text-accentInk'
              : 'border-line bg-surface text-ink hover:bg-surfaceMuted'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
