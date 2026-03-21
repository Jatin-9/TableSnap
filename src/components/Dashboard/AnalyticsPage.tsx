import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, UserAnalytics } from '../../lib/supabase';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
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
import { Download, TrendingUp } from 'lucide-react';

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
  const [totalTables, setTotalTables] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
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

    if (analyticsData) {
      setAnalytics(analyticsData);
    }

    if (snapshotsData) {
      setTotalTables(snapshotsData.length);
      setTotalRows(snapshotsData.reduce((sum, s) => sum + s.row_count, 0));
    }

    setLoading(false);
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

  const tablesCreatedData = {
    labels: last30Days.map((d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
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

  const rowsAddedData = {
    labels: analytics.slice(-7).map((a) => new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: 'Rows Added',
        data: analytics.slice(-7).map((a) => a.rows_added),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
      },
    ],
  };

  const exportAnalytics = () => {
    const headers = 'Date,Tables Created,Rows Added,Tags\n';
    const rows = analytics
      .map(
        (a) =>
          `${a.date},${a.tables_created},${a.rows_added},"${JSON.stringify(a.tags_used)}"`
      )
      .join('\n');

    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-analytics.csv';
    a.click();
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Analytics</h1>
          <p className="text-gray-600">Track your personal usage and productivity</p>
        </div>
        <button
          onClick={exportAnalytics}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          <Download className="w-5 h-5" />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-100">Total Tables</span>
            <TrendingUp className="w-5 h-5 text-blue-200" />
          </div>
          <p className="text-4xl font-bold">{totalTables}</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-100">Total Rows</span>
            <TrendingUp className="w-5 h-5 text-green-200" />
          </div>
          <p className="text-4xl font-bold">{totalRows}</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-amber-100">Unique Tags</span>
            <TrendingUp className="w-5 h-5 text-amber-200" />
          </div>
          <p className="text-4xl font-bold">{Object.keys(tagUsageData.labels).length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Tables Created (Last 30 Days)</h2>
          <Line
            data={tablesCreatedData}
            options={{
              responsive: true,
              plugins: {
                legend: { display: false },
              },
              scales: {
                y: { beginAtZero: true },
              },
            }}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Rows Added (Last 7 Days)</h2>
          <Bar
            data={rowsAddedData}
            options={{
              responsive: true,
              plugins: {
                legend: { display: false },
              },
              scales: {
                y: { beginAtZero: true },
              },
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Tables by Tag</h2>
          <div className="max-w-sm mx-auto">
            <Pie
              data={tagUsageData}
              options={{
                responsive: true,
                plugins: {
                  legend: { position: 'bottom' },
                },
              }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Tag Distribution</h2>
          <div className="max-w-sm mx-auto">
            <Doughnut
              data={tagUsageData}
              options={{
                responsive: true,
                plugins: {
                  legend: { position: 'bottom' },
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
