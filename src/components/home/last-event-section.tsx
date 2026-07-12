import Link from "next/link";

import { EventBoutRow } from "@/components/event-bout-row";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/lib/format";
import type { LastEventResults } from "@/lib/types";

// Sección "Acaba de pasar" de la home (FE10): último evento completado con los
// resultados de su cartelera estelar, reutilizando EventBoutRow como en
// /eventos/[id]. showRanks=false: en resultados el ranking ACTUAL mentiría.
export function LastEventSection({ event }: { event: LastEventResults }) {
  const relative = formatRelativeDate(event.eventDate);
  const description = [
    relative ? `Celebrado ${relative}` : null,
    event.location,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mx-auto max-w-7xl space-y-7 px-4 pt-12 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="ÚLTIMO EVENTO"
        title={event.name}
        description={
          description
            ? `${description}. Resultados de la cartelera estelar.`
            : "Resultados de la cartelera estelar."
        }
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {event.bouts.map((bout) => (
          <EventBoutRow
            key={bout.fightId}
            bout={bout}
            showRanks={false}
            eventDate={event.eventDate}
          />
        ))}
      </div>

      {/* "Resultados completos" como botón DEBAJO del recuadro (estética UFC),
          en todos los tamaños (antes solo en la cabecera desktop). */}
      <div className="flex justify-center">
        <Link href={`/eventos/${event.id}`} className="w-full sm:w-auto">
          <Button size="lg" className="h-10 w-full px-6 sm:w-auto">
            Ver resultados completos →
          </Button>
        </Link>
      </div>
    </section>
  );
}
