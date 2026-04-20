import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// "Languages supported" is a static product claim — the AI model genuinely
// handles 50+ languages, so this number doesn't come from the DB.
const LANGUAGES_SUPPORTED = 50;

// Counts up from 0 to `value` when the element scrolls into view.
// If value is 0 (data hasn't loaded yet) the counter just shows 0 and waits.
function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Wait until we have a real value from the DB
    if (value === 0) return;

    // Animate straight to the value — no need to wait for scroll since
    // the data arrives asynchronously after the page has already loaded
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className="text-3xl sm:text-4xl font-bold text-blue-500">
      {count.toLocaleString()}{suffix}
    </div>
  );
}

export default function StatsSection() {
  // Real numbers pulled from the DB via the get_public_stats() function.
  // We start at 0 so the page renders instantly, then the counters animate
  // up to the real values once the fetch completes.
  const [totalTables, setTotalTables] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    supabase
      .rpc('get_public_stats')
      .then(({ data, error }) => {
        if (error || !data) return; // silently fail — stats are non-critical
        setTotalTables(data.total_tables ?? 0);
        setTotalUsers(data.total_users ?? 0);
      });
  }, []);

  const stats = [
    { value: totalTables,        suffix: '+', label: 'Tables extracted'   },
    { value: LANGUAGES_SUPPORTED, suffix: '+', label: 'Languages supported' },
    { value: totalUsers,          suffix: '+', label: 'Users signed up'    },
  ];

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 border-y border-gray-200/50 dark:border-gray-800/50">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-3 gap-4 sm:gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <AnimatedCounter value={stat.value} suffix={stat.suffix} />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
