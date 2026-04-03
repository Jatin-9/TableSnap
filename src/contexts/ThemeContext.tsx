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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<Theme | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchTheme = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('themeCheck')
          .eq('id', user.id)
          .single();

        if (data?.themeCheck === 'dark' || data?.themeCheck === 'light') {
          setTheme(data.themeCheck);
          setLoading(false);
          return;
        }

        if (error) {
          console.error('Error fetching theme from database:', error);
        }
      }

      const savedTheme = localStorage.getItem('theme') as Theme | null;

      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
        setLoading(false);
        return;
      }

      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
      setLoading(false);
    };

    fetchTheme();
  }, [user]);

  useEffect(() => {
    if (!theme) return;

    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme: theme ?? 'light',
      toggleTheme: () =>
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light')),
      setTheme,
    }),
    [theme]
  );

  if (loading) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return context;
}