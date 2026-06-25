import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for /clasificacion. Mirrors the heading plus division groups, each
// group being a labelled row and a grid of ranking cards (champion + ranked
// list).
function RankingCardSkeleton({ withPhotos = false }: { withPhotos?: boolean }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative border-b border-border px-5 py-3">
        <span className="absolute inset-y-0 left-0 w-1 bg-corner-red" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-5 py-4">
        <Skeleton className="size-12 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-2.5">
            <Skeleton className="h-4 w-4 shrink-0" />
            {withPhotos ? (
              <Skeleton className="size-9 shrink-0 rounded-lg" />
            ) : null}
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-9 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClasificacionLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="mt-10 space-y-12">
        {/* Pound for pound (with photos) */}
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-56" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid items-start gap-5 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <RankingCardSkeleton key={i} withPhotos />
            ))}
          </div>
        </section>

        {/* Divisions */}
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-72" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <RankingCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
