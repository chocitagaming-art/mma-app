import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Loading UI for /fighters. Mirrors the heading, the filter card and the
// fighters table (header row + repeated fighter rows).
export default function FightersLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      {/* Filter card */}
      <Card className="border-border bg-card">
        <CardContent className="space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Fighters table */}
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))] gap-4 border-b border-border px-6 py-4 md:grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-24" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid gap-4 border-b border-border px-6 py-5 md:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))] md:items-center"
          >
            <div className="flex items-center gap-4">
              <Skeleton className="size-12 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
