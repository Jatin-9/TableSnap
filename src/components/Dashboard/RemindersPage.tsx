import { useState, useEffect } from 'react';
import { Bell, BellOff, Mail, Calendar, Loader2, CheckCircle, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, Reminder } from '../../lib/supabase';
import { RemindersSkeleton } from '../ui/Skeleton';
import { toast } from 'sonner';

export default function RemindersPage() {
  const { user } = useAuth();

  // The user's current reminder row from the DB (null = none set yet)
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Local form state — what the user is currently editing
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');

  // Test email state
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testDetail, setTestDetail] = useState<string>('');

  // ── Load existing reminder ─────────────────────────────────────────────────

  useEffect(() => {
    if (user) loadReminder();
  }, [user]);

  const loadReminder = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', user!.id)
      .eq('delivery_method', 'email')
      .maybeSingle(); // returns null instead of error if no row exists yet

    if (error) {
      console.error('Error loading reminder:', error);
    } else if (data) {
      // Populate the form with whatever is saved in the DB
      setReminder(data);
      setEnabled(data.enabled);
      setFrequency(data.frequency as 'daily' | 'weekly');
    }
    setLoading(false);
  };

  // ── Save changes ───────────────────────────────────────────────────────────

  const saveReminder = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);

    let error;

    if (reminder) {
      // Row already exists — just update the two fields that can change
      ({ error } = await supabase
        .from('reminders')
        .update({ frequency, enabled })
        .eq('id', reminder.id));
    } else {
      // No row yet — insert a fresh one
      const { data, error: insertErr } = await supabase
        .from('reminders')
        .insert({ user_id: user.id, delivery_method: 'email', frequency, enabled })
        .select()
        .single();
      error = insertErr;
      // Store the new row so future saves use update instead of insert
      if (data) setReminder(data);
    }

    if (error) {
      console.error('Error saving reminder:', error);
      toast.error('Failed to save. Please try again.');
    } else {
      // Show a brief "Saved!" tick then fade it out after 3 seconds
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }

    setSaving(false);
  };

  // ── Send test email ────────────────────────────────────────────────────────

  // Calls the edge function directly from the browser using the anon key.
  // The edge function uses the service role key internally to read the DB,
  // so the anon key is enough to invoke it — it just checks for an auth header.
  const sendTestEmail = async () => {
    setSending(true);
    setTestResult(null);
    setTestDetail('');

    // 90-second timeout — the function does DB queries + Resend API call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-vocab-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ test: true }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      const body = await response.json().catch(() => ({}));
      setTestDetail(JSON.stringify(body, null, 2));
      setTestResult(response.ok ? 'success' : 'error');
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        setTestDetail('Request timed out after 90s — check Supabase function logs.');
        setTestResult('error');
      } else {
        setTestDetail(err instanceof Error ? err.message : String(err));
        setTestResult('error');
      }
    } finally {
      setSending(false);
      setTimeout(() => { setTestResult(null); setTestDetail(''); }, 15000);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <RemindersSkeleton />;

  return (
    <div className="p-6 max-w-2xl">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Reminders</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Get vocabulary words from your language tables delivered to your inbox — daily or weekly.
        </p>
      </div>

      {/* Main settings card */}
      <div className="dashboard-card overflow-hidden">

        {/* Card header — shows which email + the on/off toggle */}
        <div className="flex items-center gap-4 p-6 border-b border-gray-100 dark:border-zinc-800">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Vocab Reminders</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sent to <span className="font-medium text-gray-700 dark:text-gray-300">{user?.email}</span>
            </p>
          </div>

          {/* Toggle switch — clicking flips the enabled state locally.
              The change only persists once the user clicks Save. */}
          <button
            onClick={() => setEnabled((prev) => !prev)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${
              enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-zinc-700'
            }`}
            aria-label={enabled ? 'Disable reminders' : 'Enable reminders'}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Settings body */}
        <div className="p-6 space-y-6">

          {/* Live status banner — updates as the user toggles */}
          <div className={`flex items-center gap-3 p-4 rounded-xl ${
            enabled
              ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30'
              : 'bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700'
          }`}>
            {enabled ? (
              <Bell className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400 flex-shrink-0" />
            )}
            <p className={`text-sm font-medium ${
              enabled ? 'text-green-700 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'
            }`}>
              {enabled
                ? `Reminders are on — you'll receive 5 vocab words ${frequency === 'daily' ? 'every day' : 'every Monday'}.`
                : 'Reminders are off. Toggle the switch above to enable them.'}
            </p>
          </div>

          {/* Frequency selector — only meaningful when enabled */}
          {enabled && (
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                <Calendar className="w-4 h-4 opacity-60" />
                How often?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFrequency('daily')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    frequency === 'daily'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                      : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <p className={`font-semibold text-sm ${
                    frequency === 'daily' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'
                  }`}>Daily</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">5 words every morning</p>
                </button>

                <button
                  onClick={() => setFrequency('weekly')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    frequency === 'weekly'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                      : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <p className={`font-semibold text-sm ${
                    frequency === 'weekly' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'
                  }`}>Weekly</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">5 words every Monday</p>
                </button>
              </div>
            </div>
          )}

          {/* Preview of what the email contains */}
          <div className="rounded-xl bg-gray-50 dark:bg-zinc-800 p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              What you'll receive
            </p>
            <ul className="space-y-2">
              {[
                '5 randomly picked words from your language tables only',
                'Every column shown — script, romanisation, English meaning',
                'Which table each word came from',
                'A study tip to help the words stick',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Save button */}
          <button
            onClick={saveReminder}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : saved ? (
              <><CheckCircle className="w-4 h-4" /> Saved!</>
            ) : (
              'Save Preferences'
            )}
          </button>

          {/* Test email button — sends a real email right now so you can
              check the design and content without waiting for the cron job */}
          <button
            onClick={sendTestEmail}
            disabled={sending || !reminder}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 font-semibold py-3 rounded-xl transition-colors disabled:opacity-40"
            title={!reminder ? 'Save preferences first' : 'Send a test email now'}
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-4 h-4" /> Send test email now</>
            )}
          </button>

          {/* Result feedback — shown for 15 seconds after the test fires */}
          {testResult === 'success' && (
            <p className="text-center text-sm text-green-600 dark:text-green-400 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Request completed — check detail below and your inbox.
            </p>
          )}
          {testResult === 'error' && (
            <p className="text-center text-sm text-red-600 dark:text-red-400">
              Something went wrong — see detail below.
            </p>
          )}
          {testDetail && (
            <pre className="text-xs bg-gray-100 dark:bg-zinc-800 rounded-xl p-3 overflow-x-auto text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {testDetail}
            </pre>
          )}
        </div>
      </div>

      {/* Setup notice — reminds the user what still needs to be done in Supabase */}
      <div className="mt-6 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">One-time setup required</p>
        <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
          Emails are sent via{' '}
          <span className="font-medium">Resend</span>. Add your{' '}
          <code className="bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded text-xs">RESEND_API_KEY</code>{' '}
          to Supabase secrets and deploy the{' '}
          <code className="bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded text-xs">send-vocab-email</code>{' '}
          edge function to activate delivery.
        </p>
      </div>
    </div>
  );
}
