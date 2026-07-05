import Link from "next/link";
import { CalendarDays, MapPin, Tv } from "lucide-react";

import { CountryFlag } from "@/components/country-flag";
import { EventStartTime } from "@/components/event-start-time";
import { FighterFullBody } from "@/components/fighter/fighter-full-body";
import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { EventCountdown } from "@/components/home/event-countdown";
import { Button } from "@/components/ui/button";
import { formatDate, formatRecord, formatWeightClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NextEventHero, NextEventHeroFighter } from "@/lib/types";

// Badge de ranking actual (FE2): 0 = campeón ("C"), resto "#N", estilo ufc.com.
function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold leading-none text-primary"
      title={rank === 0 ? "Campeón de su división" : `Nº ${rank} del ranking de su división`}
    >
      {rank === 0 ? "C" : `#${rank}`}
    </span>
  );
}

// Columna de un protagonista: foto de cuerpo entero (standing → full body →
// headshot, como en combates), apodo, nombre + bandera, récord y ranking.
function HeroCorner({
  fighter,
  className,
}: {
  fighter: NextEventHeroFighter;
  className?: string;
}) {
  // Enlazable solo con ficha real (el rival puede estar por anunciar, TBD).
  const href = fighter.id != null ? `/fighters/${fighter.id}` : null;

  const photo = (
    <FighterFullBody
      name={fighter.name}
      fullBodyUrl={fighter.fullBodyUrl}
      standingBodyUrl={fighter.standingBodyUrl}
      headshotUrl={fighter.headshotUrl}
      preference="standing-first"
      // Alturas fijas anti-CLS, algo menores que el tale-of-the-tape del combate.
      className="h-[220px] w-full sm:h-[280px] lg:h-[400px]"
    />
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-1.5 text-center",
        className,
      )}
    >
      {href ? (
        <Link href={href} className="w-full transition-opacity hover:opacity-85">
          {photo}
        </Link>
      ) : (
        <div className="w-full">{photo}</div>
      )}
      {/* Siempre presente (aunque no haya apodo) para que ambas columnas
          queden alineadas, igual que en tale-of-the-tape.tsx. */}
      <p className="min-h-4 font-mono text-xs italic leading-tight text-muted-foreground">
        {fighter.nickname ? <>“{fighter.nickname}”</> : null}
      </p>
      {href ? (
        <Link
          href={href}
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-display text-xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground transition-colors hover:text-primary sm:text-2xl lg:text-3xl"
        >
          <CountryFlag nationality={fighter.nationality} />
          <span className="break-words">{fighter.name}</span>
          <RankBadge rank={fighter.rank} />
        </Link>
      ) : (
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-display text-xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground sm:text-2xl lg:text-3xl">
          <span className="break-words">{fighter.name}</span>
        </p>
      )}
      <p className="tabular font-mono text-sm text-muted-foreground">
        {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
      </p>
    </div>
  );
}

// Octágono "VS" central, guiño al octágono de la UFC. Dos capas con el mismo
// clip-path: la exterior hace de borde y la interior de fondo.
const OCTAGON_CLIP =
  "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";

function VsOctagon() {
  return (
    <div className="relative size-14 drop-shadow-[0_0_16px_color-mix(in_oklch,var(--primary)_35%,transparent)] sm:size-16">
      <div
        className="absolute inset-0 bg-primary/70"
        style={{ clipPath: OCTAGON_CLIP }}
      />
      <div
        className="absolute inset-[3px] flex items-center justify-center bg-card"
        style={{ clipPath: OCTAGON_CLIP }}
      >
        <span className="font-display text-base font-extrabold uppercase tracking-tight text-foreground sm:text-lg">
          VS
        </span>
      </div>
    </div>
  );
}

// Módulo "Up Next" de la home (FE1): tarjeta ancha premium con el próximo
// evento, sus dos protagonistas cara a cara y la cuenta atrás. Server
// component; solo la cuenta atrás es client (EventCountdown).
export function UpNextHero({ event }: { event: NextEventHero }) {
  const main = event.mainEvent;

  const centerInfo = (
    <div className="flex min-w-0 flex-col items-center gap-4 text-center">
      <p className="flex items-center gap-2.5 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
        <span className="live-dot inline-block size-2 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
        PRÓXIMO EVENTO
      </p>
      <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.9] tracking-tight text-foreground sm:text-5xl">
        {event.name}
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {formatDate(event.eventDate)}
        </span>
        {/* Hora local del visitante (FE5a): client component, fallback UTC en SSR. */}
        <EventStartTime startTime={event.startTime} />
        {event.location ? (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {event.location}
          </span>
        ) : null}
        {/* La emisión es una heurística del scraper, no dato oficial (ver /eventos/[id]). */}
        {event.broadcast ? (
          <span className="flex items-center gap-1.5">
            <Tv className="size-3.5" />
            {event.broadcast}
            <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              estimada
            </span>
          </span>
        ) : null}
      </div>

      {main ? (
        <>
          <VsOctagon />
          <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Combate estelar
            {main.weightClass ? ` · ${formatWeightClass(main.weightClass)}` : ""}
          </p>
        </>
      ) : null}

      <EventCountdown startTime={event.startTime} eventDate={event.eventDate} />

      <Link href={`/eventos/${event.id}`}>
        <Button size="lg" className="h-10">
          Ver cartelera →
        </Button>
      </Link>
    </div>
  );

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div
          className={cn(
            PREMIUM_TILE,
            "relative overflow-hidden p-5 sm:p-8 lg:p-10",
          )}
        >
          {/* Glow de marca sutil desde arriba, como el hero de la ficha. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background:radial-gradient(70%_55%_at_50%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_72%)]"
          />
          {main ? (
            <div className="relative grid grid-cols-2 items-end gap-x-3 gap-y-8 md:grid-cols-[minmax(0,1fr)_minmax(280px,400px)_minmax(0,1fr)] md:gap-x-6 lg:gap-x-8">
              {/* En móvil el bloque central va ARRIBA (order) y los dos
                  luchadores quedan cara a cara debajo; en md+ es la columna
                  central del cara a cara, como en tale-of-the-tape. */}
              <HeroCorner fighter={main.red} className="order-2 md:order-none" />
              <div className="order-1 col-span-2 self-center md:order-none md:col-span-1">
                {centerInfo}
              </div>
              <HeroCorner fighter={main.blue} className="order-3 md:order-none" />
            </div>
          ) : (
            <div className="relative mx-auto max-w-2xl">{centerInfo}</div>
          )}
        </div>
      </div>
    </section>
  );
}
