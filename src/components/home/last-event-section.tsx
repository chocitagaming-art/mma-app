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
      <div className="flex items-end justify-between gap-6">
        <SectionHeading
          eyebrow="ÚLTIMO EVENTO"
          title={event.name}
          description={
            description
              ? `${description}. Resultados de la cartelera estelar.`
              : "Resultados de la cartelera estelar."
          }
        />
        <Link
          href={`/eventos/${event.id}`}
          className="hidden shrink-0 sm:inline-flex"
        >
          <Button variant="ghost" size="lg" className="h-10">
            Resultados completos →
          </Button>
        </Link>
      </div>

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

      {/* CTA visible en móvil (el botón de la cabecera se oculta en <sm). */}
      <div className="sm:hidden">
        <Link href={`/eventos/${event.id}`}>
          <Button variant="outline" className="w-full">
            Resultados completos →
          </Button>
        </Link>
      </div>
    </section>
  );
}
