import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem('shivnaresh_theme') as Theme | null;
  return saved === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('shivnaresh_theme', theme);
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    applyTheme(next);
  };

  return { theme, toggleTheme };
}

export function ThemeToggle({ theme, toggleTheme }: { theme: Theme; toggleTheme: () => void }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
        theme === 'dark'
          ? 'bg-white/10 text-amber-300 hover:bg-white/20 border border-white/10'
          : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-300'
      }`}
      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle theme"
    >
      <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
      <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider">
        {theme === 'dark' ? 'Light' : 'Dark'}
      </span>
    </button>
  );
}

