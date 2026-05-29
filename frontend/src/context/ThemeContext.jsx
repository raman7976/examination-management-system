import { createContext, useEffect, useState, useCallback, useMemo } from 'react';

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeCtx = createContext(null);

// ─────────────────────────────────────────────────────────────────────────────
//  ThemeProvider — light/dark switcher.
//
//  Priority on first load:
//    1. `localStorage.theme`  (if user has chosen explicitly)
//    2. `prefers-color-scheme: dark` media query
//    3. light (default)
//
//  Toggling writes both to localStorage and the `dark` class on <html>.
//  We touch <html> (not <body>) because that's the convention Tailwind's
//  `darkMode: 'class'` strategy looks for, and it lets the dark variables
//  apply BEFORE React even mounts (the inline script in index.html does the
//  initial flash-prevention).
// ─────────────────────────────────────────────────────────────────────────────
function resolveInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(resolveInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else                  root.classList.remove('dark');
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, toggle]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
