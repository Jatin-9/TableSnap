import { Check, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Try everything — no card needed',
    features: [
      '10 uploads / month',
      '25 tables stored',
      '20 AI chat queries / month',
      'PDF support (up to 5 pages)',
      'Language enrichment',
      'Flashcard & study mode',
      'All export formats (CSV, TXT, Anki)',
      'Analytics dashboard',
      'Study reminders',
      'Public shareable links',
    ],
    cta: 'Get started free',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/month',
    description: 'For power users who go all-in',
    features: [
      'Unlimited uploads',
      'Unlimited table storage',
      'Unlimited AI chat',
      'PDF support (up to 10 pages)',
      'Priority AI processing',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    popular: true,
  },
];

export default function PricingSection() {
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
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative glass-card rounded-2xl p-8 ${
                plan.popular ? 'border-blue-600/50 shadow-lg shadow-blue-600/10' : ''
              }`}
            >
              {/* Most Popular badge */}
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-600 text-white">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Most Popular
                </span>
              )}

              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{plan.description}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-500 dark:text-gray-400">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/login"
                className={`block w-full py-3 px-4 rounded-xl text-center font-medium transition-colors ${
                  plan.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-900 dark:text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Reassurance line */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          No credit card required · Cancel anytime
        </p>
      </div>
    </section>
  );
}
