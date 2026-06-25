import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for /eventos/[id]. Mirrors the back link, the event header (poster +
// title + meta) and the grouped bout sections with their rows.
export default function EventDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Skeleton className="h-4 w-24" />

      {/* Header */}
      <div className="mt-4 flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-start">
        <Skeleton className="aspect-[16/9] w-full shrink-0 rounded-lg sm:w-56" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-80 max-w-full" />
          <Skeleton className="h-4 w-56" />
          <div className="flex flex-wrap gap-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>

      {/* Bout sections */}
      <div className="mt-8 space-y-8">
        {Array.from({ length: 2 }).map((_, s) => (
          <section key={s}>
            <Skeleton className="mb-3 h-4 w-40" />
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Skeleton className="size-12 shrink-0 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-6" />
                  <div className="flex min-w-0 flex-row-reverse items-center gap-3">
                    <Skeleton className="size-12 shrink-0 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="ml-auto h-4 w-28" />
                      <Skeleton className="ml-auto h-3 w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
