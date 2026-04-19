import { useState, useEffect, useRef } from 'react';
import { supabase, GlobalAnalytics } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
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
import { Download, Users, Table2, TrendingUp, Activity, Camera } from 'lucide-react';
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

export default function SuperAdminPage() {
  const { theme } = useTheme();

  const [analytics, setAnalytics] = useState<GlobalAnalytics[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalTables, setTotalTables] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [activeToday, setActiveToday] = useState(0);
  // Raw signup dates — used to compute daily signup counts without relying on
  // global_analytics which has gaps on days with no activity
  const [signupDates, setSignupDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingImage, setSavingImage] = useState(false);

  // Points to the page container so html2canvas knows what region to photograph
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGlobalAnalytics();
  }, []);

  const fetchGlobalAnalytics = async () => {
    setLoading(true);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Run all queries in parallel to keep the load fast
    const [analyticsResult, usersResult, snapshotsResult, activeTodayResult] =
      await Promise.all([
        supabase.from('global_analytics').select('*').order('date', { ascending: true }),
        // Fetch created_at so we can compute daily signup counts accurately in JS
        supabase.from('users').select('id, created_at'),
        supabase.from('table_snapshots').select('row_count'),
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .gte('last_active_at', todayStart.toISOString()),
      ]);

    if (analyticsResult.data) setAnalytics(analyticsResult.data);
    if (usersResult.data) {
      setTotalUsers(usersResult.data.length);
      setSignupDates(usersResult.data.map((u) => u.created_at.split('T')[0]));
    }
    if (snapshotsResult.data) {
      setTotalTables(snapshotsResult.data.length);
      setTotalRows(snapshotsResult.data.reduce((sum, s) => sum + (s.row_count || 0), 0));
    }
    setActiveToday(activeTodayResult.count ?? 0);

    setLoading(false);
  };

  // Capture the page as a PNG download — same approach as AnalyticsPage
  const saveAsImage = async () => {
    if (!pageRef.current) return;
    setSavingImage(true);
    try {
      const isDark = document.documentElement.classList.contains('dark');
      const canvas = await html2canvas(pageRef.current, {
        scale: 2,
        backgroundColor: isDark ? '#09090b' : '#f9fafb',
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `tablesnap-admin-${new Date().toISOString().split('T')[0]}.png`;
      link.click();
    } catch (err) {
      console.error('Failed to capture admin image:', err);
      alert('Could not save image. Please try again.');
    } finally {
      setSavingImage(false);
    }
  };

  const exportGlobalAnalytics = async () => {
    const { data: allSnapshots } = await supabase
      .from('table_snapshots')
      .select('*, users(email)');

    if (!allSnapshots) return;

    const headers = 'User Email,Table ID,Rows,Columns,Tags,Confidence,Created Date\n';
    const rows = allSnapshots
      .map(
        (s: any) =>
          `${s.users?.email ?? ''},${s.id},${s.row_count},${s.column_count},"${s.auto_tags.join(', ')}",${s.ocr_confidence},${s.created_at}`
      )
      .join('\n');

    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'global-analytics.csv';
    a.click();
  };

  const getLast30Days = () => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  };

  const last30Days = getLast30Days();

  // Chart.js axis / legend text colours that flip with the theme
  const isDark = theme === 'dark';
  const chartText = isDark ? '#9ca3af' : '#6b7280';
  const chartGrid = isDark ? '#27272a' : '#e5e7eb';

  const sharedScales = {
    x: { ticks: { color: chartText }, grid: { color: chartGrid } },
    y: { beginAtZero: true as const, ticks: { color: chartText }, grid: { color: chartGrid } },
  };

  const sharedLegend = { labels: { color: chartText } };

  const platformGrowthData = {
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

  // Build a full 14-day date range so there are no gaps in the chart,
  // even on days with no signups or logins
  const getLast14Days = () => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  };
  const last14Days = getLast14Days();

  // Count how many users signed up on each of the last 14 calendar days
  const signupsByDay: Record<string, number> = {};
  signupDates.forEach((date) => {
    signupsByDay[date] = (signupsByDay[date] || 0) + 1;
  });

  // Build a lookup from global_analytics for active_users per date
  const activeByDay: Record<string, number> = {};
  analytics.forEach((a) => {
    activeByDay[a.date] = a.active_users;
  });

  const userGrowthData = {
    labels: last14Days.map((d) =>
      new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    ),
    datasets: [
      {
        label: 'New Signups',
        data: last14Days.map((d) => signupsByDay[d] ?? 0),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderRadius: 4,
      },
      {
        label: 'Active Users',
        data: last14Days.map((d) => activeByDay[d] ?? 0),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderRadius: 4,
      },
    ],
  };

  const topTagsData = (() => {
    const allTags: Record<string, number> = {};
    analytics.forEach((a) => {
      Object.entries(a.top_tags as Record<string, number>).forEach(([tag, count]) => {
        allTags[tag] = (allTags[tag] || 0) + count;
      });
    });
    const sortedTags = Object.entries(allTags).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      labels: sortedTags.map(([tag]) => tag),
      datasets: [
        {
          label: 'Tag Usage',
          data: sortedTags.map(([, count]) => count),
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',
            'rgba(16, 185, 129, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(239, 68, 68, 0.8)',
            'rgba(139, 92, 246, 0.8)',
            'rgba(236, 72, 153, 0.8)',
          ],
        },
      ],
    };
  })();

  if (loading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-zinc-950 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div ref={pageRef} className="p-6 bg-gray-50 dark:bg-zinc-950 min-h-screen">

      {/* Title — sits in the top-left, stays clear of the fixed theme/signout icons */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Activity className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Super Admin Dashboard
            </h1>
            <p className="text-gray-500 dark:text-gray-400">Platform-wide analytics and insights</p>
          </div>
        </div>
      </div>

      {/* Action buttons — on their own row so they never collide with the fixed icons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={saveAsImage}
          disabled={savingImage}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <Camera className="w-4 h-4" />
          {savingImage ? 'Saving...' : 'Save as Image'}
        </button>

        <button
          onClick={exportGlobalAnalytics}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Export All Data
        </button>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-100">Total Users</span>
            <Users className="w-6 h-6 text-blue-200" />
          </div>
          <p className="text-4xl font-bold">{totalUsers}</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-100">Total Tables</span>
            <Table2 className="w-6 h-6 text-green-200" />
          </div>
          <p className="text-4xl font-bold">{totalTables}</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-amber-100">Total Rows</span>
            <TrendingUp className="w-6 h-6 text-amber-200" />
          </div>
          <p className="text-4xl font-bold">{totalRows.toLocaleString()}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-100">Active Today</span>
            <Activity className="w-6 h-6 text-purple-200" />
          </div>
          <p className="text-4xl font-bold">{activeToday}</p>
        </div>
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="dashboard-card p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Platform Growth (Last 30 Days)
          </h2>
          <Line
            data={platformGrowthData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: sharedScales,
            }}
          />
        </div>

        <div className="dashboard-card p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Signups vs Active Users (Last 14 Days)
          </h2>
          <Bar
            data={userGrowthData}
            options={{
              responsive: true,
              plugins: { legend: { position: 'top', labels: sharedLegend.labels } },
              scales: sharedScales,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="dashboard-card p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Top Content Types (Global)
          </h2>
          {topTagsData.labels.length > 0 ? (
            <div className="max-w-sm mx-auto">
              <Pie
                data={topTagsData}
                options={{
                  responsive: true,
                  plugins: { legend: { position: 'bottom', labels: sharedLegend.labels } },
                }}
              />
            </div>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-12">
              No tag data yet.
            </p>
          )}
        </div>

        <div className="dashboard-card p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Quick Stats</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                Avg Tables per User
              </span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {totalUsers > 0 ? (totalTables / totalUsers).toFixed(1) : 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                Avg Rows per Table
              </span>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                {totalTables > 0 ? (totalRows / totalTables).toFixed(1) : 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <span className="text-gray-700 dark:text-gray-300 font-medium">Total Tags Used</span>
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {topTagsData.labels.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
