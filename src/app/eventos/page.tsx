import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MapPin, Tv, Ticket } from "lucide-react";

import { PaginationControls } from "@/components/pagination-controls";
import { SectionHeading } from "@/components/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { getPastEvents, getUpcomingEvents } from "@/lib/queries/events";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Eventos | MMA Stats",
  description: "Cartelera de eventos UFC: próximos y resultados de eventos pasados.",
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type EventosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS = [
  { key: "proximos", label: "Próximos", href: "/eventos" },
  { key: "pasados", label: "Pasados", href: "/eventos?view=pasados" },
] as const;

export default async function EventosPage({ searchParams }: EventosPageProps) {
  const params = await searchParams;
  // Default to upcoming events; past events require an explicit ?view=pasados.
  const view = getSingleValue(params.view) === "pasados" ? "pasados" : "proximos";
  const page = Number(getSingleValue(params.page) || "1");

  const result = view === "pasados" ? await getPastEvents(page) : null;
  const upcoming = view === "proximos" ? await getUpcomingEvents() : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <SectionHeading
        eyebrow="Cartelera UFC"
        title="Eventos"
        description="Próximos eventos y resultados de los eventos ya celebrados."
      />

      <div className="mt-6 flex items-center gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = view === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-wide transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {view === "proximos" ? (
        upcoming && upcoming.length > 0 ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((event) => (
              <div
                key={event.id}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-foreground/5"
              >
                {event.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.imageUrl}
                    alt={`Póster de ${event.name}`}
                    loading="lazy"
                    className="aspect-[16/9] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center bg-muted">
                    <CalendarDays className="size-8 text-muted-foreground" />
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="space-y-1">
                    <Link
                      href={`/eventos/${event.id}`}
                      className="font-display text-lg font-bold uppercase leading-tight tracking-tight text-foreground transition-colors after:absolute after:inset-0 group-hover:text-primary"
                    >
                      {event.name}
                    </Link>
                    {event.headliner ? (
                      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        {event.headliner}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-auto space-y-1 font-mono text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 shrink-0" />
                      {formatDate(event.eventDate)}
                    </p>
                    {event.location ? (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </p>
                    ) : null}
                    {event.broadcast ? (
                      <p className="flex items-center gap-1.5">
                        <Tv className="size-3.5 shrink-0" />
                        <span className="truncate">{event.broadcast}</span>
                      </p>
                    ) : null}
                    <p className="tabular">
                      {event.fightCount === 0
                        ? "Cartelera por confirmar"
                        : `${event.fightCount} peleas`}
                    </p>
                  </div>

                  {event.ticketUrl ? (
                    <a
                      href={event.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 inline-flex w-fit items-center gap-1 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary transition-colors hover:text-foreground"
                    >
                      <Ticket className="size-3.5" />
                      Entradas →
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="mt-8 border-dashed border-border bg-card">
            <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="font-display text-2xl font-bold uppercase tracking-tight text-foreground">
                Próximos eventos en camino
              </p>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Aún no hay próximos eventos en la cartelera. Mientras tanto, explora los
                resultados en la pestaña “Pasados”.
              </p>
            </CardContent>
          </Card>
        )
      ) : result ? (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            <span className="tabular font-semibold text-foreground">
              {result.total.toLocaleString("es")}
            </span>{" "}
            eventos celebrados
          </p>

          {result.events.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {result.events.map((event) => (
                <Link
                  key={event.id}
                  href={`/eventos/${event.id}`}
                  className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-foreground/5"
                >
                  <p className="font-display text-lg font-bold uppercase leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
                    {event.name}
                  </p>
                  <div className="mt-auto space-y-1 font-mono text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 shrink-0" />
                      {formatDate(event.eventDate)}
                    </p>
                    {event.location ? (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </p>
                    ) : null}
                    <p className="tabular">{event.fightCount} peleas</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-8 text-sm text-muted-foreground">No hay eventos para mostrar.</p>
          )}

          <div className="mt-8">
            <PaginationControls
              page={result.page}
              totalPages={result.totalPages}
              createHref={(target) =>
                target > 1 ? `/eventos?view=pasados&page=${target}` : "/eventos?view=pasados"
              }
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
