import { useState } from 'react';
import { Check, Sparkles, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUsage } from '../../hooks/useUsage';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

const FREE_FEATURES = [
  '10 uploads / month',
  '25 tables stored',
  '30 AI chat queries / month',
  'PDF support',
  'Language enrichment',
  'Flashcard & study mode',
  'All export formats (CSV, TXT, Anki)',
  'Analytics dashboard',
  'Study reminders',
  'Public shareable links',
];

const PRO_FEATURES = [
  '200 uploads / month',
  '500 tables stored',
  '300 AI chat queries / month',
  'PDF support',
  'Priority AI processing',
  'Priority support',
];

export default function PricingSection() {
  const { user, loading } = useAuth();
  const { isPro } = useUsage();
  const navigate = useNavigate();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Logged-in users go straight to checkout; guests go to the login page first
  const handleProClick = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

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

  return (
    <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <span className="inline-block mb-4 px-3 py-1 text-sm rounded-full border border-blue-600/30 text-blue-500">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Simple, <span className="gradient-text">Transparent</span> Pricing
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            All features free forever — Pro just removes the limits
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto items-start">

          {/* Free plan */}
          <div className="relative glass-card rounded-2xl p-8">
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold mb-2">Free</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">Try everything — no card needed</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-gray-500 dark:text-gray-400">forever</span>
              </div>
            </div>
            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/login"
              className="block w-full py-3 px-4 rounded-xl text-center font-medium transition-colors bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-900 dark:text-white"
            >
              Get started free
            </Link>
          </div>

          {/* Pro plan */}
          <div className="relative glass-card rounded-2xl p-8 border-blue-600/50 shadow-lg shadow-blue-600/10">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-600 text-white">
              <Sparkles className="w-3 h-3 mr-1" />
              Most Popular
            </span>

            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold mb-2">Pro</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">For power users who go all-in</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold">$8</span>
                <span className="text-gray-500 dark:text-gray-400">/month</span>
              </div>
            </div>

            <ul className="space-y-3 mb-8">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {!loading && (
              isPro ? (
                <div className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium bg-green-600/10 text-green-600 dark:text-green-400 border border-green-600/30 cursor-default">
                  <Sparkles className="w-4 h-4" /> You're on Pro ✓
                </div>
              ) : (
                <button
                  onClick={handleProClick}
                  disabled={checkoutLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                >
                  {checkoutLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing checkout...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Upgrade to Pro</>
                  )}
                </button>
              )
            )}
          </div>

        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          No credit card required · Cancel anytime
        </p>
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 mt-2">
          More features and higher limits coming soon.
        </p>
      </div>
    </section>
  );
}
