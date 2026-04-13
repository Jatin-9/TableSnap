import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, User } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setSupabaseUser(session.user);
          await fetchUserProfile(session.user.id);
        } else {
          setSupabaseUser(null);
          setUser(null);
        }
      } catch (err) {
        console.error('Auth getSession failed:', err);
        setSupabaseUser(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED fires every time you switch browser tabs — Supabase silently
      // refreshes the access token in the background. The user hasn't changed at all,
      // so we skip the full reload to avoid unnecessary re-renders across the whole app.
      if (event === 'TOKEN_REFRESHED') return;

      (async () => {
        // Do NOT set loading:true here. The loading flag is only for the very first
        // auth check when the app starts. Subsequent sign-in/sign-out events should
        // update state quietly without making every page flash a skeleton.
        try {
          if (session?.user) {
            setSupabaseUser(session.user);
            await fetchUserProfile(session.user.id);
          } else {
            setSupabaseUser(null);
            setUser(null);
          }
        } catch (err) {
          console.error('AuthStateChange handler failed:', err);
          setSupabaseUser(null);
          setUser(null);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setUser(data);
      } else if (error) {
        console.error('Error fetching user profile:', error);
        setUser(null);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('fetchUserProfile failed:', err);
      setUser(null);
    }
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      await supabase.from('users').insert({
        id: data.user.id,
        email: data.user.email!,
        role: 'user',
      });
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    user,
    supabaseUser,
    loading,
    signUp,
    signIn,
    signOut,
    isSuperAdmin: user?.role === 'super_admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
