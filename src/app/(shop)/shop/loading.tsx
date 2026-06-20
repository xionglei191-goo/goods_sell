export default function ShopLoading() {
  return (
    <div className="space-y-8">
      {/* Banner skeleton */}
      <div className="h-44 animate-pulse rounded-md bg-neutral-200 sm:h-56" />

      {/* Category grid skeleton */}
      <section className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="shop-block-card p-4" key={index}>
            <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-neutral-200" />
            <div className="mx-auto mt-2 h-4 w-16 animate-pulse rounded bg-neutral-200" />
            <div className="mx-auto mt-1 h-3 w-10 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </section>

      {/* Products section skeleton */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-24 animate-pulse rounded bg-neutral-200" />
            <div className="mt-2 h-4 w-40 animate-pulse rounded bg-neutral-100" />
          </div>
          <div className="h-4 w-16 animate-pulse rounded bg-neutral-200" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="w-44 shrink-0 sm:w-52" key={index}>
              <div className="shop-block-card">
                <div className="h-32 animate-pulse rounded-t-lg bg-neutral-200 sm:h-40" />
                <div className="p-3">
                  <div className="h-4 w-full animate-pulse rounded bg-neutral-200" />
                  <div className="mt-2 h-5 w-16 animate-pulse rounded bg-neutral-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Product grid skeleton */}
      <section className="space-y-4">
        <div>
          <div className="h-6 w-24 animate-pulse rounded bg-neutral-200" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-neutral-100" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="shop-block-card" key={index}>
              <div className="h-36 animate-pulse rounded-t-lg bg-neutral-200 sm:h-44" />
              <div className="p-3">
                <div className="h-4 w-full animate-pulse rounded bg-neutral-200" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-neutral-100" />
                <div className="mt-3 h-5 w-16 animate-pulse rounded bg-neutral-200" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
