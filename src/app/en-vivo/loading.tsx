import { ROW_LAYOUTS, rowGeometry } from "@/components/event-bout-row-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Loading UI de /en-vivo: cabecera (eyebrow + título + meta) y una sección de
// cartelera con franja de estado por fila, espejo del layout real.
//
// Las filas, con la fila GRANDE de la cartelera (el dueño, 30-oct-2026): las
// mismas cajas que EventBoutRow con headshotSize="large" (ROW_LAYOUTS.large,
// solo su geometría: el esqueleto no es un enlace y no se ilumina al pasar el
// ratón) y la columna del chevron de EventBoutDisclosure al lado.

const L = ROW_LAYOUTS.large;
const FILA = rowGeometry(L);

/** Una línea de texto: una caja tan alta como la real, con su barra dentro. */
function Linea({ className, barra }: { className: string; barra: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <Skeleton className={barra} />
    </div>
  );
}

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
                  {/* La franja del chip de estado («En curso», «Finalizada»…). */}
                  <div className="px-4 pt-2.5 sm:px-5">
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex items-stretch">
                    <div className="min-w-0 flex-1">
                      <div className={FILA}>
                        <div className={L.redCorner}>
                          <Skeleton className={cn(L.headshot, "rounded-md")} />
                          <div className={L.text}>
                            <Linea className="h-5" barra="h-3.5 w-28 max-w-full" />
                            <Linea className="h-4" barra="h-3 w-16" />
                          </div>
                        </div>
                        <div className={L.centre}>
                          <Skeleton className="h-3 w-6" />
                        </div>
                        <div className={L.blueCorner}>
                          <Skeleton className={cn(L.headshot, "rounded-md")} />
                          <div className={L.text}>
                            <Linea className="h-5 justify-end" barra="h-3.5 w-28 max-w-full" />
                            <Linea className="h-4 justify-end" barra="h-3 w-16" />
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* La columna del chevron (el panel de estadísticas). */}
                    <div className="w-9 shrink-0 border-l border-border/60 sm:w-10" />
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
