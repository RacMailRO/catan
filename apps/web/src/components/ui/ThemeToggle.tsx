import React from 'react';
import { useTheme, Theme } from '../../hooks/useTheme';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'xmas', label: 'Xmas' }
];

/**
 * Three buttons (Light/Dark/Xmas) backed by useTheme(). Standalone for now; intended to
 * eventually live inside AppNav's drawer.
 */
export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme } = useTheme();

  return (
    <div role="group" aria-label="Theme" className="flex gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          onClick={() => setTheme(option.value)}
          className={`rounded border px-3 py-1.5 text-sm font-medium ${
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
