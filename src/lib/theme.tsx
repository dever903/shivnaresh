import { useEffect } from 'react';

export type Theme = 'dark' | 'light';

export function getInitialTheme(): Theme {
  return 'dark';
}

export function applyTheme(_theme?: Theme) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('shivnaresh_theme', 'dark');
  const root = document.documentElement;
  root.classList.add('dark');
  root.classList.remove('light');
  root.style.colorScheme = 'dark';
}

export function useTheme() {
  useEffect(() => {
    applyTheme('dark');
  }, []);

  const toggleTheme = () => {
    applyTheme('dark');
  };

  return { theme: 'dark' as Theme, toggleTheme };
}

export function ThemeToggle(_props: { theme?: Theme; toggleTheme?: () => void }) {
  return null;
}
