/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surfaceMuted: 'var(--surface-2)',
        ink: 'var(--ink)',
        inkSoft: 'var(--ink-soft)',
        accent: 'var(--accent)',
        accentInk: 'var(--accent-ink)',
        warn: 'var(--warn)',
        line: 'var(--line)'
      }
    }
  },
  plugins: []
};
