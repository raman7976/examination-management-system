/** @type {import('tailwindcss').Config} */
//
// All colours and shadows resolve through CSS variables declared in
// frontend/src/design/tokens.css. That file is the single source of truth;
// this config just exposes them as Tailwind utilities.
//
// Dark mode is class-based: add `dark` to <html> to swap palettes.
//
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand ──
        brand: {
          50:  'rgb(var(--color-brand-50)  / <alpha-value>)',
          100: 'rgb(var(--color-brand-100) / <alpha-value>)',
          500: 'rgb(var(--color-brand-500) / <alpha-value>)',
          600: 'rgb(var(--color-brand-600) / <alpha-value>)',
          700: 'rgb(var(--color-brand-700) / <alpha-value>)',
        },
        // ── Surfaces ──
        bg:           'rgb(var(--color-bg)              / <alpha-value>)',
        surface:      'rgb(var(--color-surface)         / <alpha-value>)',
        surface2:     'rgb(var(--color-surface-2)       / <alpha-value>)',
        border:       'rgb(var(--color-border)          / <alpha-value>)',
        borderStrong: 'rgb(var(--color-border-strong)   / <alpha-value>)',
        // ── Text ──
        text:         'rgb(var(--color-text)            / <alpha-value>)',
        textMuted:    'rgb(var(--color-text-muted)      / <alpha-value>)',
        textFaint:    'rgb(var(--color-text-faint)      / <alpha-value>)',
        // ── Semantic ──
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger:  'rgb(var(--color-danger)  / <alpha-value>)',
        info:    'rgb(var(--color-info)    / <alpha-value>)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        slow: '280ms',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        fadeIn:  'fadeIn 180ms var(--ease-out)',
      },
    },
  },
  plugins: [],
};
