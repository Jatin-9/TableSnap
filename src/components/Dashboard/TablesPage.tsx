import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, TableSnapshot } from '../../lib/supabase';
import { Filter, Download, Eye, Trash2, Calendar, Tag } from 'lucide-react';

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

  useEffect(() => {
    if (user) {
      fetchSnapshots();
    }
  }, [user]);

  useEffect(() => {
    const handler = () => fetchSnapshots();

    window.addEventListener('refresh-tables', handler);

    return () => {
      window.removeEventListener('refresh-tables', handler);
    };
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

    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // CHANGE: small helper so we can show flags safely
  const getLanguageFlag = (languageCode?: string | null) => {
    switch ((languageCode || '').toLowerCase()) {
      case 'ja':
        return '🇯🇵';
      case 'hi':
        return '🇮🇳';
      case 'zh':
        return '🇨🇳';
      case 'ko':
        return '🇰🇷';
      case 'es':
        return '🇪🇸';
      case 'fr':
        return '🇫🇷';
      case 'de':
        return '🇩🇪';
      case 'it':
        return '🇮🇹';
      case 'pt':
        return '🇵🇹';
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
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
          {filteredSnapshots.map((snapshot) => {
            const flag = getLanguageFlag(snapshot.language_code);
            const hasAddedColumns =
              Array.isArray(snapshot.added_columns) && snapshot.added_columns.length > 0;
            const warningCount =
              Array.isArray(snapshot.validation_warnings)
                ? snapshot.validation_warnings.length
                : 0;

            return (
              <div
                key={snapshot.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow dark:bg-gray-900"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Table {snapshot.column_names.join(' • ')}
                      </h3>

                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium dark:text-white dark:bg-blue-600">
                        {snapshot.ocr_confidence}% confidence
                      </span>

                      {/* CHANGE: optional language flag + language badge */}
                      {snapshot.dataset_type === 'language' && snapshot.language_name && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium dark:bg-purple-900/30 dark:text-purple-300">
                          {flag ? `${flag} ` : ''}
                          {snapshot.language_name}
                        </span>
                      )}

                      {/* CHANGE: optional enrichment badge */}
                      {hasAddedColumns && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium dark:bg-emerald-900/30 dark:text-emerald-300">
                          + {snapshot.added_columns?.join(', ')}
                        </span>
                      )}

                      {/* CHANGE: optional warnings badge */}
                      {warningCount > 0 && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium dark:bg-yellow-900/30 dark:text-yellow-300">
                          {warningCount} warning{warningCount > 1 ? 's' : ''}
                        </span>
                      )}
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

                <div className="flex items-center gap-3 flex-wrap">
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
            );
          })}
        </div>
      )}

      {selectedSnapshot && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setSelectedSnapshot(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-8 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* CHANGE: preview header now shows optional metadata too */}
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold mb-2 dark:text-white">Table Preview</h2>

                <div className="flex flex-wrap gap-2">
                  {selectedSnapshot.dataset_type === 'language' &&
                    selectedSnapshot.language_name && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium dark:bg-purple-900/30 dark:text-purple-300">
                        {getLanguageFlag(selectedSnapshot.language_code) ?? ''}{' '}
                        {selectedSnapshot.language_name}
                      </span>
                    )}

                  {Array.isArray(selectedSnapshot.added_columns) &&
                    selectedSnapshot.added_columns.length > 0 && (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium dark:bg-emerald-900/30 dark:text-emerald-300">
                        Enriched: {selectedSnapshot.added_columns.join(', ')}
                      </span>
                    )}
                </div>
              </div>
            </div>

            {Array.isArray(selectedSnapshot.validation_warnings) &&
              selectedSnapshot.validation_warnings.length > 0 && (
                <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/40 dark:bg-yellow-900/10">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">
                    Validation warnings
                  </p>
                  <ul className="text-sm text-yellow-700 dark:text-yellow-200 space-y-1">
                    {selectedSnapshot.validation_warnings.map((warning, idx) => (
                      <li key={idx}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {selectedSnapshot.column_names.map((col) => (
                      <th key={col} className="text-left p-3 font-semibold dark:text-white">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedSnapshot.table_data.map((row, idx) => (
                    <tr key={idx}>
                      {selectedSnapshot.column_names.map((col) => (
                        <td key={col} className="p-3 dark:text-gray-200">
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
                className="flex-1 bg-gray-200 py-3 rounded-lg dark:bg-gray-200 dark:text-gray-900"
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