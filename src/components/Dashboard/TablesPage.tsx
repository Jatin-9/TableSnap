import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, TableSnapshot } from '../../lib/supabase';
import { Filter, Download, Eye, Trash2, Calendar, Tag } from 'lucide-react';
import UploadPage from '../Upload/UploadPage';

export default function TablesPage() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<TableSnapshot[]>([]);
  const [filteredSnapshots, setFilteredSnapshots] = useState<TableSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedSnapshot, setSelectedSnapshot] = useState<TableSnapshot | null>(null);

  const filters = ['All', 'Languages', 'Expenses', 'Inventory', 'Shopping', 'Recipes', 'Fitness', 'Dated Records', 'General'];

  useEffect(() => {
    if (user) {
      fetchSnapshots();
    }
  }, [user]);

  useEffect(() => {
    if (selectedFilter === 'All') {
      setFilteredSnapshots(snapshots);
    } else {
      setFilteredSnapshots(
        snapshots.filter((s) => s.auto_tags.includes(selectedFilter))
      );
    }
  }, [selectedFilter, snapshots]);

  const fetchSnapshots = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('table_snapshots')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (data) {
      setSnapshots(data);
      setFilteredSnapshots(data);
    }
    setLoading(false);
  };

  const deleteSnapshot = async (id: string) => {
    if (!confirm('Are you sure you want to delete this table?')) return;

    const { error } = await supabase
      .from('table_snapshots')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchSnapshots();
    }
  };

  const exportToCSV = (snapshot: TableSnapshot) => {
    const headers = snapshot.column_names.join(',');
    const rows = snapshot.table_data
      .map((row) =>
        snapshot.column_names.map((col) => `"${row[col] || ''}"`).join(',')
      )
      .join('\n');

    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table-${snapshot.id}.csv`;
    a.click();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Tables</h1>
        <p className="text-gray-600">All your extracted tables in one place</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Filter by tag:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter}
              {filter !== 'All' && (
                <span className="ml-2 text-xs opacity-75">
                  ({snapshots.filter((s) => s.auto_tags.includes(filter)).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredSnapshots.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No tables found. Upload your first table image!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredSnapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Table {snapshot.column_names.join(' • ')}
                    </h3>
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                      {snapshot.ocr_confidence}% confidence
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(snapshot.created_at)}
                    </div>
                    <div>
                      {snapshot.row_count} rows × {snapshot.column_count} cols
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedSnapshot(snapshot)}
                    className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-600"
                    title="View"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => exportToCSV(snapshot)}
                    className="p-2 hover:bg-green-50 rounded-lg transition-colors text-green-600"
                    title="Export CSV"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => deleteSnapshot(snapshot.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400" />
                <div className="flex flex-wrap gap-2">
                  {snapshot.auto_tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSnapshot && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedSnapshot(null)}
        >
          <div
            className="bg-white rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Table Preview</h2>
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    {selectedSnapshot.column_names.map((col) => (
                      <th
                        key={col}
                        className="text-left p-3 font-semibold text-gray-900"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedSnapshot.table_data.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      {selectedSnapshot.column_names.map((col) => (
                        <td key={col} className="p-3 text-gray-700">
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => exportToCSV(selectedSnapshot)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Export CSV
              </button>
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <UploadPage />
    </div>
  );
}
