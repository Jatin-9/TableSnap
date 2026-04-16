// A single reusable Skeleton block.
// It renders a grey box with Tailwind's animate-pulse — that's the slow
// fade in/out that gives the "shimmer" loading effect.
// You control the size by passing a className like "h-6 w-48" or "h-32 w-full".

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200 dark:bg-zinc-700 ${className}`}
    />
  );
}

// ── Composed skeleton layouts ──────────────────────────────────────────────────
// These are pre-built combinations of Skeleton blocks that match the shape
// of real UI sections. Think of them like silhouettes of the actual content.

// Mimics one table card in TablesPage — the title row, the date/row-count line,
// the action buttons on the right, and the tag pills at the bottom.
export function TableCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-zinc-900 dark:border-zinc-800">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {/* Title + confidence badge row */}
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-20" />
          </div>
          {/* Date + row/col count row */}
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>

        {/* Action buttons on the right */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Tag pills at the bottom */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
    </div>
  );
}

// Mimics one stat card in AnalyticsPage — small label on top, big number, tiny subtitle.
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl p-5 bg-gray-100 dark:bg-gray-800 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4" />
      </div>
      <Skeleton className="h-10 w-16 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

// Mimics a chart card — just a title and a large empty box where the chart will go.
export function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-zinc-900 dark:border-zinc-800">
      <Skeleton className="h-5 w-48 mb-6" />
      <Skeleton className={`w-full ${height}`} />
    </div>
  );
}

// Mimics the RemindersPage — header, the settings card (toggle row, status
// banner, frequency buttons, preview box, action buttons).
export function RemindersSkeleton() {
  return (
    <div className="p-6 max-w-2xl">
      {/* Page header */}
      <div className="mb-8">
        <Skeleton className="h-8 w-36 mb-3" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Main card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
        {/* Card header row: icon + text + toggle */}
        <div className="flex items-center gap-4 p-6 border-b border-gray-100 dark:border-zinc-800">
          <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="w-12 h-7 rounded-full flex-shrink-0" />
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Status banner */}
          <Skeleton className="h-14 w-full rounded-xl" />

          {/* Frequency buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>

          {/* "What you'll receive" preview */}
          <Skeleton className="h-32 w-full rounded-xl" />

          {/* Save + test buttons */}
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// Mimics the StudyPage picker — header and a grid of table selection cards.
// Uses the last known count from localStorage so the number of skeleton cards
// matches what the user actually has. Falls back to 6 on first visit.
export function StudySkeleton() {
  const count = parseInt(localStorage.getItem('study_table_count') ?? '6', 10) || 6;

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-6">
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Table picker grid — 3 cards per row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border-2 border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
          >
            <Skeleton className="h-5 w-3/4 mb-3" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-5 w-20 rounded" />
            </div>
            <Skeleton className="h-3 w-16 mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
