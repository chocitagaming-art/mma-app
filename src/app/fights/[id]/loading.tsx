import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for /fights/[id]. Mirrors the redesigned tale-of-the-tape: the
// ufc.com-style face-off (two full-body photo columns with the stat ledger in
// the middle on desktop, below on mobile) plus the event footer.
export default function FightDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="relative p-4 pb-6 sm:p-6 lg:p-8">
          <span className="absolute inset-y-0 left-0 w-1 bg-corner-red" />
          <span className="absolute inset-y-0 right-0 w-1 bg-corner-blue" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(250px,330px)_minmax(0,1fr)] md:items-start md:gap-x-6 lg:gap-x-8">
            {/* Red corner */}
            <div className="order-1 flex flex-col items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-[220px] w-full sm:h-[300px] md:h-[420px]" />
              <Skeleton className="h-6 w-32 max-w-full" />
              <Skeleton className="h-4 w-24" />
            </div>

            {/* Center ledger */}
            <div className="order-3 col-span-2 md:order-2 md:col-span-1 md:self-center">
              <Skeleton className="mx-auto mb-3 h-4 w-32" />
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border py-2.5 last:border-b-0 sm:gap-4"
                >
                  <Skeleton className="ml-auto h-5 w-16" />
                  <Skeleton className="h-3 w-24 sm:w-28" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>

            {/* Blue corner */}
            <div className="order-2 flex flex-col items-center gap-2 md:order-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-[220px] w-full sm:h-[300px] md:h-[420px]" />
              <Skeleton className="h-6 w-32 max-w-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>

        {/* Event footer */}
        <div className="flex justify-center border-t border-border px-6 py-4">
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </section>
    </div>
  );
}
