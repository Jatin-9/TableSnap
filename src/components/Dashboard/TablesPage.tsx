import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, TableSnapshot } from '../../lib/supabase';
import { Filter, Download, Eye, Trash2, Calendar, Tag } from 'lucide-react';

// CHANGE: removed UploadPage import (no longer needed)
// import UploadPage from '../Upload/UploadPage';

export default function TablesPage() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<TableSnapshot[]>([]);
  const [filteredSnapshots, setFilteredSnapshots] = useState<TableSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedSnapshot, setSelectedSnapshot] = useState<TableSnapshot | null>(null);

  const filters = [
    'All',
    'Languages',
    'Expenses',
    'Inventory',
    'Shopping',
    'Recipes',
    'Fitness',
    'Dated Records',
    'General',
  ];

  //  Existing: fetch on mount
  useEffect(() => {
    if (user) {
      fetchSnapshots();
    }
  }, [user]);

  //  CHANGE: listen for upload success → refresh tables
  useEffect(() => {
    const handler = () => fetchSnapshots();

    window.addEventListener('refresh-tables', handler);

    return () => {
      window.removeEventListener('refresh-tables', handler);
    };
  }, [user]);

  //  Existing: filter logic
  useEffect(() => {
    if (selectedFilter === 'All') {
      setFilteredSnapshots(snapshots);
    } else {
      setFilteredSnapshots(
        snapshots.filter((s) => s.auto_tags.includes(selectedFilter))
      );
    }
  }, [selectedFilter, snapshots]);

  //  IMPROVED: added error handling
  const fetchSnapshots = async () => {
    if (!user) return;

    setLoading(true);

    const { data, error } = await supabase
      .from('table_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch snapshots error:', error);
    } else if (data) {
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

    //  CHANGE: cleanup memory
    window.URL.revokeObjectURL(url);
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
      
      {/*  CHANGE: Added Upload button here also (optional but useful) */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">
            My Tables
          </h1>
          <p className="text-gray-600 dark:text-blue-500">
            All your extracted tables in one place
          </p>
        </div>

        <button
          onClick={() => window.dispatchEvent(new Event('open-upload-modal'))}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + Upload Table
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-white">
            Filter by tag:
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
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

      {/* Loading / Empty / List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredSnapshots.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center dark:bg-gray-900">
          <p className="text-gray-500">
            No tables found. Upload your first table image!
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredSnapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow dark:bg-gray-900"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Table {snapshot.column_names.join(' • ')}
                    </h3>

                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium dark:text-white dark:bg-blue-600">
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
                    className="p-2 hover:bg-blue-50 rounded-lg text-blue-600"
                    title="View"
                  >
                    <Eye className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => exportToCSV(snapshot)}
                    className="p-2 hover:bg-green-50 rounded-lg text-green-600"
                    title="Export CSV"
                  >
                    <Download className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => deleteSnapshot(snapshot.id)}
                    className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
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

      {/* Preview Modal (unchanged) */}
      {selectedSnapshot && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setSelectedSnapshot(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-8 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold mb-6">Table Preview</h2>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {selectedSnapshot.column_names.map((col) => (
                      <th key={col} className="text-left p-3 font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedSnapshot.table_data.map((row, idx) => (
                    <tr key={idx}>
                      {selectedSnapshot.column_names.map((col) => (
                        <td key={col} className="p-3">
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
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg"
              >
                Export CSV
              </button>

              <button
                onClick={() => setSelectedSnapshot(null)}
                className="flex-1 bg-gray-200 py-3 rounded-lg dark:bg-grey-200 dark:text-gray-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}