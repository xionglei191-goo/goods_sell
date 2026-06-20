export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-32 animate-pulse rounded bg-orange-100" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-orange-50" />
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="surface-panel p-5" key={index}>
            <div className="h-4 w-24 animate-pulse rounded bg-orange-100" />
            <div className="mt-4 h-9 w-32 animate-pulse rounded bg-orange-100" />
            <div className="mt-5 h-4 w-28 animate-pulse rounded bg-orange-50" />
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <div className="h-96 animate-pulse surface-panel" />
        <div className="h-96 animate-pulse surface-panel" />
      </section>
    </div>
  );
}
