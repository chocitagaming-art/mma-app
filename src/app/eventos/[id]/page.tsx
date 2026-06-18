import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Ticket } from "lucide-react";

import { EventBoutRow } from "@/components/event-bout-row";
import { formatDate } from "@/lib/format";
import { getEventDetail } from "@/lib/queries/events";
import type { EventBout } from "@/lib/types";

type EventDetailPageProps = {
  params: Promise<{ id: string }>;
};

const CARD_SEGMENT_LABELS: Record<string, string> = {
  main: "Cartelera estelar",
  prelims: "Preliminares",
  early_prelims: "Preliminares iniciales",
};

const CARD_SEGMENT_ORDER = ["main", "prelims", "early_prelims"];

type BoutSection = {
  key: string;
  label: string;
  bouts: EventBout[];
};

// Agrupa los bouts por card_segment manteniendo el orden de aparición (ya vienen
// ordenados por bout_order). Si todos los segmentos son NULL → una sola "Cartelera".
function groupBoutsBySegment(bouts: EventBout[]): BoutSection[] {
  const hasSegments = bouts.some((bout) => bout.cardSegment != null);

  if (!hasSegments) {
    return bouts.length > 0
      ? [{ key: "cartelera", label: "Cartelera", bouts }]
      : [];
  }

  const groups = new Map<string, EventBout[]>();
  for (const bout of bouts) {
    const key = bout.cardSegment ?? "main";
    const group = groups.get(key);
    if (group) {
      group.push(bout);
    } else {
      groups.set(key, [bout]);
    }
  }

  const orderedKeys = [
    ...CARD_SEGMENT_ORDER.filter((key) => groups.has(key)),
    ...[...groups.keys()].filter((key) => !CARD_SEGMENT_ORDER.includes(key)),
  ];

  return orderedKeys.map((key) => ({
    key,
    label: CARD_SEGMENT_LABELS[key] ?? "Cartelera",
    bouts: groups.get(key) ?? [],
  }));
}

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventDetail(Number(id));
  return {
    title: event ? `${event.name} | MMA Stats` : "Evento | MMA Stats",
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;
  const event = await getEventDetail(Number(id));

  if (!event) {
    notFound();
  }

  const isUpcoming = event.status === "upcoming";
  const sections = groupBoutsBySegment(event.bouts);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        href={isUpcoming ? "/eventos?view=proximos" : "/eventos"}
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Eventos
      </Link>

      <div className="mt-4 flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-start">
        {isUpcoming && event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt={`Póster de ${event.name}`}
            loading="lazy"
            className="w-full shrink-0 rounded-lg border border-border object-cover sm:w-56"
          />
        ) : null}

        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {isUpcoming ? "Próximo evento" : "Cartelera"}
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl">
            {event.name}
          </h1>
          {event.tagline ? (
            <p className="mt-2 text-sm text-muted-foreground">{event.tagline}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {formatDate(event.eventDate)}
            </span>
            {event.location ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {event.location}
              </span>
            ) : null}
            <span className="tabular">{event.bouts.length} peleas</span>
          </div>

          {isUpcoming && event.ticketUrl ? (
            <a
              href={event.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Ticket className="size-3.5" />
              Entradas
            </a>
          ) : null}
        </div>
      </div>

      {sections.length > 0 ? (
        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.key}>
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {section.label}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {section.bouts.map((bout) => (
                  <EventBoutRow key={bout.fightId} bout={bout} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">
          {isUpcoming
            ? "Cartelera por confirmar."
            : "No hay peleas registradas para este evento."}
        </p>
      )}
    </div>
  );
}
