import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, TableSnapshot } from '../../lib/supabase';
import { Table2 } from 'lucide-react';

// This page is fully public — no login required.
// It fetches a single table by the ID in the URL and renders it read-only.
// The URL looks like: yoursite.com/share/a3f9c2d1-...

export default function SharedTablePage() {
  const { id } = useParams<{ id: string }>();

  // Three possible states: loading, loaded (snapshot exists), or not found
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchSnapshot(id);
  }, [id]);

  const fetchSnapshot = async (tableId: string) => {
    const { data, error } = await supabase
      .from('table_snapshots')
      .select('*')
      .eq('id', tableId)
      // maybeSingle returns null instead of an error when no row is found
      .maybeSingle();

    if (error || !data) {
      setNotFound(true);
    } else {
      setSnapshot(data);
    }

    setLoading(false);
  };

  // Get a human-readable title — same logic as TablesPage
  const getTitle = (s: TableSnapshot) =>
    s.title ?? s.column_names.join(' · ');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-gray-500 dark:text-gray-400 text-lg">Loading table...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 gap-4">
        <p className="text-2xl font-bold text-gray-800 dark:text-white">Table not found</p>
        <p className="text-gray-500 dark:text-gray-400">
          This link may be invalid or the table may have been deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Top bar — branding so viewers know where this came from */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Table2 className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold text-gray-900 dark:text-white">TableSnap</span>
        <span className="ml-2 text-gray-400 dark:text-gray-500 text-sm">Shared Table</span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Table title and metadata */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {getTitle(snapshot!)}
          </h1>

          <div className="flex flex-wrap gap-2 text-sm text-gray-500 dark:text-gray-400">
            {/* Row and column counts */}
            <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full">
              {snapshot!.row_count} rows
            </span>
            <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full">
              {snapshot!.column_count} columns
            </span>

            {/* Language badge if it's a language table */}
            {snapshot!.language_name && (
              <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-medium">
                {snapshot!.language_name}
              </span>
            )}

            {/* Auto tags */}
            {snapshot!.auto_tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* The table itself */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {snapshot!.column_names.map((col) => (
                  <th
                    key={col}
                    className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot!.table_data.map((row, idx) => (
                <tr
                  key={idx}
                  className={
                    idx % 2 === 0
                      ? 'bg-white dark:bg-gray-900'
                      : 'bg-gray-50 dark:bg-gray-800/50'
                  }
                >
                  {snapshot!.column_names.map((col) => (
                    <td key={col} className="px-4 py-3 text-gray-800 dark:text-gray-200">
                      {row[col] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-400 dark:text-gray-500">
          Shared via{' '}
          <a href="/" className="text-blue-500 hover:underline font-medium">
            TableSnap
          </a>
        </p>
      </main>
    </div>
  );
}
