import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

type Theme = 'light' | 'dark';

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Read the initial theme synchronously from localStorage so the value is
// available on the first render — the inline script in index.html already
// applied the class to <html>, so this just keeps React in sync with it.
function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Start with the localStorage value immediately — no flash, no null state
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Once the user is known, check if they have a saved preference in the DB
  // and upgrade to it if it differs from the local value.
  useEffect(() => {
    if (!user) return;

    supabase
      .from('users')
      .select('themeCheck')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.themeCheck === 'dark' || data?.themeCheck === 'light') {
          setThemeState(data.themeCheck);
        }
      });
  }, [user?.id]);

  // Keep the <html> class and localStorage in sync whenever theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setThemeState((prev) => (prev === 'light' ? 'dark' : 'light')),
      setTheme: setThemeState,
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return context;
}
