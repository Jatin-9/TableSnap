import { useState, useEffect } from 'react';
import { supabase, GlobalAnalytics } from '../../lib/supabase';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { Download, Users, Table2, TrendingUp, Activity } from 'lucide-react';

export default function SuperAdminPage() {
  const [analytics, setAnalytics] = useState<GlobalAnalytics[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalTables, setTotalTables] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGlobalAnalytics();
  }, []);

  const fetchGlobalAnalytics = async () => {
    setLoading(true);

    const { data: analyticsData } = await supabase
      .from('global_analytics')
      .select('*')
      .order('date', { ascending: true });

    const { data: usersData } = await supabase.from('users').select('id');

    const { data: snapshotsData } = await supabase
      .from('table_snapshots')
      .select('row_count');

    if (analyticsData) {
      setAnalytics(analyticsData);
    }

    if (usersData) {
      setTotalUsers(usersData.length);
    }

    if (snapshotsData) {
      setTotalTables(snapshotsData.length);
      setTotalRows(snapshotsData.reduce((sum, s) => sum + (s.row_count || 0), 0));
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

  const userGrowthData = {
    labels: analytics.slice(-14).map((a) =>
      new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    ),
    datasets: [
      {
        label: 'Total Users',
        data: analytics.slice(-14).map((a) => a.total_users),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
      },
      {
        label: 'Active Users',
        data: analytics.slice(-14).map((a) => a.active_users),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
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

    const sortedTags = Object.entries(allTags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

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

  const exportGlobalAnalytics = async () => {
    const { data: allSnapshots } = await supabase
      .from('table_snapshots')
      .select('*, users(email)');

    if (!allSnapshots) return;

    const headers =
      'User Email,Table ID,Rows,Columns,Tags,Confidence,Created Date\n';
    const rows = allSnapshots
      .map(
        (s: any) =>
          `${s.users.email},${s.id},${s.row_count},${s.column_count},"${s.auto_tags.join(', ')}",${s.ocr_confidence},${s.created_at}`
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

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center">
            <Activity className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Super Admin Dashboard</h1>
            <p className="text-gray-600">Platform-wide analytics and insights</p>
          </div>
        </div>
        <button
          onClick={exportGlobalAnalytics}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors"
        >
          <Download className="w-5 h-5" />
          Export All Data
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
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
          <p className="text-4xl font-bold">
            {analytics.length > 0 ? analytics[analytics.length - 1]?.active_users || 0 : 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Platform Growth (Last 30 Days)
          </h2>
          <Line
            data={platformGrowthData}
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
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            User Adoption (Last 14 Days)
          </h2>
          <Bar
            data={userGrowthData}
            options={{
              responsive: true,
              plugins: {
                legend: { position: 'top' },
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
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Top Content Types (Global)
          </h2>
          <div className="max-w-sm mx-auto">
            <Pie
              data={topTagsData}
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
          <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Stats</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-700 font-medium">Avg Tables per User</span>
              <span className="text-2xl font-bold text-blue-600">
                {totalUsers > 0 ? (totalTables / totalUsers).toFixed(1) : 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-700 font-medium">Avg Rows per Table</span>
              <span className="text-2xl font-bold text-green-600">
                {totalTables > 0 ? (totalRows / totalTables).toFixed(1) : 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-700 font-medium">Total Tags Used</span>
              <span className="text-2xl font-bold text-amber-600">
                {topTagsData.labels.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
