export default function DealerLoading() {
  return (
    <div className="space-y-6 p-4">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-28 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-52 animate-pulse rounded bg-slate-100" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200" key={index}>
            <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-8 w-12 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* List skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200" key={index}>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded-full bg-slate-200" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
