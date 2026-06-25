import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Loading UI for /fighters/[id]. Mirrors the profile header card (headshot +
// identity + record box, vitals row), the performance summary card and the
// fight-history table.
export default function FighterDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Identity card */}
        <Card className="overflow-hidden border-border bg-card">
          <CardContent className="space-y-8 p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex flex-wrap items-center gap-6">
                <Skeleton className="size-32 shrink-0 rounded-lg" />
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-11 w-72 max-w-full" />
                    <Skeleton className="h-5 w-40" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-7 w-28 rounded-md" />
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3 rounded-3xl border border-border bg-muted px-6 py-5 text-right">
                <Skeleton className="ml-auto h-3 w-16" />
                <Skeleton className="ml-auto h-10 w-28" />
                <Skeleton className="ml-auto h-3 w-32" />
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Performance summary card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <Skeleton className="h-6 w-56" />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
            <Skeleton className="h-40 w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Fight history */}
      <section className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-9 w-80 max-w-full" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="hidden gap-4 border-b border-border px-4 py-3 md:grid md:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-4 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-7 md:items-center"
            >
              {Array.from({ length: 7 }).map((__, j) => (
                <Skeleton key={j} className="h-4 w-20" />
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
