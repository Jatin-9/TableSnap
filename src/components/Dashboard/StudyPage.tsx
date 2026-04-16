import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, TableSnapshot } from '../../lib/supabase';
import { Shuffle, ArrowLeft, ArrowRight, RotateCcw, BookOpen, Repeat2 } from 'lucide-react';
import { StudySkeleton } from '../ui/Skeleton';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Flashcard {
  front: string;
  back: string;
  // Each card carries its own column labels so study mode can show the right
  // header even when cards come from tables with different column names.
  frontLabel: string;
  backLabel: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Fisher-Yates shuffle — returns a new shuffled array without mutating the original.
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StudyPage() {
  const { user } = useAuth();

  // ── Picker state ──────────────────────────────────────────────────────────
  const [twoColTables, setTwoColTables] = useState<TableSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  // Set of selected table IDs — same pattern as the merge feature.
  // Using a Set means .has() checks are instant and duplicates are impossible.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // swapped = true means column 2 is front, column 1 is back.
  // Applies to ALL selected tables when starting.
  const [swapped, setSwapped] = useState(false);

  // ── Study state ───────────────────────────────────────────────────────────
  // null = still in picker, non-null = in study mode
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // ── Fetch 2-column tables ─────────────────────────────────────────────────

  useEffect(() => {
    if (user) fetchTables();
  }, [user]);

  const fetchTables = async () => {
    const { data } = await supabase
      .from('table_snapshots')
      .select('*')
      .eq('user_id', user!.id)
      .eq('column_count', 2)
      .order('created_at', { ascending: false });

    const tables = data ?? [];
    setTwoColTables(tables);
    localStorage.setItem('study_table_count', String(tables.length));
    setLoading(false);
  };

  // ── Toggle a table in/out of the selection ────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      // If already selected, remove it. Otherwise add it.
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Build combined deck and start studying ────────────────────────────────

  const startStudying = (shouldShuffle: boolean) => {
    // Get the full snapshot objects for every selected ID
    const selected = twoColTables.filter((t) => selectedIds.has(t.id));

    // flatMap means: for each table, produce an array of cards, then join all
    // those arrays into one flat array. So 2 tables × 3 rows = 6 cards total.
    let built: Flashcard[] = selected.flatMap((table) => {
      const [col1, col2] = table.column_names;
      return table.table_data.map((row) => ({
        front: swapped ? (row[col2] ?? '') : (row[col1] ?? ''),
        back: swapped ? (row[col1] ?? '') : (row[col2] ?? ''),
        frontLabel: swapped ? col2 : col1,
        backLabel: swapped ? col1 : col2,
      }));
    });

    if (shouldShuffle) built = shuffle(built);

    setCards(built);
    setCurrentIndex(0);
    setFlipped(false);
  };

  // ── Card navigation ───────────────────────────────────────────────────────

  const next = useCallback(() => {
    if (!cards) return;
    setFlipped(false);
    setCurrentIndex((i) => (i + 1) % cards.length);
  }, [cards]);

  const prev = useCallback(() => {
    if (!cards) return;
    setFlipped(false);
    setCurrentIndex((i) => (i - 1 + cards.length) % cards.length);
  }, [cards]);

  // Keyboard shortcuts — arrow keys navigate, space flips
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!cards) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cards, next, prev]);

  const getTitle = (s: TableSnapshot) => s.title ?? s.column_names.join(' · ');

  // Total cards across all selected tables
  const totalCards = twoColTables
    .filter((t) => selectedIds.has(t.id))
    .reduce((sum, t) => sum + t.row_count, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — PICKER PHASE
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <StudySkeleton />;

  if (!cards) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Study</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Select one or more tables to study as flashcards
          </p>
        </div>

        {twoColTables.length === 0 ? (
          <div className="mt-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">No 2-column tables found</p>
            <p className="text-gray-400 text-sm mt-1">
              Upload a vocab table with exactly 2 columns (e.g. Word | Meaning) to study it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
            {twoColTables.map((table) => {
              const isSelected = selectedIds.has(table.id);
              const [col1, col2] = table.column_names;

              return (
                <div
                  key={table.id}
                  onClick={() => toggleSelect(table.id)}
                  className={`cursor-pointer rounded-xl border-2 p-5 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                      : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 hover:border-blue-400 dark:hover:border-blue-600'
                  }`}
                >
                  <p className="font-semibold text-gray-900 dark:text-white mb-2 truncate">
                    {getTitle(table)}
                  </p>

                  {/* Front/back labels — swap only affects the label when this
                      table is selected so unselected cards stay unchanged */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded dark:bg-blue-900/40 dark:text-blue-300">
                      Front: {isSelected && swapped ? col2 : col1}
                    </span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded dark:bg-zinc-700 dark:text-gray-300">
                      Back: {isSelected && swapped ? col1 : col2}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-gray-400">{table.row_count} cards</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Controls — only shown when at least one table is selected */}
        {selectedIds.size > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* Total card count across all selected tables */}
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {selectedIds.size} {selectedIds.size === 1 ? 'table' : 'tables'} · {totalCards} cards total
            </span>

            {/* Swap front/back globally for all selected tables */}
            <button
              onClick={() => setSwapped((s) => !s)}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors dark:border-zinc-600 dark:text-gray-300 dark:hover:bg-zinc-800 text-sm font-medium"
            >
              <Repeat2 className="w-4 h-4" />
              {swapped ? 'Swapped: Col 2 → Front' : 'Swap Front / Back'}
            </button>

            <button
              onClick={() => startStudying(false)}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Start in Order
            </button>

            <button
              onClick={() => startStudying(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
            >
              <Shuffle className="w-4 h-4" />
              Start Shuffled
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — STUDY PHASE
  // ─────────────────────────────────────────────────────────────────────────

  const card = cards[currentIndex];

  return (
    <div className="p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl flex items-center justify-between mb-8">
        <button
          onClick={() => { setCards(null); setFlipped(false); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to tables
        </button>

        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {currentIndex + 1} / {cards.length}
        </span>

        <button
          onClick={() => { setCurrentIndex(0); setFlipped(false); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Restart
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-2xl h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full mb-10">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
        />
      </div>

      {/* The flashcard */}
      <div
        className="w-full max-w-2xl cursor-pointer"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            height: '280px',
          }}
        >
          {/* FRONT face */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border-2 border-blue-200 dark:border-blue-800 shadow-lg p-8"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* Each card carries its own label so it's correct even when
                cards come from tables with different column names */}
            <p className="text-xs uppercase tracking-widest text-blue-400 mb-4 font-semibold">
              {card.frontLabel}
            </p>
            <p className="text-4xl font-bold text-gray-900 dark:text-white text-center">
              {card.front}
            </p>
            <p className="mt-6 text-sm text-gray-400">Click to reveal</p>
          </div>

          {/* BACK face */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-blue-600 dark:bg-blue-700 shadow-lg p-8"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <p className="text-xs uppercase tracking-widest text-blue-200 mb-4 font-semibold">
              {card.backLabel}
            </p>
            <p className="text-4xl font-bold text-white text-center">
              {card.back}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-6 mt-10">
        <button
          onClick={prev}
          className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-gray-200"
        >
          <ArrowLeft className="w-5 h-5" />
          Prev
        </button>

        <button
          onClick={next}
          className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-gray-200"
        >
          Next
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      <p className="mt-4 text-xs text-gray-400 dark:text-gray-600">
        Tip: use ← → arrow keys to navigate, Space to flip
      </p>
    </div>
  );
}
