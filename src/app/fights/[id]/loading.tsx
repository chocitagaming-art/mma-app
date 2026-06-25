import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for /fights/[id]. Mirrors the heading and the tale-of-the-tape card:
// the two-corner header (red/blue accents, VS in the middle) and the stacked
// stat comparison rows.
export default function FightDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        {/* Corners header */}
        <div className="relative grid grid-cols-2 gap-6 border-b border-border p-6 sm:gap-10 sm:p-8">
          <span className="absolute inset-y-0 left-0 w-1 bg-corner-red" />
          <span className="absolute inset-y-0 right-0 w-1 bg-corner-blue" />
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="size-20 shrink-0 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <div className="flex flex-row-reverse items-center gap-3 sm:gap-4">
            <Skeleton className="size-20 shrink-0 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="ml-auto h-3 w-20" />
              <Skeleton className="ml-auto h-7 w-32" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          </div>
        </div>

        {/* Stat rows */}
        <div className="p-6 sm:p-8">
          <Skeleton className="mx-auto mb-4 h-4 w-64" />
          <div className="mx-auto max-w-xl">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border py-3 last:border-b-0"
              >
                <Skeleton className="ml-auto h-5 w-20" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
