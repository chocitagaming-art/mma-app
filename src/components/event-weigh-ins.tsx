import Link from "next/link";
import { Scale } from "lucide-react";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { formatKgFromLbs, formatLbs } from "@/lib/weigh-in";
import type { EventWeighIn } from "@/lib/types";

// BE2: tabla compacta del pesaje oficial ("weigh-ins") de un evento. Server
// component puro: la página decide cuándo pedir los datos (pasados o semana
// de evento) y esta sección solo se pinta si hay filas registradas.
export function EventWeighInsSection({
  weighIns,
}: {
  weighIns: EventWeighIn[];
}) {
  if (weighIns.length === 0) {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <Scale className="size-4" />
        Pesaje oficial
      </h2>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                Luchador
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">
                Peso
              </th>
            </tr>
          </thead>
          <tbody>
            {weighIns.map((weighIn) => (
              <tr
                key={`${weighIn.fightId}-${weighIn.fighterId}`}
                className="border-b border-border/60 last:border-b-0"
              >
                <td className="px-4 py-2 sm:px-5">
                  <Link
                    href={`/fighters/${weighIn.fighterId}`}
                    className="flex min-w-0 items-center gap-2.5 transition-colors hover:text-primary"
                  >
                    <FighterHeadshot
                      name={weighIn.fighterName}
                      headshotUrl={weighIn.headshotUrl}
                      size="sm"
                      className="size-8 shrink-0"
                    />
                    <span className="truncate font-display text-sm font-bold uppercase tracking-tight">
                      {weighIn.fighterName}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2 text-right sm:px-5">
                  <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                    {weighIn.missedWeight ? (
                      // Badge rojo: no alcanzó el límite de su categoría.
                      <span
                        className="inline-flex shrink-0 items-center rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em] text-destructive"
                        title="No alcanzó el límite de peso de su categoría"
                      >
                        No dio el peso
                      </span>
                    ) : null}
                    <span className="tabular font-mono text-xs text-foreground">
                      {formatLbs(weighIn.weightLbs)}
                    </span>
                    <span className="tabular font-mono text-xs text-muted-foreground">
                      {formatKgFromLbs(weighIn.weightLbs)}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
