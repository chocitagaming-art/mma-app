import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for the home page (/). Mirrors the real layout: hero with copy +
// video reel, the four-cell stat strip, the news marquee and the recent-news
// grid alongside the UFC videos column.
export default function HomeLoading() {
  return (
    <div className="pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:px-8 lg:py-20">
          {/* Copy */}
          <div className="order-2 space-y-6 lg:order-1">
            <Skeleton className="h-4 w-56" />
            <div className="space-y-3">
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="h-16 w-2/3" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-full max-w-xl" />
              <Skeleton className="h-5 w-5/6 max-w-xl" />
            </div>
            <Skeleton className="h-12 w-full max-w-xl rounded-lg" />
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-10 w-56 rounded-lg" />
              <Skeleton className="h-10 w-44 rounded-lg" />
            </div>
          </div>

          {/* Video reel */}
          <div className="order-1 flex items-center justify-center lg:order-2">
            <Skeleton className="aspect-video w-full max-w-xl rounded-xl" />
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card px-4 py-7 sm:px-6 lg:px-8">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="mt-3 h-3 w-24" />
            </div>
          ))}
        </div>
      </section>

      {/* News marquee strip */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl gap-8 overflow-hidden px-4 py-3 sm:px-6 lg:px-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-48 shrink-0" />
          ))}
        </div>
      </div>

      {/* Recent news + videos column */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-7">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-72" />
              <Skeleton className="h-4 w-80" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-lg border border-border bg-card"
                >
                  <Skeleton className="aspect-video w-full rounded-none" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Videos column */}
          <aside className="space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-48" />
            </div>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-video w-full rounded-lg" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {/* P4P fighters */}
      <section className="mx-auto max-w-7xl space-y-7 border-t border-border px-4 pt-12 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-80" />
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="flex items-center gap-4 border-b border-border p-5">
                <Skeleton className="size-16 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 p-5">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="space-y-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
