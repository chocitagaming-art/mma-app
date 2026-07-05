import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Ticket, Tv } from "lucide-react";

import { EventBoutRow } from "@/components/event-bout-row";
import { EventScheduleLine, EventSectionTime } from "@/components/event-schedule";
import { EventStartTime } from "@/components/event-start-time";
import { EventWeighInsSection } from "@/components/event-weigh-ins";
import { eventExternalLink } from "@/lib/external-links";
import { formatDate } from "@/lib/format";
import { getEventDetail, getEventWeighIns } from "@/lib/queries/events";
import { parseId } from "@/lib/route-params";
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
  const eventId = parseId(id);
  const event = eventId != null ? await getEventDetail(eventId) : null;
  return {
    title: event ? `${event.name}` : "Evento",
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;
  const eventId = parseId(id);

  if (eventId == null) {
    notFound();
  }

  const event = await getEventDetail(eventId);

  if (!event) {
    notFound();
  }

  // "Pasado" se decide por FECHA (igual que la lista de Pasados), no solo por status:
  // un evento puede seguir en status 'upcoming' uno o dos días tras celebrarse, hasta
  // que el scraper lo complete. Si su fecha ya pasó, mostramos la cartelera con resultados.
  const todayIso = new Date().toISOString().slice(0, 10);
  const isUpcoming =
    event.status === "upcoming" &&
    (event.eventDate == null || event.eventDate >= todayIso);
  const sections = groupBoutsBySegment(event.bouts);
  // FE9: enlace a la página oficial del evento (solo source='ufc.com').
  const officialUrl = eventExternalLink(event);

  // FE5b: hora de inicio de cada segmento para su encabezado de sección.
  const sectionTimes: Record<string, string | null> = {
    main: event.startTime,
    prelims: event.prelimsTime,
    early_prelims: event.earlyPrelimsTime,
  };

  // BE2: el pesaje solo existe en la semana del evento (se celebra la víspera)
  // o cuando ya pasó; en eventos lejanos ahorramos la query. La sección se
  // pinta únicamente si hay filas registradas. Comparación de strings ISO,
  // igual que isUpcoming/todayIso.
  const weekAhead = new Date();
  weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);
  const weekAheadIso = weekAhead.toISOString().slice(0, 10);
  const isEventWeek =
    event.eventDate != null && event.eventDate.slice(0, 10) <= weekAheadIso;
  const weighIns =
    !isUpcoming || isEventWeek ? await getEventWeighIns(event.id) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        href={isUpcoming ? "/eventos?view=proximos" : "/eventos"}
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Eventos
      </Link>

      <div className="mt-4 flex flex-col gap-6 border-b border-border pb-6">
        {event.imageUrl ? (
          // Póster hero (Fase 5): grande y centrado, también en eventos pasados.
          // aspect-[16/9] + width/height explícitos reservan el alto antes de que
          // cargue la imagen remota (anti-CLS); eager + fetchPriority alta porque
          // es el elemento above-the-fold más pesado de la página (LCP).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt={`Póster de ${event.name}`}
            width={1280}
            height={720}
            loading="eager"
            fetchPriority="high"
            className="mx-auto aspect-[16/9] w-full max-w-3xl rounded-lg border border-border object-cover"
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
            {/* Hora local del main card (FE5a): componente client porque la zona
                horaria del visitante no existe en SSR (fallback UTC al hidratar). */}
            <EventStartTime startTime={event.startTime} />
            {event.location ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {event.location}
              </span>
            ) : null}
            {event.bouts.length > 0 ? (
              <span className="tabular">{event.bouts.length} peleas</span>
            ) : null}
            {/* El broadcast NO viene de ufc.com: lo deduce el scraper de mma-ingesta
                por heurística (numerado → PPV, resto → ESPN+ / Fight Pass). Lo
                etiquetamos como ESTIMACIÓN para no presentarlo como dato oficial. */}
            {event.broadcast ? (
              <span className="flex items-center gap-1.5">
                <Tv className="size-3.5" />
                <span>Emisión: {event.broadcast}</span>
                <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  estimada
                </span>
              </span>
            ) : null}
            {officialUrl ? (
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors hover:text-primary"
              >
                <ExternalLink className="size-3.5" />
                Ver en UFC.com
              </a>
            ) : null}
          </div>

          {/* FE5b: línea de horarios por tramo (hora local del visitante).
              El propio componente se omite si no hay early/prelims. */}
          <EventScheduleLine
            earlyPrelimsTime={event.earlyPrelimsTime}
            prelimsTime={event.prelimsTime}
            startTime={event.startTime}
          />

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
              <h2 className="mb-3 flex items-baseline gap-2.5 font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {section.label}
                {/* FE5b: hora local del tramo, si el evento la tiene. */}
                <EventSectionTime time={sectionTimes[section.key] ?? null} />
              </h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {section.bouts.map((bout) => (
                  <EventBoutRow
                    key={bout.fightId}
                    bout={bout}
                    showRanks={isUpcoming}
                    eventDate={event.eventDate}
                  />
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

      {/* BE7: peleas canceladas de un evento FUTURO, colapsadas al final. En
          pasados no se pintan: la cartelera cuenta la historia de lo celebrado. */}
      {isUpcoming && event.cancelledBouts.length > 0 ? (
        <details className="group mt-8">
          {/* [&::-webkit-details-marker]:hidden — Safari <=18.3 ignora
              list-none en summary y pintaría un marcador doble. */}
          <summary className="cursor-pointer list-none font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            Peleas canceladas ({event.cancelledBouts.length})
          </summary>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card opacity-70">
            {event.cancelledBouts.map((bout) => (
              <EventBoutRow
                key={bout.fightId}
                bout={bout}
                eventDate={event.eventDate}
              />
            ))}
          </div>
        </details>
      ) : null}

      {/* BE2: pesaje oficial (solo pinta si hay filas). */}
      <EventWeighInsSection weighIns={weighIns} />
    </div>
  );
}
