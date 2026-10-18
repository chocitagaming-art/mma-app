import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for the home page (/). Mirrors the real layout: hero with copy +
// video reel, the four-cell stat strip, the news marquee and the news-and-
// videos grid (R10: 9 cards, full width, 1/2/3 columns).
export default function HomeLoading() {
  return (
    <div className="pb-16">
      {/* Hero: it follows the theme, NOT always dark like the real one. This
          is the ROOT loading.tsx, so it also shows on a client navigation to
          the routes without their own (/directo, /estado, /compare,
          /predict...), and a dark band flashed before those light pages. The
          home itself is ISR and the header logo prefetches it whole, so it
          hardly ever gets to show this skeleton. */}
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

      {/* Stat strip: one row of four on mobile, as in the real one */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-4 gap-px bg-border md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card px-1 py-3.5 md:px-6 md:py-7 lg:px-8">
              <Skeleton className="mx-auto h-6 w-12 md:mx-0 md:h-10 md:w-28" />
              <Skeleton className="mx-auto mt-1.5 h-2.5 w-14 md:mx-0 md:mt-3 md:h-3 md:w-24" />
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

      {/* News and videos: the same grid as HomeNewsSection */}
      <section className="mx-auto max-w-7xl space-y-7 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={`overflow-hidden rounded-lg border border-border bg-card${i === 8 ? " sm:max-lg:hidden" : ""}`}
            >
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* P4P fighters */}
      <section className="mx-auto max-w-7xl space-y-7 border-t border-border px-4 pt-12 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-80" />
        </div>
        {/* Pestañas Masculino / Femenino (P4PTabs): reservan su alto para que
            la rejilla no salte cuando llega la página. */}
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
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
