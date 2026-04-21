import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useUsage, LIMITS, PRO_LIMITS } from '../../hooks/useUsage';
import { supabase } from '../../lib/supabase';
import {
  Settings as SettingsIcon,
  User,
  Shield,
  Save,
  Sparkles,
  Zap,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { isPro, uploadsThisMonth, totalTables, chatQueriesThisMonth, loading: usageLoading } = useUsage();

  const [preferences, setPreferences] = useState(user?.preferences || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  // Fetch the customer portal URL so "Manage subscription" links to the right place
  useEffect(() => {
    if (!isPro || !user) return;
    supabase
      .from('users')
      .select('subscription_portal_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.subscription_portal_url) setPortalUrl(data.subscription_portal_url);
      });
  }, [isPro, user]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({ preferences })
      .eq('id', user!.id);

    if (!error) {
      updateUser({ preferences });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  // Kicks off a Lemon Squeezy hosted checkout — same flow as the UpgradeModal
  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
        }
      );
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error('Could not start checkout. Please try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error('Could not start checkout. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Usage bar helper — shows a coloured progress bar with label
  function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
    const pct = Math.min((used / limit) * 100, 100);
    const near = pct >= 80;
    return (
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-500 dark:text-gray-400">{label}</span>
          <span className={`font-semibold ${near ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}>
            {used} / {limit}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-zinc-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${near ? 'bg-red-500' : 'bg-blue-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-blue-500">Manage your account preferences</p>
      </div>

      <div className="grid gap-6 max-w-4xl">

        {/* ── Plan & Billing ────────────────────────────────────────────────── */}
        <div className="dashboard-card overflow-hidden">
          {/* Show a neutral skeleton until we know the user's tier */}
          {usageLoading ? (
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                <div className="space-y-2">
                  <div className="h-4 w-24 rounded bg-gray-200 dark:bg-zinc-700" />
                  <div className="h-3 w-36 rounded bg-gray-200 dark:bg-zinc-700" />
                </div>
              </div>
            </div>
          ) : (<>
          {/* Card header — gradient for Pro, plain for Free */}
          <div className={`p-6 ${isPro
            ? 'bg-gradient-to-r from-amber-500 to-orange-500'
            : 'border-b border-gray-100 dark:border-zinc-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isPro ? 'bg-white/20' : 'bg-amber-100 dark:bg-amber-900/30'
                }`}>
                  {isPro
                    ? <Sparkles className="w-5 h-5 text-white" />
                    : <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  }
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${isPro ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                    {isPro ? 'Pro Plan' : 'Free Plan'}
                  </h2>
                  <p className={`text-sm ${isPro ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                    {isPro ? '$8 / month · Billed via Dodo Payments' : 'Upgrade to unlock higher limits'}
                  </p>
                </div>
              </div>

              {isPro && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white ring-1 ring-white/30">
                  <Sparkles className="w-3 h-3" />
                  PRO
                </span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Usage bars */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                This month's usage
              </p>
              <UsageBar
                label="Uploads"
                used={uploadsThisMonth}
                limit={isPro ? PRO_LIMITS.UPLOADS_PER_MONTH : LIMITS.UPLOADS_PER_MONTH}
              />
              <UsageBar
                label="Tables stored"
                used={totalTables}
                limit={isPro ? PRO_LIMITS.TOTAL_TABLES : LIMITS.TOTAL_TABLES}
              />
              <UsageBar
                label="AI queries"
                used={chatQueriesThisMonth}
                limit={isPro ? PRO_LIMITS.CHAT_QUERIES_PER_MONTH : LIMITS.CHAT_QUERIES_PER_MONTH}
              />
            </div>

            {/* CTA */}
            {isPro ? (
              // Pro users — link to their personal Lemon Squeezy customer portal
              // portalUrl is saved by the webhook on subscription_created/updated
              portalUrl ? (
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Manage subscription
                </a>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  To cancel, email us at support@tablesnap.co.in
                </p>
              )
            ) : (
              // Free users — upgrade button
              <div className="flex items-center gap-4">
                <button
                  onClick={handleUpgrade}
                  disabled={checkoutLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-sm transition-all shadow-sm shadow-amber-400/30 disabled:opacity-60"
                >
                  {checkoutLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing checkout...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Upgrade to Pro — $8/month</>
                  )}
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500">Cancel anytime</span>
              </div>
            )}
          </div>
          </>)}
        </div>

        {/* ── Account Information ───────────────────────────────────────────── */}
        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Account Information</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 dark:bg-zinc-700 dark:text-gray-300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                Role
              </label>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-gray-400 fill-green-500" />
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium capitalize">
                  {user?.role}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                Member Since
              </label>
              <input
                type="text"
                value={new Date(user?.created_at || '').toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                disabled
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 dark:bg-zinc-700 dark:text-gray-300"
              />
            </div>
          </div>
        </div>

        {/* ── Preferences ──────────────────────────────────────────────────── */}
        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <SettingsIcon className="w-6 h-6 text-green-700" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Preferences</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg dark:bg-zinc-700 dark:text-gray-300">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-300">Show Confidence Scores</p>
                <p className="text-sm text-gray-500 dark:text-blue-500">
                  Display OCR confidence in table list
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.showConfidence !== false}
                onChange={(e) =>
                  setPreferences({ ...preferences, showConfidence: e.target.checked })
                }
                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
            {saved && (
              <span className="text-green-600 font-medium">Saved successfully!</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
