import { Skeleton } from "@/components/ui/skeleton";

// Loading UI de /en-vivo: cabecera (eyebrow + título + meta) y una sección de
// cartelera con franja de estado por fila, espejo del layout real.
export default function LivePageLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-2 h-10 w-80 max-w-full" />
      <div className="mt-3 flex flex-wrap gap-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="mt-5 border-b border-border pb-5">
        <Skeleton className="h-3 w-56" />
      </div>

      <div className="mt-8 space-y-8">
        {Array.from({ length: 2 }).map((_, s) => (
          <section key={s}>
            <Skeleton className="mb-3 h-4 w-40" />
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border-b border-border last:border-b-0">
                  <div className="px-4 pt-2.5 sm:px-5">
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 sm:px-5">
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
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
