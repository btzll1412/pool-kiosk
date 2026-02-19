export function SkeletonLine({ width = "w-full", height = "h-4", className = "" }) {
  return (
    <div
      className={`${width} ${height} rounded-md bg-gray-200 animate-skeleton-pulse dark:bg-gray-700 ${className}`}
    />
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}>
      <SkeletonLine width="w-1/3" height="h-4" className="mb-3" />
      <SkeletonLine width="w-1/2" height="h-8" className="mb-2" />
      <SkeletonLine width="w-2/3" height="h-3" />
    </div>
  );
}

export function SkeletonStatCards({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <SkeletonLine width="w-24" height="h-3" className="mb-3" />
              <SkeletonLine width="w-16" height="h-8" className="mb-2" />
              <SkeletonLine width="w-20" height="h-3" />
            </div>
            <div className="h-12 w-12 rounded-xl bg-gray-100 animate-skeleton-pulse dark:bg-gray-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
        <div className="flex gap-6">
          {Array.from({ length: columns }).map((_, i) => (
            <SkeletonLine key={i} width="w-24" height="h-3" />
          ))}
        </div>
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-6 border-b border-gray-100 px-4 py-3.5 last:border-b-0 dark:border-gray-700"
        >
          {Array.from({ length: columns }).map((_, j) => (
            <SkeletonLine
              key={j}
              width={j === 0 ? "w-32" : "w-20"}
              height="h-4"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
