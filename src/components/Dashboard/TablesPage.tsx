import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, TableSnapshot } from '../../lib/supabase';
import { toast } from 'sonner';
import {
  Download, Eye, Trash2, Pencil, Check, X, Plus, Layers,
  CheckSquare, Square, Clipboard, BookOpen, Share2, Search, FileText,
} from 'lucide-react';
import { TableCardSkeleton } from '../ui/Skeleton';
import UpgradeModal from '../ui/UpgradeModal';
import { useUsage, LIMITS } from '../../hooks/useUsage';
import { AiColumnHeader } from '../ui/AiColumnHeader';

// Wraps each match of `query` in a yellow highlight span.
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchQuery = (searchParams.get('q') ?? '').toLowerCase().trim();
  // Local state keeps the input in sync with the URL param
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');

  const [snapshots, setSnapshots] = useState<TableSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('All');

  const filteredSnapshots = snapshots
    .filter((s) => selectedFilter === 'All' || s.auto_tags.includes(selectedFilter))
    .filter((s) => {
      if (!searchQuery) return true;
      const title = (s.title ?? s.column_names.join(' ')).toLowerCase();
      const tags = s.auto_tags.join(' ').toLowerCase();
      return title.includes(searchQuery) || tags.includes(searchQuery);
    });

  // ── View modal state ──────────────────────────────────────────────────────
  const [selectedSnapshot, setSelectedSnapshot] = useState<TableSnapshot | null>(null);

  // ── Edit modal state ──────────────────────────────────────────────────────
  const [editingSnapshot, setEditingSnapshot] = useState<TableSnapshot | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
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

  const filters = ['All', 'Languages', 'Expenses', 'General'];

  // ── Usage / limits ────────────────────────────────────────────────────────
  const { canUpload, canStore, uploadsThisMonth, uploadsRemaining, totalTables, tablesRemaining } = useUsage();
  const [upgradeModal, setUpgradeModal] = useState<'uploads' | 'storage' | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const userId = user?.id;
  useEffect(() => {
    if (userId) fetchSnapshots();
  }, [userId]);

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

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = (value: string) => {
    setSearchInput(value);
    navigate(value ? `/dashboard?q=${encodeURIComponent(value)}` : '/dashboard', { replace: true });
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteSnapshot = async (id: string) => {
    if (!confirm('Are you sure you want to delete this table?')) return;
    const { error } = await supabase.from('table_snapshots').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete table. Please try again.');
    } else {
      toast.success('Table deleted.');
      fetchSnapshots();
    }
  };

  // ── Export helpers ────────────────────────────────────────────────────────

  const csvCell = (value: string) => `"${(value ?? '').replace(/"/g, '""')}"`;

  const exportToCSV = (snapshot: TableSnapshot) => {
    const header = snapshot.column_names.map(csvCell).join(',');
    const rows = snapshot.table_data
      .map((row) => snapshot.column_names.map((col) => csvCell(row[col] ?? '')).join(','))
      .join('\n');
    const blob = new Blob([`${header}\n${rows}`], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snapshot.title || 'table'}-${snapshot.id.slice(0, 6)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Downloads the table as a tab-separated plain-text file
  const exportToTXT = (snapshot: TableSnapshot) => {
    const header = snapshot.column_names.join('\t');
    const rows = snapshot.table_data
      .map((row) => snapshot.column_names.map((col) => (row[col] ?? '').replace(/\t/g, ' ')).join('\t'))
      .join('\n');
    const blob = new Blob([`${header}\n${rows}`], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snapshot.title || 'table'}-${snapshot.id.slice(0, 6)}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const copyShareLink = (snapshot: TableSnapshot) => {
    const url = `${window.location.origin}/share/${snapshot.id}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const copyToClipboard = async (snapshot: TableSnapshot) => {
    const header = snapshot.column_names.join('\t');
    const rows = snapshot.table_data
      .map((row) =>
        snapshot.column_names
          .map((col) => (row[col] ?? '').replace(/\t/g, ' '))
          .join('\t'),
      )
      .join('\n');
    await navigator.clipboard.writeText(`${header}\n${rows}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Anki .txt file export (one card per line, front TAB back)
  const exportToAnki = (snapshot: TableSnapshot) => {
    const [col1, col2] = snapshot.column_names;
    const lines = snapshot.table_data
      .map((row) => `${row[col1] ?? ''}\t${row[col2] ?? ''}`)
      .join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snapshot.title || 'anki'}-${snapshot.id.slice(0, 6)}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // ── AnkiConnect ───────────────────────────────────────────────────────────
  const [ankiStatus, setAnkiStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [ankiError, setAnkiError] = useState('');

  const sendToAnki = async (snapshot: TableSnapshot) => {
    const [col1, col2] = snapshot.column_names;
    const deckName = snapshot.title || 'TableSnap';
    const notes = snapshot.table_data.map((row) => ({
      deckName,
      modelName: 'Basic',
      fields: { Front: row[col1] ?? '', Back: row[col2] ?? '' },
      options: { allowDuplicate: false },
      tags: ['tablesnap'],
    }));

    setAnkiStatus('sending');
    setAnkiError('');

    const ankiRequest = async (action: string, params: object) => {
      const res = await fetch('http://localhost:8765', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, version: 6, params }),
      });
      return res.json();
    };

    try {
      const deckResult = await ankiRequest('createDeck', { deck: deckName });
      if (deckResult.error) throw new Error(deckResult.error);
      const data = await ankiRequest('addNotes', { notes });
      if (data.error) throw new Error(data.error);
      setAnkiStatus('success');
      setTimeout(() => setAnkiStatus('idle'), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // "Failed to fetch" means the browser couldn't reach localhost:8765 at all —
      // either Anki isn't running, AnkiConnect isn't installed, or (most likely when
      // using the hosted app) the domain hasn't been added to AnkiConnect's CORS list.
      setAnkiError(
        message.includes('Failed to fetch')
          ? 'CORS_OR_OFFLINE'
          : message,
      );
      setAnkiStatus('error');
    }
  };

  // ── Date formatting ───────────────────────────────────────────────────────

  // Short date for card list: DD/MM/YYYY
  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
  };

  // Long date for modal header: "March 15, 2024 at 04:00 PM"
  const formatModalDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  const getLanguageFlag = (languageCode?: string | null) => {
    switch ((languageCode || '').toLowerCase()) {
      // East Asian
      case 'ja':    return '🇯🇵'; // Japanese
      case 'ko':    return '🇰🇷'; // Korean
      case 'zh':    return '🇨🇳'; // Chinese (Simplified)
      case 'zh-tw': return '🇹🇼'; // Chinese (Traditional)
      case 'zh-hk': return '🇭🇰'; // Cantonese / Hong Kong
      // Southeast Asian
      case 'th':    return '🇹🇭'; // Thai
      case 'vi':    return '🇻🇳'; // Vietnamese
      case 'id':    return '🇮🇩'; // Indonesian
      case 'ms':    return '🇲🇾'; // Malay
      case 'tl':    return '🇵🇭'; // Filipino / Tagalog
      case 'my':    return '🇲🇲'; // Burmese
      case 'km':    return '🇰🇭'; // Khmer
      case 'lo':    return '🇱🇦'; // Lao
      // South Asian
      case 'hi':    return '🇮🇳'; // Hindi
      case 'mr':    return '🇮🇳'; // Marathi
      case 'ne':    return '🇳🇵'; // Nepali
      case 'bn':    return '🇧🇩'; // Bengali
      case 'ta':    return '🇱🇰'; // Tamil
      case 'te':    return '🇮🇳'; // Telugu
      case 'kn':    return '🇮🇳'; // Kannada
      case 'ml':    return '🇮🇳'; // Malayalam
      case 'gu':    return '🇮🇳'; // Gujarati
      case 'pa':    return '🇮🇳'; // Punjabi
      case 'or':    return '🇮🇳'; // Odia
      case 'si':    return '🇱🇰'; // Sinhala
      case 'ur':    return '🇵🇰'; // Urdu
      // Middle Eastern
      case 'ar':    return '🇸🇦'; // Arabic
      case 'he':    return '🇮🇱'; // Hebrew
      case 'fa':    return '🇮🇷'; // Persian / Farsi
      case 'ps':    return '🇦🇫'; // Pashto
      // European — Latin script
      case 'en':    return '🇬🇧'; // English
      case 'es':    return '🇪🇸'; // Spanish
      case 'fr':    return '🇫🇷'; // French
      case 'de':    return '🇩🇪'; // German
      case 'pt':    return '🇵🇹'; // Portuguese
      case 'it':    return '🇮🇹'; // Italian
      case 'nl':    return '🇳🇱'; // Dutch
      case 'sv':    return '🇸🇪'; // Swedish
      case 'no':    return '🇳🇴'; // Norwegian
      case 'da':    return '🇩🇰'; // Danish
      case 'fi':    return '🇫🇮'; // Finnish
      case 'pl':    return '🇵🇱'; // Polish
      case 'cs':    return '🇨🇿'; // Czech
      case 'sk':    return '🇸🇰'; // Slovak
      case 'hu':    return '🇭🇺'; // Hungarian
      case 'ro':    return '🇷🇴'; // Romanian
      case 'hr':    return '🇭🇷'; // Croatian
      case 'sl':    return '🇸🇮'; // Slovenian
      case 'bs':    return '🇧🇦'; // Bosnian
      case 'tr':    return '🇹🇷'; // Turkish
      case 'sq':    return '🇦🇱'; // Albanian
      case 'lt':    return '🇱🇹'; // Lithuanian
      case 'lv':    return '🇱🇻'; // Latvian
      case 'et':    return '🇪🇪'; // Estonian
      case 'ga':    return '🇮🇪'; // Irish
      case 'is':    return '🇮🇸'; // Icelandic
      case 'mt':    return '🇲🇹'; // Maltese
      case 'af':    return '🇿🇦'; // Afrikaans
      // European — Cyrillic
      case 'ru':    return '🇷🇺'; // Russian
      case 'uk':    return '🇺🇦'; // Ukrainian
      case 'bg':    return '🇧🇬'; // Bulgarian
      case 'sr':    return '🇷🇸'; // Serbian
      case 'mk':    return '🇲🇰'; // Macedonian
      case 'be':    return '🇧🇾'; // Belarusian
      case 'mn':    return '🇲🇳'; // Mongolian
      case 'kk':    return '🇰🇿'; // Kazakh
      // Other European scripts
      case 'el':    return '🇬🇷'; // Greek
      case 'ka':    return '🇬🇪'; // Georgian
      case 'hy':    return '🇦🇲'; // Armenian
      case 'az':    return '🇦🇿'; // Azerbaijani
      // African
      case 'am':    return '🇪🇹'; // Amharic
      case 'sw':    return '🇰🇪'; // Swahili
      case 'yo':    return '🇳🇬'; // Yoruba
      case 'ig':    return '🇳🇬'; // Igbo
      case 'ha':    return '🇳🇬'; // Hausa
      default:      return null;
    }
  };

  const getDisplayTitle = (snapshot: TableSnapshot) => {
    if (snapshot.title && snapshot.title.trim()) return snapshot.title.trim();
    return snapshot.column_names.join(' • ');
  };

  // ── Edit modal helpers ────────────────────────────────────────────────────

  const EDITABLE_TAGS = ['Languages', 'Expenses', 'General'];

  const openEditModal = (snapshot: TableSnapshot) => {
    setEditingSnapshot(snapshot);
    setEditTitle(snapshot.title ?? '');
    // Normalize to only the simplified tag list — old tags like 'Shopping' or
    // 'Inventory' get dropped. If nothing matches, fall back to ['General'].
    const normalised = snapshot.auto_tags.filter((t) => EDITABLE_TAGS.includes(t));
    setEditTags(normalised.length > 0 ? normalised : ['General']);
    setEditColumns([...snapshot.column_names]);
    setEditRows(snapshot.table_data.map((row) => ({ ...row })));
  };

  const closeEditModal = () => {
    setEditingSnapshot(null);
    setEditTitle('');
    setEditTags([]);
    setEditColumns([]);
    setEditRows([]);
    setNewColName('');
  };

  const toggleEditTag = (tag: string) => {
    setEditTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleColumnRename = (oldName: string, newName: string, colIndex: number) => {
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedNew === oldName) return;
    const updatedColumns = editColumns.map((col, i) => (i === colIndex ? trimmedNew : col));
    setEditColumns(updatedColumns);
    const updatedRows = editRows.map((row) => {
      const updatedRow: Record<string, string> = {};
      Object.entries(row).forEach(([key, val]) => {
        updatedRow[key === oldName ? trimmedNew : key] = val;
      });
      return updatedRow;
    });
    setEditRows(updatedRows);
  };

  const handleCellEdit = (rowIndex: number, colName: string, value: string) => {
    setEditRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, [colName]: value } : row))
    );
  };

  const addRow = () => {
    const emptyRow = Object.fromEntries(editColumns.map((col) => [col, '']));
    setEditRows((prev) => [...prev, emptyRow]);
  };

  const deleteRow = (rowIdx: number) => {
    setEditRows((prev) => prev.filter((_, i) => i !== rowIdx));
  };

  const deleteColumn = (colName: string) => {
    setEditColumns((prev) => prev.filter((c) => c !== colName));
    setEditRows((prev) =>
      prev.map((row) => {
        const updated = { ...row };
        delete updated[colName];
        return updated;
      }),
    );
  };

  const addColumn = () => {
    const name = newColName.trim();
    if (!name || editColumns.includes(name)) return;
    setEditColumns((prev) => [...prev, name]);
    setEditRows((prev) => prev.map((row) => ({ ...row, [name]: '' })));
    setNewColName('');
  };

  const saveEdits = async () => {
    if (!editingSnapshot || !user) return;
    setEditSaving(true);
    const payload = {
      title: editTitle.trim() || null,
      auto_tags: editTags.length > 0 ? editTags : ['General'],
      column_names: editColumns,
      table_data: editRows,
      column_count: editColumns.length,
      row_count: editRows.length,
    };
    const { error } = await supabase
      .from('table_snapshots')
      .update(payload)
      .eq('id', editingSnapshot.id);

    if (error) {
      console.error('Update error:', error);
      toast.error('Failed to save changes. Please try again.');
    } else {
      toast.success('Changes saved.');
      await fetchSnapshots();
      closeEditModal();
    }
    setEditSaving(false);
  };

  const saveAsNewTable = async () => {
    if (!editingSnapshot || !user) return;
    setEditSaving(true);
    const { error } = await supabase.from('table_snapshots').insert({
      user_id: user.id,
      title: editTitle.trim() ? `${editTitle.trim()} (copy)` : null,
      column_names: editColumns,
      table_data: editRows,
      column_count: editColumns.length,
      row_count: editRows.length,
      auto_tags: editTags.length > 0 ? editTags : ['General'],
      ocr_confidence: editingSnapshot.ocr_confidence,
      dataset_type: editingSnapshot.dataset_type,
      language_code: editingSnapshot.language_code,
      language_name: editingSnapshot.language_name,
    });

    if (error) {
      console.error('Insert error:', error);
      toast.error('Failed to create new table. Please try again.');
    } else {
      toast.success('Saved as new table.');
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

  const getMergePreview = () => {
    const selected = snapshots.filter((s) => selectedIds.has(s.id));
    if (selected.length < 2) return null;
    const baseCols = selected[0].column_names;
    const extraCols = selected
      .slice(1)
      .flatMap((t) => t.column_names)
      .filter((col) => !baseCols.includes(col));
    const mergedColumns = [...baseCols, ...extraCols];
    const totalRows = selected.reduce((sum, t) => sum + t.row_count, 0);
    const columnsMatch = selected.every(
      (t) => t.column_names.length === baseCols.length && t.column_names.every((c, i) => c === baseCols[i])
    );
    return { mergedColumns, totalRows, columnsMatch, selected };
  };

  const mergeTables = async () => {
    const preview = getMergePreview();
    if (!preview || !user) return;
    setMergeSaving(true);
    const { mergedColumns, selected } = preview;
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

    const { error: insertErr } = await supabase.from('table_snapshots').insert({
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
      toast.error('Failed to merge. Please try again.');
      setMergeSaving(false);
      return;
    }

    if (deleteAfterMerge) {
      await supabase.from('table_snapshots').delete().in('id', [...selectedIds]);
    }

    toast.success('Tables merged successfully.');
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
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Tables</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {selectMode
            ? `${selectedIds.size} table${selectedIds.size !== 1 ? 's' : ''} selected`
            : 'Manage and explore your extracted tables'}
        </p>
      </div>

      {/* Usage warning banners */}
      {!canUpload && (
        <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-sm">
          <span className="text-red-600 dark:text-red-400 font-medium">Upload limit reached</span>
          <span className="text-red-500 dark:text-red-400">{uploadsThisMonth} / {LIMITS.UPLOADS_PER_MONTH} used this month</span>
          <button onClick={() => setUpgradeModal('uploads')} className="ml-auto text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors">Upgrade</button>
        </div>
      )}
      {canUpload && uploadsRemaining <= LIMITS.WARN_THRESHOLD && (
        <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 text-sm">
          <span className="text-amber-700 dark:text-amber-400 font-medium">{uploadsRemaining} upload{uploadsRemaining !== 1 ? 's' : ''} remaining this month</span>
          <button onClick={() => setUpgradeModal('uploads')} className="ml-auto text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline">Upgrade for unlimited</button>
        </div>
      )}
      {!canStore && (
        <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-sm">
          <span className="text-red-600 dark:text-red-400 font-medium">Storage limit reached</span>
          <span className="text-red-500 dark:text-red-400">{totalTables} / {LIMITS.TOTAL_TABLES} tables stored</span>
          <button onClick={() => setUpgradeModal('storage')} className="ml-auto text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors">Upgrade</button>
        </div>
      )}
      {canStore && tablesRemaining <= LIMITS.WARN_THRESHOLD && (
        <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 text-sm">
          <span className="text-amber-700 dark:text-amber-400 font-medium">{tablesRemaining} storage slot{tablesRemaining !== 1 ? 's' : ''} remaining</span>
          <button onClick={() => setUpgradeModal('storage')} className="ml-auto text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline">Upgrade for unlimited</button>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tables..."
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-zinc-700/80 rounded-xl text-sm bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
          />
        </div>
        {/* Merge mode toggle — icon button next to search */}
        <button
          onClick={toggleSelectMode}
          title={selectMode ? 'Cancel merge' : 'Select tables to merge'}
          className={`p-2.5 rounded-xl border transition-colors ${
            selectMode
              ? 'border-blue-500 bg-blue-600 text-white'
              : 'border-gray-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedFilter(filter)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedFilter === filter
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Table cards list */}
      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <TableCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredSnapshots.length === 0 ? (
        <div className="dashboard-card p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {searchQuery
              ? `No tables match "${searchQuery}"`
              : 'No tables found. Upload your first table image!'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredSnapshots.map((snapshot) => {
            const flag = getLanguageFlag(snapshot.language_code);
            const isSelected = selectedIds.has(snapshot.id);

            return (
              <div
                key={snapshot.id}
                onClick={selectMode ? () => toggleSelect(snapshot.id) : undefined}
                className={`dashboard-card px-5 py-4 transition-all hover:border-blue-500/30 ${
                  selectMode
                    ? 'cursor-pointer ' + (isSelected ? '!border-blue-500 ring-2 ring-blue-500/20' : '')
                    : ''
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Checkbox — only visible in select mode */}
                    {selectMode && (
                      <div className="mt-0.5 flex-shrink-0 text-blue-600">
                        {isSelected
                          ? <CheckSquare className="w-5 h-5" />
                          : <Square className="w-5 h-5 text-gray-400" />}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Row 1: title + badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                          {highlight(getDisplayTitle(snapshot), searchQuery)}
                        </h3>

                        {user?.preferences?.showConfidence !== false && (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-600 dark:text-green-400 rounded text-xs font-medium border border-green-500/20">
                            {snapshot.ocr_confidence}% confident
                          </span>
                        )}

                        {snapshot.dataset_type === 'language' && snapshot.language_name && (
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-600 dark:text-purple-300 rounded text-xs font-medium border border-purple-500/20">
                            {flag ? `${flag} ` : ''}{snapshot.language_name}
                          </span>
                        )}
                      </div>

                      {/* Row 2: metadata */}
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap mb-2">
                        <span>{snapshot.row_count} rows • {snapshot.column_count} columns</span>
                        <span className="mx-1 opacity-40">·</span>
                        <span>Created {formatDate(snapshot.created_at)}</span>
                        {snapshot.updated_at && snapshot.updated_at !== snapshot.created_at && (
                          <>
                            <span className="mx-1 opacity-40">·</span>
                            <span className="text-amber-500 dark:text-amber-400">
                              Modified {formatDate(snapshot.updated_at)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Row 3: tags */}
                      {snapshot.auto_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {snapshot.auto_tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2.5 py-0.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded-md text-xs font-medium"
                            >
                              {highlight(tag, searchQuery)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action icon buttons — hidden in select mode */}
                  {!selectMode && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setSelectedSnapshot(snapshot)}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors"
                        title="View table"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(snapshot)}
                        className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 hover:text-amber-600 transition-colors"
                        title="Edit table"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => exportToCSV(snapshot)}
                        className="p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-500 hover:text-green-600 transition-colors"
                        title="Export CSV"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteSnapshot(snapshot.id)}
                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky merge action bar */}
      {selectMode && selectedIds.size >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl dark:bg-white dark:text-gray-900">
          <span className="text-sm font-medium">{selectedIds.size} tables selected</span>
          <button
            onClick={() => { setMergeTitle(''); setShowMergeModal(true); }}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-xl transition-colors text-sm"
          >
            <Layers className="w-4 h-4" />
            Merge {selectedIds.size} Tables
          </button>
        </div>
      )}

      {/* Floating action button — upload */}
      {!selectMode && (
        <button
          onClick={() => {
            if (!canUpload) { setUpgradeModal('uploads'); return; }
            if (!canStore)  { setUpgradeModal('storage'); return; }
            window.dispatchEvent(new Event('open-upload-modal'));
          }}
          className="fixed bottom-6 right-6 z-30 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
          title="Upload Table"
        >
          <Plus className="w-5 h-5" />
        </button>
      )}

      {/* ── Merge confirmation modal ─────────────────────────────────────── */}
      {showMergeModal && (() => {
        const preview = getMergePreview();
        if (!preview) return null;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowMergeModal(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 p-8 border border-gray-200 dark:border-zinc-800/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-500" />
                  Merge Tables
                </h2>
                <button onClick={() => setShowMergeModal(false)} className="p-2 hover:bg-gray-100 rounded-lg dark:hover:bg-zinc-800">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="mb-5 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm space-y-2">
                <p className="text-blue-800 dark:text-blue-300">
                  <span className="font-semibold">{preview.selected.length} tables</span> → <span className="font-semibold">{preview.totalRows} total rows</span>
                </p>
                <p className="text-blue-700 dark:text-blue-400">Columns: {preview.mergedColumns.join(' · ')}</p>
                {!preview.columnsMatch && (
                  <p className="text-amber-700 dark:text-amber-400 font-medium">
                    ⚠ Some tables have different columns — missing cells will be left blank.
                  </p>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Name the merged table</label>
                <input
                  type="text"
                  value={mergeTitle}
                  onChange={(e) => setMergeTitle(e.target.value)}
                  placeholder="e.g. Japanese Vocab — All Chapters"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:placeholder-gray-400"
                />
              </div>

              <label className="flex items-center gap-3 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteAfterMerge}
                  onChange={(e) => setDeleteAfterMerge(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Delete original tables after merging</span>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={mergeTables}
                  disabled={mergeSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {mergeSaving ? 'Merging...' : <><Layers className="w-4 h-4" /> Merge Tables</>}
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

      {/* ── View-only preview modal ──────────────────────────────────────── */}
      {selectedSnapshot && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => { setSelectedSnapshot(null); setAnkiStatus('idle'); setAnkiError(''); }}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800/60 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-zinc-800 relative">
              <div className="flex items-start gap-2 pr-10">
                <h2 className="text-base font-bold text-gray-900 dark:text-white leading-snug">
                  {getDisplayTitle(selectedSnapshot)}
                </h2>
                {selectedSnapshot.dataset_type === 'language' && selectedSnapshot.language_name && (
                  <span className="flex-shrink-0 px-2 py-0.5 bg-purple-500/20 text-purple-600 dark:text-purple-300 rounded text-xs font-medium border border-purple-500/20 mt-0.5">
                    {getLanguageFlag(selectedSnapshot.language_code) ?? ''} {selectedSnapshot.language_name}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Created: {formatModalDate(selectedSnapshot.created_at)}
              </p>
              {/* Round close button */}
              <button
                onClick={() => { setSelectedSnapshot(null); setAnkiStatus('idle'); setAnkiError(''); }}
                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                  <tr className="border-b border-gray-100 dark:border-zinc-800">
                    {selectedSnapshot.column_names.map((col) => {
                      const isAi = (selectedSnapshot.added_columns ?? []).includes(col);
                      return (
                        <th key={col} className={`text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wide ${isAi ? '' : 'text-teal-500 dark:text-teal-400'}`}>
                          <AiColumnHeader name={col} isAi={isAi} />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {selectedSnapshot.table_data.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-gray-50 dark:border-zinc-800/60 ${
                        idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-zinc-800/20'
                      }`}
                    >
                      {selectedSnapshot.column_names.map((col) => (
                        <td key={col} className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{row[col]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer: stats */}
            <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>{selectedSnapshot.row_count} rows</span>
              <span className="opacity-40">•</span>
              <span>{selectedSnapshot.column_count} columns</span>
              {user?.preferences?.showConfidence !== false && (
                <>
                  <span className="opacity-40">•</span>
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-600 dark:text-green-400 rounded-full border border-green-500/20 font-medium">
                    {selectedSnapshot.ocr_confidence}% confidence
                  </span>
                </>
              )}
            </div>

            {/* Action buttons — 2 rows of 3 */}
            <div className="px-5 pb-5 pt-2 grid grid-cols-3 gap-2">
              <button
                onClick={() => exportToCSV(selectedSnapshot)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>

              <button
                onClick={() => exportToTXT(selectedSnapshot)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-medium rounded-lg text-xs transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Export TXT
              </button>

              <button
                onClick={() => copyToClipboard(selectedSnapshot)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-medium rounded-lg text-xs transition-colors"
              >
                <Clipboard className="w-3.5 h-3.5" />
                {copied ? 'Copied!' : 'Copy'}
              </button>

              {/* Anki buttons — only for 2-column tables */}
              {selectedSnapshot.column_names.length === 2 ? (
                <>
                  <button
                    onClick={() => exportToAnki(selectedSnapshot)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg text-xs transition-colors"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    For Anki
                  </button>

                  <button
                    onClick={() => sendToAnki(selectedSnapshot)}
                    disabled={ankiStatus === 'sending'}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-medium rounded-lg text-xs transition-colors"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {ankiStatus === 'sending' ? 'Sending...' : ankiStatus === 'success' ? 'Sent!' : 'Send to Anki'}
                  </button>
                </>
              ) : (
                <div className="col-span-2" />
              )}

              <button
                onClick={() => copyShareLink(selectedSnapshot)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-medium rounded-lg text-xs transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                {shareCopied ? 'Copied!' : 'Share'}
              </button>
            </div>

            {/* AnkiConnect status messages */}
            {ankiStatus === 'success' && (
              <p className="mx-5 mb-4 px-3 py-2 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
                Cards sent to Anki successfully!
              </p>
            )}
            {ankiStatus === 'error' && (
              <div className="mx-5 mb-4 px-3 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 space-y-2">
                {ankiError === 'CORS_OR_OFFLINE' ? (
                  <>
                    <p className="font-semibold">Could not reach Anki on your computer.</p>
                    <p>Follow these steps to fix it:</p>
                    <ol className="list-decimal list-inside space-y-1 pl-1">
                      <li>Open <strong>Anki</strong> on your computer.</li>
                      <li>Install the <strong>AnkiConnect</strong> add-on (code: <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded">2055492</code>).</li>
                      <li>Go to <strong>Tools → Add-ons → AnkiConnect → Config</strong> and add <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded">https://tablesnap.co.in</code> to <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded">webCorsOriginList</code>.</li>
                      <li>Restart Anki, then try again.</li>
                    </ol>
                  </>
                ) : (
                  <p>{ankiError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit modal ───────────────────────────────────────────────────── */}
      {editingSnapshot && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-zinc-900 p-4 sm:p-8 border border-gray-200 dark:border-zinc-800/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold dark:text-white">Edit Table</h2>
              <button onClick={closeEditModal} className="p-2 hover:bg-gray-100 rounded-lg dark:hover:bg-zinc-800">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Table Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Japanese Vocab Chapter 3, Monthly Expenses..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:placeholder-gray-400"
              />
              <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">Leave blank to auto-display column names as the title</p>
            </div>

            {/* Tags */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tags</label>
              <div className="flex items-center gap-2">
                {[
                  { tag: 'Languages', on: 'bg-purple-600 text-white border-purple-600', off: 'border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20' },
                  { tag: 'Expenses',  on: 'bg-amber-500 text-white border-amber-500',   off: 'border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20' },
                  { tag: 'General',   on: 'bg-zinc-600 text-white border-zinc-600',      off: 'border-gray-300 text-gray-600 dark:border-zinc-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800' },
                ].map(({ tag, on, off }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleEditTag(tag)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${editTags.includes(tag) ? on : off}`}
                  >
                    {tag}
                  </button>
                ))}
                {editTags.length === 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                    At least one tag required — will default to General on save
                  </span>
                )}
              </div>
            </div>

            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Table Data
                <span className="font-normal text-gray-400 ml-2 dark:text-gray-500">— click any header or cell to edit</span>
              </p>

              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-zinc-800">
                    <tr>
                      {editColumns.map((col, colIdx) => (
                        <th key={colIdx} className="p-2 text-left group">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              defaultValue={col}
                              onBlur={(e) => handleColumnRename(col, e.target.value, colIdx)}
                              className="w-full px-2 py-1 font-semibold text-gray-900 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-blue-900/30 dark:border-blue-700 dark:text-white"
                            />
                            <button
                              onClick={() => deleteColumn(col)}
                              className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all dark:hover:bg-red-900/20"
                              title="Delete this column"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {editRows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-t border-gray-100 dark:border-zinc-800 group">
                        {editColumns.map((col, colIdx) => (
                          <td key={colIdx} className="p-2">
                            <input
                              type="text"
                              value={row[col] ?? ''}
                              onChange={(e) => handleCellEdit(rowIdx, col, e.target.value)}
                              className="w-full px-2 py-1 text-gray-900 bg-white border border-transparent hover:border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none dark:bg-zinc-900 dark:text-gray-100 dark:hover:border-gray-600"
                            />
                          </td>
                        ))}
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

              <button
                onClick={addRow}
                className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors dark:text-blue-400 dark:hover:bg-blue-900/20"
              >
                <Plus className="w-4 h-4" />
                Add Row
              </button>

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="New column name..."
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addColumn()}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:border-zinc-600 dark:text-gray-100 dark:placeholder:text-gray-400"
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

            <div className="flex flex-wrap gap-3">
              <button
                onClick={saveEdits}
                disabled={editSaving}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editSaving ? 'Saving...' : <><Check className="w-4 h-4" /> Save Changes</>}
              </button>
              <button
                onClick={saveAsNewTable}
                disabled={editSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editSaving ? 'Saving...' : <><Plus className="w-4 h-4" /> Save as New Table</>}
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

      {/* Upgrade modal */}
      {upgradeModal && (
        <UpgradeModal
          isOpen
          onClose={() => setUpgradeModal(null)}
          limitType={upgradeModal}
          current={upgradeModal === 'uploads' ? uploadsThisMonth : totalTables}
        />
      )}
    </div>
  );
}
