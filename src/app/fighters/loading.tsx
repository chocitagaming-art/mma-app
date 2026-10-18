import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Loading UI for /fighters. Mirrors the heading, the filter card (search box,
// the "Filtros y orden" button on phones, the four selects from md up) and the
// card grid of page.tsx: same columns, gaps and photo-zone heights, so nothing
// jumps when the real page streams in.
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
        <CardContent className="space-y-6 p-4 md:p-6">
          <div className="flex flex-col gap-5">
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-11 w-full rounded-[10px] md:hidden" />
            <div className="hidden gap-x-6 gap-y-5 md:grid md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-11 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Fighter card grid: 2 / 3 / 4 columns, a page of 12 */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-[18px] lg:grid-cols-4 lg:gap-5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-[16px] border border-border bg-card"
          >
            <div className="flex h-[138px] items-end justify-center border-b border-border lg:h-[186px]">
              <Skeleton className="h-[80%] w-1/2 rounded-b-none rounded-t-full" />
            </div>
            <div className="flex flex-col items-center gap-2 px-2.5 pb-3.5 pt-2.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-3/4 lg:h-5" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
