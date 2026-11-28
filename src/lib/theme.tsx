import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'dark' | 'light';

export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem('shivnaresh_theme') as Theme | null;
  return saved === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('shivnaresh_theme', theme);
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
    root.style.backgroundColor = '#B1A38E';
    root.style.colorScheme = 'light';
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.backgroundColor = '#08090A';
    root.style.colorScheme = 'dark';
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    applyTheme(next);
  };

  return { theme, toggleTheme };
}

/**
 * 6.16 Theme Toggle Switch (56x30 track, 22px knob translating 27px over 400ms).
 */
export function ThemeToggle({ theme, toggleTheme }: { theme?: Theme; toggleTheme?: () => void }) {
  const current = theme || 'dark';
  const isDark = current === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      onClick={toggleTheme}
      className="relative inline-flex h-[30px] w-[56px] shrink-0 cursor-pointer items-center rounded-full border border-[var(--line-2)] bg-[var(--ink-2)] p-0 transition-colors duration-[400ms] ease-[cubic-bezier(.19,1,.22,1)] hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink-0)] motion-reduce:transition-none"
    >
      <span className="pointer-events-none flex w-full items-center justify-between px-2">
        <Sun className="h-3 w-3 text-[var(--accent)] opacity-80"aria-hidden="true" />
        <Moon className="h-3 w-3 text-[var(--text-mid)] opacity-80"aria-hidden="true" />
      </span>
      <span
        aria-hidden="true"
        style={{
          transform: isDark ? 'translateX(27px)' : 'translateX(0px)',
        }}
        className="pointer-events-none absolute left-[3px] top-[3px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--shadow-l1)] transition-transform duration-[400ms] ease-[cubic-bezier(.19,1,.22,1)] motion-reduce:transition-none"
      >
        {isDark ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
      </span>
    </button>
  );
}
