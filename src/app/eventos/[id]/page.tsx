import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";

import { EventBoutRow } from "@/components/event-bout-row";
import { formatDate } from "@/lib/format";
import { getEventDetail } from "@/lib/queries/events";

type EventDetailPageProps = {
  params: Promise<{ id: string }>;
};

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        href="/eventos"
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Eventos
      </Link>

      <div className="mt-4 border-b border-border pb-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Cartelera
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl">
          {event.name}
        </h1>
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
      </div>

      {event.bouts.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          {event.bouts.map((bout) => (
            <EventBoutRow key={bout.fightId} bout={bout} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">
          No hay peleas registradas para este evento.
        </p>
      )}
    </div>
  );
}
