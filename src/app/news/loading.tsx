import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Loading UI for /news. Mirrors the heading, the category filter card and the
// stacked list of horizontal news cards (image + headline + summary + footer).
export default function NewsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      {/* Category filters */}
      <Card className="border-border bg-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-md" />
            ))}
          </div>
          <Skeleton className="h-4 w-64" />
        </CardContent>
      </Card>

      {/* News list */}
      <div className="grid gap-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card
            key={i}
            className="flex-col gap-0 p-0 sm:flex-row"
          >
            <div className="shrink-0 sm:w-64 sm:self-start lg:w-72">
              <Skeleton className="aspect-[16/9] w-full rounded-none" />
            </div>
            <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-6 w-20 rounded-md" />
                    <Skeleton className="h-6 w-24 rounded-md" />
                  </div>
                  <Skeleton className="h-6 w-80 max-w-full" />
                </div>
                <Skeleton className="h-4 w-20 shrink-0" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
