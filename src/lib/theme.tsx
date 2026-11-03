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
    root.style.backgroundColor = '#97c1a9';
    root.style.colorScheme = 'light';
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.backgroundColor = '#070709';
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

export function ThemeToggle({ theme, toggleTheme }: { theme?: Theme; toggleTheme?: () => void }) {
  const current = theme || 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all shadow-sm cursor-pointer select-none ${
        current === 'dark'
          ? 'bg-white/10 text-amber-300 hover:bg-white/20 border border-white/15'
          : 'bg-[#82b095] text-slate-900 hover:bg-[#72a185] border border-[#6b997e]'
      }`}
      title={current === 'dark' ? 'Switch to Light Mode (#97c1a9)' : 'Switch to Dark Mode'}
      aria-label="Toggle theme"
    >
      <span>{current === 'dark' ? '☀️' : '🌙'}</span>
      <span className="text-[11px] font-bold uppercase tracking-wider">
        {current === 'dark' ? 'Light' : 'Dark'}
      </span>
    </button>
  );
}
