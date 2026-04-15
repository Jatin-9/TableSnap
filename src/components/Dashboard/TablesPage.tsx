import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, TableSnapshot } from '../../lib/supabase';
import { Filter, Download, Eye, Trash2, Calendar, Tag, Pencil, Check, X, Plus, Layers, CheckSquare, Square } from 'lucide-react';
import { TableCardSkeleton } from '../ui/Skeleton';

// Splits `text` around every occurrence of `query` and wraps each match in a
// yellow highlight span. Returns an array of plain strings and <mark> elements
// which React renders correctly inside any JSX expression.
// The regex escaping handles special characters like . + * so they're treated
// as literals rather than regex operators.
function highlight(text: string, query: string) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 text-yellow-900 dark:bg-yellow-500/40 dark:text-yellow-200 rounded px-0.5 not-italic">{part}</mark>
      : part
  );
}

export default function TablesPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const searchQuery = (searchParams.get('q') ?? '').toLowerCase().trim();

  const [snapshots, setSnapshots] = useState<TableSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('All');

  // Apply tag filter first, then search query on top.
  // Search matches against the table title and its auto-tags.
  const filteredSnapshots = snapshots
    .filter((s) => selectedFilter === 'All' || s.auto_tags.includes(selectedFilter))
    .filter((s) => {
      if (!searchQuery) return true;
      const title = (s.title ?? s.column_names.join(' ')).toLowerCase();
      const tags = s.auto_tags.join(' ').toLowerCase();
      return title.includes(searchQuery) || tags.includes(searchQuery);
    });

  // ── View modal state ──────────────────────────────────────────────────────
  // When non-null, shows the full table preview modal for that snapshot
  const [selectedSnapshot, setSelectedSnapshot] = useState<TableSnapshot | null>(null);

  // ── Edit modal state ──────────────────────────────────────────────────────
  // editingSnapshot is the snapshot currently being edited
  const [editingSnapshot, setEditingSnapshot] = useState<TableSnapshot | null>(null);
  // These three hold the editable copies of the data while the edit modal is open
  const [editTitle, setEditTitle] = useState('');
  const [editColumns, setEditColumns] = useState<string[]>([]);
  const [editRows, setEditRows] = useState<Record<string, string>[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [newColName, setNewColName] = useState('');

  // ── Merge state ───────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTitle, setMergeTitle] = useState('');
  const [deleteAfterMerge, setDeleteAfterMerge] = useState(true);
  const [mergeSaving, setMergeSaving] = useState(false);

  const filters = [
    'All', 'Languages', 'Expenses', 'Inventory',
    'Shopping', 'Recipes', 'Fitness', 'Dated Records', 'General',
  ];

  // ── Data fetching ─────────────────────────────────────────────────────────

  // Depend on user.id (a stable string) rather than the user object itself.
  // The user object gets recreated on every fetchUserProfile call in AuthContext,
  // so depending on the whole object would re-fetch the table list on every
  // auth token refresh even though nothing about the user actually changed.
  const userId = user?.id;
  useEffect(() => {
    if (userId) fetchSnapshots();
  }, [userId]);

  // Listen for the custom event fired after a new table is saved so the list
  // refreshes automatically without requiring a manual page reload.
  // No dependency on user — fetchSnapshots already guards with `if (!user) return`.
  useEffect(() => {
    const handler = () => fetchSnapshots();
    window.addEventListener('refresh-tables', handler);
    return () => window.removeEventListener('refresh-tables', handler);
  }, []);

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
    }
    setLoading(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteSnapshot = async (id: string) => {
    if (!confirm('Are you sure you want to delete this table?')) return;
    const { error } = await supabase.from('table_snapshots').delete().eq('id', id);
    if (!error) fetchSnapshots();
  };

  // ── CSV export ────────────────────────────────────────────────────────────

  const exportToCSV = (snapshot: TableSnapshot) => {
    const headers = snapshot.column_names.join(',');
    const rows = snapshot.table_data
      .map((row) => snapshot.column_names.map((col) => `"${row[col] || ''}"`).join(','))
      .join('\n');

    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Use the table title in the filename if available, otherwise fall back to the ID
    a.download = `${snapshot.title || 'table'}-${snapshot.id.slice(0, 6)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const getLanguageFlag = (languageCode?: string | null) => {
    switch ((languageCode || '').toLowerCase()) {
      case 'ja': return '🇯🇵';
      case 'hi': return '🇮🇳';
      case 'zh': return '🇨🇳';
      case 'ko': return '🇰🇷';
      case 'es': return '🇪🇸';
      case 'fr': return '🇫🇷';
      case 'de': return '🇩🇪';
      case 'it': return '🇮🇹';
      case 'pt': return '🇵🇹';
      default:   return null;
    }
  };

  // ── Returns the display name for a snapshot ───────────────────────────────
  // If the user has set a custom title we use that; otherwise we fall back to
  // showing the column names joined with a bullet, same as before.
  const getDisplayTitle = (snapshot: TableSnapshot) => {
    if (snapshot.title && snapshot.title.trim()) return snapshot.title.trim();
    return snapshot.column_names.join(' • ');
  };

  // ── Open edit modal ───────────────────────────────────────────────────────

  const openEditModal = (snapshot: TableSnapshot) => {
    setEditingSnapshot(snapshot);
    // Pre-populate all the editable fields with the snapshot's current values
    setEditTitle(snapshot.title ?? '');
    // We work on a copy of the columns array so changes don't affect the list
    // until the user explicitly saves
    setEditColumns([...snapshot.column_names]);
    // Deep-copy the rows too so edits are isolated
    setEditRows(snapshot.table_data.map((row) => ({ ...row })));
  };

  const closeEditModal = () => {
    setEditingSnapshot(null);
    setEditTitle('');
    setEditColumns([]);
    setEditRows([]);
    setNewColName('');
  };

  // ── Column rename ─────────────────────────────────────────────────────────

  // When a column header is renamed we need to also update all the row keys
  // because the rows store their data as { "OldColumnName": "value" }.
  const handleColumnRename = (oldName: string, newName: string, colIndex: number) => {
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedNew === oldName) return;

    // Update the columns list
    const updatedColumns = editColumns.map((col, i) => (i === colIndex ? trimmedNew : col));
    setEditColumns(updatedColumns);

    // Rename the key in every row that uses the old column name
    const updatedRows = editRows.map((row) => {
      const updatedRow: Record<string, string> = {};
      Object.entries(row).forEach(([key, val]) => {
        // Swap the old key out for the new one, keep everything else the same
        updatedRow[key === oldName ? trimmedNew : key] = val;
      });
      return updatedRow;
    });
    setEditRows(updatedRows);
  };

  // ── Cell edit ─────────────────────────────────────────────────────────────

  const handleCellEdit = (rowIndex: number, colName: string, value: string) => {
    setEditRows((prev) =>
      prev.map((row, i) =>
        i === rowIndex ? { ...row, [colName]: value } : row
      )
    );
  };

  // ── Add / delete rows ─────────────────────────────────────────────────────

  const addRow = () => {
    // Build an empty row with every current column as a key
    const emptyRow = Object.fromEntries(editColumns.map((col) => [col, '']));
    setEditRows((prev) => [...prev, emptyRow]);
  };

  const deleteRow = (rowIdx: number) => {
    setEditRows((prev) => prev.filter((_, i) => i !== rowIdx));
  };

  const addColumn = () => {
    const name = newColName.trim();
    if (!name) return;
    // Silently ignore if a column with this name already exists
    if (editColumns.includes(name)) return;

    // Add the column name to the header list
    setEditColumns((prev) => [...prev, name]);
    // Add an empty value for this column in every existing row
    setEditRows((prev) => prev.map((row) => ({ ...row, [name]: '' })));
    setNewColName('');
  };

  // ── Save edits ────────────────────────────────────────────────────────────

  const saveEdits = async () => {
    if (!editingSnapshot || !user) return;
    setEditSaving(true);

    const payload = {
      // Save empty string as null so the DB stays clean when title is cleared
      title: editTitle.trim() || null,
      column_names: editColumns,
      table_data: editRows,
      // Keep row/column counts in sync with the actual data
      column_count: editColumns.length,
      row_count: editRows.length,
    };

    const { error } = await supabase
      .from('table_snapshots')
      .update(payload)
      .eq('id', editingSnapshot.id);

    if (error) {
      console.error('Update error:', error);
      alert('Failed to save changes. Please try again.');
    } else {
      // Refresh the list so the updated title/data appears immediately
      await fetchSnapshots();
      closeEditModal();
    }

    setEditSaving(false);
  };

  // ── Merge helpers ─────────────────────────────────────────────────────────

  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Computes what the merged table would look like so the modal can show a preview
  const getMergePreview = () => {
    const selected = snapshots.filter((s) => selectedIds.has(s.id));
    if (selected.length < 2) return null;

    // Start with the first table's column order as the base.
    // Then add any columns from other tables that aren't already in the base.
    // This preserves the natural column order and handles tables with extra columns.
    const baseCols = selected[0].column_names;
    const extraCols = selected
      .slice(1)
      .flatMap((t) => t.column_names)
      .filter((col) => !baseCols.includes(col));
    const mergedColumns = [...baseCols, ...extraCols];

    const totalRows = selected.reduce((sum, t) => sum + t.row_count, 0);

    // Tell the user if columns don't match so they know some cells will be empty
    const columnsMatch = selected.every(
      (t) =>
        t.column_names.length === baseCols.length &&
        t.column_names.every((c, i) => c === baseCols[i])
    );

    return { mergedColumns, totalRows, columnsMatch, selected };
  };

  const mergeTables = async () => {
    const preview = getMergePreview();
    if (!preview || !user) return;
    setMergeSaving(true);

    const { mergedColumns, selected } = preview;

    // Stack all rows from all selected tables.
    // For a row that's missing a column (from a different table), fill with ''.
    const mergedRows = selected.flatMap((t) =>
      t.table_data.map((row) => {
        const merged: Record<string, string> = {};
        mergedColumns.forEach((col) => { merged[col] = row[col] ?? ''; });
        return merged;
      })
    );

    const allTags = [...new Set(selected.flatMap((t) => t.auto_tags))];
    const first = selected[0];
    const avgConfidence = Math.round(
      selected.reduce((sum, t) => sum + (t.ocr_confidence ?? 0), 0) / selected.length
    );

    const { error: insertErr } = await supabase
      .from('table_snapshots')
      .insert({
        user_id: user.id,
        title: mergeTitle.trim() || null,
        column_names: mergedColumns,
        table_data: mergedRows,
        row_count: mergedRows.length,
        column_count: mergedColumns.length,
        auto_tags: allTags,
        dataset_type: first.dataset_type ?? null,
        language_name: first.language_name ?? null,
        language_code: first.language_code ?? null,
        ocr_confidence: avgConfidence,
      });

    if (insertErr) {
      console.error('Merge insert error:', insertErr);
      alert('Failed to merge. Please try again.');
      setMergeSaving(false);
      return;
    }

    // Delete the originals if the user asked for it
    if (deleteAfterMerge) {
      await supabase
        .from('table_snapshots')
        .delete()
        .in('id', [...selectedIds]);
    }

    await fetchSnapshots();
    setShowMergeModal(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    setMergeTitle('');
    setMergeSaving(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">My Tables</h1>
          <p className="text-gray-600 dark:text-blue-500">
            {selectMode
              ? `${selectedIds.size} table${selectedIds.size !== 1 ? 's' : ''} selected`
              : 'All your extracted tables in one place'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <button
              onClick={toggleSelectMode}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={toggleSelectMode}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                title="Select tables to merge"
              >
                <Layers className="w-4 h-4" />
                Merge
              </button>
              <button
                onClick={() => window.dispatchEvent(new Event('open-upload-modal'))}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                + Upload Table
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tag filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-white">Filter by tag:</span>
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

      {/* Table cards list */}
      {loading ? (
        // Show 4 skeleton cards that match the shape of real table cards.
        // The user sees the layout immediately and understands what's loading.
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <TableCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredSnapshots.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center dark:bg-gray-900">
          <p className="text-gray-500">
            {searchQuery
              ? `No tables match "${searchQuery}"`
              : 'No tables found. Upload your first table image!'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredSnapshots.map((snapshot) => {
            const flag = getLanguageFlag(snapshot.language_code);
            const hasAddedColumns = Array.isArray(snapshot.added_columns) && snapshot.added_columns.length > 0;
            const warningCount = Array.isArray(snapshot.validation_warnings) ? snapshot.validation_warnings.length : 0;

            const isSelected = selectedIds.has(snapshot.id);

            return (
              <div
                key={snapshot.id}
                onClick={selectMode ? () => toggleSelect(snapshot.id) : undefined}
                className={`bg-white rounded-xl shadow-sm border p-6 transition-all dark:bg-gray-900 ${
                  selectMode
                    ? 'cursor-pointer ' + (isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/30 dark:border-blue-400'
                        : 'border-gray-200 hover:border-blue-300 dark:border-gray-700')
                    : 'border-gray-200 hover:shadow-md dark:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    {/* Checkbox — only visible in select mode */}
                    {selectMode && (
                      <div className="mt-0.5 flex-shrink-0 text-blue-600">
                        {isSelected
                          ? <CheckSquare className="w-5 h-5" />
                          : <Square className="w-5 h-5 text-gray-400" />}
                      </div>
                    )}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      {/* Display either the custom title or the column names as fallback */}
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {highlight(getDisplayTitle(snapshot), searchQuery)}
                      </h3>

                      {user?.preferences?.showConfidence !== false && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium dark:text-white dark:bg-blue-600">
                          {snapshot.ocr_confidence}% confidence
                        </span>
                      )}

                      {snapshot.dataset_type === 'language' && snapshot.language_name && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium dark:bg-purple-900/30 dark:text-purple-300">
                          {flag ? `${flag} ` : ''}{snapshot.language_name}
                        </span>
                      )}

                      {hasAddedColumns && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium dark:bg-emerald-900/30 dark:text-emerald-300">
                          + {snapshot.added_columns?.join(', ')}
                        </span>
                      )}

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
                      <div>{snapshot.row_count} rows × {snapshot.column_count} cols</div>
                    </div>
                  </div>
                  </div>

                  {/* Action buttons — hidden in select mode so clicking the card toggles selection */}
                  {!selectMode && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedSnapshot(snapshot)}
                        className="p-2 hover:bg-blue-50 rounded-lg text-blue-600"
                        title="View table"
                      >
                        <Eye className="w-5 h-5" />
                      </button>

                      <button
                        onClick={() => openEditModal(snapshot)}
                        className="p-2 hover:bg-amber-50 rounded-lg text-amber-600"
                        title="Edit table"
                      >
                        <Pencil className="w-5 h-5" />
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
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Tag className="w-4 h-4 text-gray-400" />
                  <div className="flex flex-wrap gap-2">
                    {snapshot.auto_tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium dark:bg-blue-900/30 dark:text-blue-300"
                      >
                        {highlight(tag, searchQuery)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sticky merge action bar — appears when 2+ tables are selected ─── */}
      {selectMode && selectedIds.size >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl dark:bg-white dark:text-gray-900">
          <span className="text-sm font-medium">
            {selectedIds.size} tables selected
          </span>
          <button
            onClick={() => { setMergeTitle(''); setShowMergeModal(true); }}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-xl transition-colors text-sm dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <Layers className="w-4 h-4" />
            Merge {selectedIds.size} Tables
          </button>
        </div>
      )}

      {/* ── Merge confirmation modal ────────────────────────────────────────── */}
      {showMergeModal && (() => {
        const preview = getMergePreview();
        if (!preview) return null;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowMergeModal(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white p-8 dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-500" />
                  Merge Tables
                </h2>
                <button onClick={() => setShowMergeModal(false)} className="p-2 hover:bg-gray-100 rounded-lg dark:hover:bg-gray-800">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Preview summary */}
              <div className="mb-5 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm space-y-2">
                <p className="text-blue-800 dark:text-blue-300">
                  <span className="font-semibold">{preview.selected.length} tables</span> → <span className="font-semibold">{preview.totalRows} total rows</span>
                </p>
                <p className="text-blue-700 dark:text-blue-400">
                  Columns: {preview.mergedColumns.join(' · ')}
                </p>
                {!preview.columnsMatch && (
                  <p className="text-amber-700 dark:text-amber-400 font-medium">
                    ⚠ Some tables have different columns — missing cells will be left blank.
                  </p>
                )}
              </div>

              {/* Title input */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Name the merged table
                </label>
                <input
                  type="text"
                  value={mergeTitle}
                  onChange={(e) => setMergeTitle(e.target.value)}
                  placeholder="e.g. Japanese Vocab — All Chapters"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400"
                />
              </div>

              {/* Delete originals toggle */}
              <label className="flex items-center gap-3 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteAfterMerge}
                  onChange={(e) => setDeleteAfterMerge(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Delete original tables after merging
                </span>
              </label>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={mergeTables}
                  disabled={mergeSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {mergeSaving ? (
                    'Merging...'
                  ) : (
                    <><Layers className="w-4 h-4" /> Merge Tables</>
                  )}
                </button>
                <button
                  onClick={() => setShowMergeModal(false)}
                  disabled={mergeSaving}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── View-only preview modal ─────────────────────────────────────────── */}
      {selectedSnapshot && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setSelectedSnapshot(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-8 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold mb-1 dark:text-white">
                  {getDisplayTitle(selectedSnapshot)}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {selectedSnapshot.dataset_type === 'language' && selectedSnapshot.language_name && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium dark:bg-purple-900/30 dark:text-purple-300">
                      {getLanguageFlag(selectedSnapshot.language_code) ?? ''} {selectedSnapshot.language_name}
                    </span>
                  )}
                  {Array.isArray(selectedSnapshot.added_columns) && selectedSnapshot.added_columns.length > 0 && (
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium dark:bg-emerald-900/30 dark:text-emerald-300">
                      Enriched: {selectedSnapshot.added_columns.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {Array.isArray(selectedSnapshot.validation_warnings) && selectedSnapshot.validation_warnings.length > 0 && (
              <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/40 dark:bg-yellow-900/10">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">Validation warnings</p>
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
                      <th key={col} className="text-left p-3 font-semibold dark:text-white">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedSnapshot.table_data.map((row, idx) => (
                    <tr key={idx}>
                      {selectedSnapshot.column_names.map((col) => (
                        <td key={col} className="p-3 dark:text-gray-200">{row[col]}</td>
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

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      {/* This modal lets users change the table title, column headers, and cell values */}
      {editingSnapshot && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-8 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold dark:text-white">Edit Table</h2>
              <button onClick={closeEditModal} className="p-2 hover:bg-gray-100 rounded-lg dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Title field — lets the user give the table a meaningful name */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Table Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Japanese Vocab Chapter 3, Monthly Expenses..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400"
              />
              <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                Leave blank to auto-display column names as the title
              </p>
            </div>

            {/* Editable table — column headers are inputs, cells are inputs */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Table Data
                <span className="font-normal text-gray-400 ml-2 dark:text-gray-500">
                  — click any header or cell to edit
                </span>
              </p>

              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {editColumns.map((col, colIdx) => (
                        <th key={colIdx} className="p-2 text-left">
                          <input
                            type="text"
                            defaultValue={col}
                            onBlur={(e) => handleColumnRename(col, e.target.value, colIdx)}
                            className="w-full px-2 py-1 font-semibold text-gray-900 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-blue-900/30 dark:border-blue-700 dark:text-white"
                          />
                        </th>
                      ))}
                      {/* Empty header to align with the delete buttons column */}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {editRows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-t border-gray-100 dark:border-gray-800 group">
                        {editColumns.map((col, colIdx) => (
                          <td key={colIdx} className="p-2">
                            <input
                              type="text"
                              value={row[col] ?? ''}
                              onChange={(e) => handleCellEdit(rowIdx, col, e.target.value)}
                              className="w-full px-2 py-1 text-gray-900 bg-white border border-transparent hover:border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none dark:bg-gray-900 dark:text-gray-100 dark:hover:border-gray-600"
                            />
                          </td>
                        ))}
                        {/* Delete row button — visible on row hover */}
                        <td className="p-2 w-8">
                          <button
                            onClick={() => deleteRow(rowIdx)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all dark:hover:bg-red-900/20"
                            title="Delete this row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Row button — sits just below the table */}
              <button
                onClick={addRow}
                className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors dark:text-blue-400 dark:hover:bg-blue-900/20"
              >
                <Plus className="w-4 h-4" />
                Add Row
              </button>

              {/* Add Column — inline input + button */}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="New column name..."
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addColumn()}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400"
                />
                <button
                  onClick={addColumn}
                  disabled={!newColName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:text-green-400 dark:hover:bg-green-900/20"
                >
                  <Plus className="w-4 h-4" />
                  Add Column
                </button>
              </div>
            </div>

            {/* Save / Cancel buttons */}
            <div className="flex gap-3">
              <button
                onClick={saveEdits}
                disabled={editSaving}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editSaving ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
              <button
                onClick={closeEditModal}
                disabled={editSaving}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 rounded-lg transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
