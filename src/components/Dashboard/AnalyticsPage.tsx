import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, UserAnalytics, TableSnapshot } from '../../lib/supabase';
import { Line, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Camera, TrendingUp, Table2, AlignJustify, Globe, Star } from 'lucide-react';
import html2canvas from 'html2canvas';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<UserAnalytics[]>([]);
  const [snapshots, setSnapshots] = useState<TableSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingImage, setSavingImage] = useState(false);

  // This ref points to the main container div so html2canvas knows what to capture
  const analyticsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) fetchAnalytics();
  }, [user]);

  const fetchAnalytics = async () => {
    setLoading(true);

    const { data: analyticsData } = await supabase
      .from('user_analytics')
      .select('*')
      .eq('user_id', user!.id)
      .order('date', { ascending: true });

    const { data: snapshotsData } = await supabase
      .from('table_snapshots')
      .select('*')
      .eq('user_id', user!.id);

    if (analyticsData) setAnalytics(analyticsData);

    // Store the full snapshots list so we can compute derived stats from it
    if (snapshotsData) setSnapshots(snapshotsData);

    setLoading(false);
  };

  // ── Derived stats computed from snapshots ──────────────────────────────────
  // We compute these from the raw snapshots rather than the analytics table
  // because the analytics table only tracks daily activity, not per-table metadata

  const totalTables = snapshots.length;
  const totalRows = snapshots.reduce((sum, s) => sum + s.row_count, 0);

  // Count how many distinct languages the user has uploaded vocab for.
  // We filter out null/empty and use a Set to deduplicate.
  const languagesStudied = new Set(
    snapshots.filter((s) => s.language_name).map((s) => s.language_name)
  ).size;

  // Average OCR confidence across all tables — gives the user a sense of
  // how clear their photos have been
  const avgConfidence =
    snapshots.length > 0
      ? Math.round(
          snapshots.reduce((sum, s) => sum + s.ocr_confidence, 0) / snapshots.length
        )
      : 0;

  // ── Date helpers ──────────────────────────────────────────────────────────

  const getLast30Days = () => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  };

  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  };

  const last30Days = getLast30Days();
  const last7Days = getLast7Days();

  // ── Chart 1: Tables created over the last 30 days (Line) ──────────────────

  const tablesCreatedData = {
    labels: last30Days.map((d) =>
      new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    ),
    datasets: [
      {
        label: 'Tables Created',
        data: last30Days.map((date) => {
          const dayData = analytics.find((a) => a.date === date);
          return dayData ? dayData.tables_created : 0;
        }),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  // ── Chart 2: Rows added per day over the last 7 days (Bar) ───────────────

  const rowsAddedData = {
    labels: last7Days.map((d) =>
      new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    ),
    datasets: [
      {
        label: 'Rows Added',
        data: last7Days.map((date) => {
          const record = analytics.find((a) => a.date === date);
          return record ? record.rows_added : 0;
        }),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderRadius: 6,
      },
    ],
  };

  // ── Chart 3: Tables by tag (Pie) ──────────────────────────────────────────
  // Aggregates tag usage across all analytics records

  const tagUsageData = (() => {
    const tagCounts: Record<string, number> = {};
    analytics.forEach((a) => {
      Object.entries(a.tags_used as Record<string, number>).forEach(([tag, count]) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + count;
      });
    });

    return {
      labels: Object.keys(tagCounts),
      datasets: [
        {
          label: 'Tables by Tag',
          data: Object.values(tagCounts),
          backgroundColor: [
            'rgba(59, 130, 246, 0.85)',
            'rgba(16, 185, 129, 0.85)',
            'rgba(245, 158, 11, 0.85)',
            'rgba(239, 68, 68, 0.85)',
            'rgba(139, 92, 246, 0.85)',
            'rgba(236, 72, 153, 0.85)',
            'rgba(20, 184, 166, 0.85)',
            'rgba(251, 146, 60, 0.85)',
          ],
          borderWidth: 2,
          borderColor: '#fff',
        },
      ],
    };
  })();

  // ── Chart 4: Language breakdown (horizontal Bar) ──────────────────────────
  // Shows how many tables the user has per language. Replaces the old duplicate
  // Doughnut chart which was showing identical data to the Pie chart above.
  // This is much more useful — it directly shows what languages you're studying.

  const languageBreakdownData = (() => {
    const langCounts: Record<string, number> = {};

    snapshots.forEach((s) => {
      // Use the language name if it's a language table, otherwise bucket it as "General"
      const label = s.language_name || 'General';
      langCounts[label] = (langCounts[label] || 0) + 1;
    });

    // Sort by count descending so the most-used language appears at the top
    const sorted = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);

    const colours = [
      'rgba(139, 92, 246, 0.85)',
      'rgba(59, 130, 246, 0.85)',
      'rgba(16, 185, 129, 0.85)',
      'rgba(245, 158, 11, 0.85)',
      'rgba(239, 68, 68, 0.85)',
      'rgba(236, 72, 153, 0.85)',
      'rgba(20, 184, 166, 0.85)',
    ];

    return {
      labels: sorted.map(([lang]) => lang),
      datasets: [
        {
          label: 'Tables',
          data: sorted.map(([, count]) => count),
          backgroundColor: sorted.map((_, i) => colours[i % colours.length]),
          borderRadius: 6,
        },
      ],
    };
  })();

  // ── Image export ──────────────────────────────────────────────────────────
  // html2canvas "photographs" the DOM element we point it at and returns a
  // canvas. We then convert that canvas to a PNG data-URL and trigger a download.

  const saveAsImage = async () => {
    if (!analyticsRef.current) return;
    setSavingImage(true);

    try {
      // Check if the user is in dark mode so we can set the right background colour
      const isDark = document.documentElement.classList.contains('dark');

      const canvas = await html2canvas(analyticsRef.current, {
        // scale: 2 doubles the pixel density → sharper image when viewed at normal size
        scale: 2,
        backgroundColor: isDark ? '#030712' : '#f9fafb',
        // useCORS lets html2canvas load any cross-origin assets (fonts, images)
        useCORS: true,
        logging: false,
      });

      // toDataURL converts the canvas into a base64 PNG string
      const url = canvas.toDataURL('image/png');

      // Create a hidden <a> tag, point it at the PNG, click it to trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `tablesnap-analytics-${new Date().toISOString().split('T')[0]}.png`;
      link.click();
    } catch (err) {
      console.error('Failed to capture analytics image:', err);
      alert('Could not save image. Please try again.');
    } finally {
      setSavingImage(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    // analyticsRef is attached here so the image capture knows what to photograph
    <div ref={analyticsRef} className="p-6 bg-gray-50 dark:bg-gray-950 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">My Analytics</h1>
          <p className="text-gray-600 dark:text-blue-500">Track your personal usage and progress</p>
        </div>

        <button
          onClick={saveAsImage}
          disabled={savingImage}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <Camera className="w-5 h-5" />
          {savingImage ? 'Saving...' : 'Save as Image'}
        </button>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      {/* Four cards now instead of three — added Avg Confidence and Languages */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-100 text-sm">Total Tables</span>
            <Table2 className="w-4 h-4 text-blue-200" />
          </div>
          <p className="text-4xl font-bold">{totalTables}</p>
          <p className="text-blue-200 text-xs mt-1">all time</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-100 text-sm">Total Rows</span>
            <AlignJustify className="w-4 h-4 text-green-200" />
          </div>
          <p className="text-4xl font-bold">{totalRows}</p>
          <p className="text-green-200 text-xs mt-1">words & entries</p>
        </div>

        {/* Languages Studied — more meaningful than "Unique Tags" for this app */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-100 text-sm">Languages Studied</span>
            <Globe className="w-4 h-4 text-purple-200" />
          </div>
          <p className="text-4xl font-bold">{languagesStudied}</p>
          <p className="text-purple-200 text-xs mt-1">unique languages</p>
        </div>

        {/* Avg OCR Confidence — tells the user how clear their photos have been */}
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-amber-100 text-sm">Avg Confidence</span>
            <Star className="w-4 h-4 text-amber-200" />
          </div>
          <p className="text-4xl font-bold">{avgConfidence}%</p>
          <p className="text-amber-200 text-xs mt-1">OCR accuracy</p>
        </div>
      </div>

      {/* ── Top row charts ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 mb-4 dark:text-white">
            Tables Created — Last 30 Days
          </h2>
          <Line
            data={tablesCreatedData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            }}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 mb-4 dark:text-white">
            Rows Added — Last 7 Days
          </h2>
          <Bar
            data={rowsAddedData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            }}
          />
        </div>
      </div>

      {/* ── Bottom row charts ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Tables by Tag — kept as Pie, still useful */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 mb-4 dark:text-white">
            Tables by Tag
          </h2>
          {tagUsageData.labels.length > 0 ? (
            <div className="max-w-xs mx-auto">
              <Pie
                data={tagUsageData}
                options={{
                  responsive: true,
                  plugins: { legend: { position: 'bottom' } },
                }}
              />
            </div>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-12">
              No tag data yet — upload some tables to see this chart.
            </p>
          )}
        </div>

        {/* Language Breakdown — replaces the old duplicate Doughnut chart.
            Shows exactly which languages the user has tables for and how many,
            which is much more informative than a second copy of the tag pie. */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 mb-1 dark:text-white">
            Language Breakdown
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            How many tables you have per language
          </p>
          {languageBreakdownData.labels.length > 0 ? (
            <Bar
              data={languageBreakdownData}
              options={{
                indexAxis: 'y',  // makes the bar chart horizontal — easier to read language names
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                  x: { beginAtZero: true, ticks: { stepSize: 1 } },
                },
              }}
            />
          ) : (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-12">
              No language tables yet — upload some vocab images to see this chart.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
