import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table2, Lock, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  // Whether a valid PASSWORD_RECOVERY session is active in this tab.
  // Supabase automatically parses the #access_token hash from the reset link
  // and fires a PASSWORD_RECOVERY event in onAuthStateChange.
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Track completion via ref so the cleanup effect always sees the latest value.
  const doneRef = useRef(false);
  useEffect(() => { doneRef.current = done; }, [done]);

  // Sign out when leaving the page without completing the reset. This clears
  // the recovery session from localStorage so the app doesn't treat it as a
  // full login and redirect to the dashboard.
  useEffect(() => {
    return () => {
      if (!doneRef.current) {
        supabase.auth.signOut();
      }
    };
  }, []);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event — Supabase fires this when the
    // user arrives via the reset email link and the SDK has exchanged the
    // one-time token for a short-lived session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // updateUser replaces the user's password using the active recovery session.
      // The JWT from the reset link authorises this specific operation.
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      setDone(true);
      // Give the user a moment to read the success message, then go to dashboard.
      setTimeout(() => navigate('/dashboard', { replace: true }), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-white dark:bg-zinc-950">
      <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-blue-600/5 dark:from-gray-950 dark:via-gray-950 dark:to-blue-600/5" />
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-2xl p-8 shadow-2xl shadow-blue-600/5 border border-gray-200/80 dark:border-zinc-800/60">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <Link to="/" className="flex items-center gap-2 mb-4 group">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center group-hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25">
                <Table2 className="w-6 h-6 text-white" />
              </div>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Set new password</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">TableSnap</p>
          </div>

          {/* Success state */}
          {done && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="text-gray-700 dark:text-gray-200 font-medium text-center">
                Password updated! Redirecting you to the dashboard…
              </p>
            </div>
          )}

          {/* Waiting for recovery session — shown if user lands directly without the link */}
          {!done && !ready && (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Waiting for your reset link to be verified…
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                If nothing happens, the link may have expired.{' '}
                <Link to="/login" className="text-blue-500 hover:text-blue-400 underline">
                  Request a new one
                </Link>
              </p>
            </div>
          )}

          {/* New password form — shown once the recovery session is active */}
          {!done && ready && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  New password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                ) : (
                  <>Update password <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-500 mt-6">
          <Link to="/login" className="hover:text-gray-900 dark:hover:text-white transition-colors">
            ← Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
