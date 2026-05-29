import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/useTheme.js';

// ─────────────────────────────────────────────────────────────────────────────
//  ThemeToggle — 28×28 px icon button. Slot it into the top bar.
//
//  We don't animate the icon swap (would feel busy on an admin tool with
//  rapid clicks); instead a quick colour fade communicates the change.
// ─────────────────────────────────────────────────────────────────────────────
export default function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={[
        'inline-flex items-center justify-center w-9 h-9 rounded-md',
        'text-textMuted hover:text-text hover:bg-surface2',
        'transition-colors duration-fast ease-out cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        className,
      ].join(' ')}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
