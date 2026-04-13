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
      className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700 ${className}`}
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
      <Skeleton className="h-5 w-48 mb-6" />
      <Skeleton className={`w-full ${height}`} />
    </div>
  );
}
