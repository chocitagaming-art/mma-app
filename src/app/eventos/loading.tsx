import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for /eventos. Mirrors the heading, the Próximos/Pasados tab bar and
// the responsive grid of event cards (poster + title + meta lines).
export default function EventosLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      {/* Tabs */}
      <div className="mt-6 flex items-center gap-4 border-b border-border pb-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>

      {/* Event cards */}
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
          >
            <Skeleton className="aspect-[16/9] w-full rounded-none" />
            <div className="flex flex-1 flex-col gap-3 p-5">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="mt-auto space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
