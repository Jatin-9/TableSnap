import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, User } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
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

  const fetchUserProfile = async (userId: string, attempt = 0) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setUser(data);
        // Fire-and-forget — stamp the user as active now without blocking the login flow.
        // .then() is required: Supabase's query builder is lazy and only executes when
        // you await or chain .then() — calling .update().eq() alone does nothing.
        supabase
          .from('users')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', userId)
          .then(() => {});
      } else if (error) {
        console.error('Error fetching user profile:', error);
        setUser(null);
      } else if (attempt < 5) {
        // Row not found yet — onAuthStateChange raced ahead of the users INSERT
        // on signup. Retry up to 5 times (max ~1.5s wait) before giving up.
        await new Promise((r) => setTimeout(r, 300));
        return fetchUserProfile(userId, attempt + 1);
      } else {
        // Still no row after retries — this is a new OAuth user (Google sign-in).
        // They never go through signUp(), so there's no client-side INSERT.
        // Create the profile row now using their session email.
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          await supabase.from('users').insert({
            id: userId,
            email: session.user.email,
            role: 'user',
          });
          // Fetch the freshly created row
          const { data: created } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          if (created) {
            setUser(created);
            supabase
              .from('users')
              .update({ last_active_at: new Date().toISOString() })
              .eq('id', userId)
              .then(() => {});
          } else {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
    } catch (err) {
      console.error('fetchUserProfile failed:', err);
      setUser(null);
    }
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // After clicking the confirmation link, send user straight to the dashboard.
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) throw error;
    // User row is created by fetchUserProfile after the confirmation link is clicked.
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw error;
  };

  const signInWithGithub = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw error;
  };

  // Merges partial updates into the in-memory user object so any component
  // that reads from useAuth() sees the new values immediately — without
  // needing a full page refresh or a round-trip back to the DB.
  const updateUser = (updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
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
    signInWithGoogle,
    signInWithGithub,
    signOut,
    updateUser,
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
