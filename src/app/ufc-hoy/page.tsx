import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";

import { EventBoutRow } from "@/components/event-bout-row";
import { EventWatchOptions } from "@/components/event-watch-options";
import { groupBoutsBySegment } from "@/lib/event-sections";
import { getEventDetail } from "@/lib/queries/events";
import { getLiveEventCandidate } from "@/lib/queries/live";
import {
  claveDiaLogico,
  formatMadridDate,
  formatMadridTime,
  resolveUfcToday,
} from "@/lib/ufc-today";

// FASE 7. La pregunta se repite cada semana en el buscador y hoy no la responde
// nadie en español con la hora peninsular delante.
//
// El título es FIJO a propósito, aunque el contenido cambie: el snippet de
// Google es el de su última pasada, así que un <title> dinámico enseñaría "No,
// hoy no hay UFC" seis días de cada siete — justo lo contrario de lo que
// buscamos que lea quien tiene dudas.
export const metadata: Metadata = {
  title: "¿Hay UFC hoy?",
  description:
    "Si hay UFC hoy, a qué hora empieza en España y dónde verlo. Cartelera completa, horarios peninsulares y cuenta atrás para la próxima velada.",
  alternates: { canonical: "/ufc-hoy" },
};

// La CONSULTA se cachea; el VEREDICTO no. Es la separación que importa: los
// datos de la velada cambian como mucho cada pocas horas, pero la respuesta
// depende del minuto exacto, así que se recalcula en cada render (la página ya
// es dinámica por el nonce de la CSP: no cuesta nada).
//
// La clave lleva el día lógico de Madrid dentro. Sin eso, la respuesta
// calculada a las 23:50 seguiría sirviéndose después del cambio de día y la
// página diría "hoy hay UFC" un día de más.
const cargarVelada = unstable_cache(
  async (claveDia: string) => {
    const candidato = await getLiveEventCandidate();
    if (!candidato) {
      return { claveDia, candidato: null, detalle: null };
    }
    return { claveDia, candidato, detalle: await getEventDetail(candidato.id) };
  },
  ["ufc-hoy-velada"],
  // Mismo tag que la home: cuando la ingesta revalida tras tocar eventos, esta
  // página se entera a la vez.
  { revalidate: 300, tags: ["home"] },
);

// Nunca notFound(): en esta versión de Next devuelve HTTP 200, así que Google
// indexaría una página de error como si fuera contenido. "Hoy no hay UFC" es
// una respuesta legítima y se sirve como tal.
export default async function UfcHoyPage() {
  const ahora = new Date();
  const { candidato, detalle } = await cargarVelada(claveDiaLogico(ahora));
  const resultado = resolveUfcToday(candidato, ahora);

  const hayUfc = resultado.verdict !== "no";
  const secciones = detalle ? groupBoutsBySegment(detalle.bouts) : [];

  const horaPrimerTramo =
    formatMadridTime(candidato?.earlyPrelimsTime ?? null) ??
    formatMadridTime(candidato?.prelimsTime ?? null) ??
    formatMadridTime(candidato?.startTime ?? null);
  const horaEstelar = formatMadridTime(candidato?.startTime ?? null);
  const fechaVelada = formatMadridDate(
    candidato?.earlyPrelimsTime ?? candidato?.prelimsTime ?? candidato?.startTime ?? null,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <h1 className="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">
        ¿Hay UFC hoy?
      </h1>
      <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Horarios de España (península)
      </p>

      {/* El veredicto, que es a lo que se viene. */}
      <div
        className={`mt-6 rounded-xl border p-6 sm:p-8 ${
          hayUfc ? "border-primary/40 bg-primary/5" : "border-border bg-card"
        }`}
      >
        <p
          className={`font-display text-5xl font-bold uppercase leading-none sm:text-7xl ${
            hayUfc ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {hayUfc ? "Sí" : "No"}
        </p>

        <p className="mt-3 text-lg font-semibold sm:text-xl">
          {resultado.verdict === "en-directo"
            ? "Hay UFC ahora mismo, en directo."
            : null}
          {resultado.verdict === "hoy" && !resultado.finished
            ? "Hoy hay UFC."
            : null}
          {resultado.verdict === "hoy" && resultado.finished
            ? "Hoy ha habido UFC. La velada ya ha terminado."
            : null}
          {resultado.verdict === "esta-madrugada"
            ? `Esta madrugada hay UFC${horaPrimerTramo ? `, a las ${horaPrimerTramo}` : ""}.`
            : null}
          {resultado.verdict === "no" ? "Hoy no hay UFC." : null}
        </p>

        {candidato ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {hayUfc ? (
              <>
                <span className="font-medium text-foreground">{candidato.name}</span>
                {candidato.location ? ` · ${candidato.location}` : null}
              </>
            ) : (
              <>
                La próxima velada es{" "}
                <span className="font-medium text-foreground">{candidato.name}</span>
                {fechaVelada ? `, el ${fechaVelada}` : null}
                {resultado.daysUntil != null && resultado.daysUntil > 0
                  ? ` — dentro de ${resultado.daysUntil} ${
                      resultado.daysUntil === 1 ? "día" : "días"
                    }`
                  : null}
                .
              </>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Ahora mismo no hay ninguna velada anunciada en el calendario.
          </p>
        )}

        {/* Horas de cada tramo, ya en hora peninsular. Se formatean en el
            SERVIDOR: la zona es fija, así que no hace falta el baile de
            hidratación de EventStartTime (que pinta UTC en SSR y la zona del
            visitante al montar) y Google indexa la hora correcta. */}
        {candidato ? (
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-border/60 pt-5">
            {candidato.earlyPrelimsTime ? (
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Preliminares iniciales
                </dt>
                <dd className="font-display text-xl font-bold">
                  {formatMadridTime(candidato.earlyPrelimsTime)}
                </dd>
              </div>
            ) : null}
            {candidato.prelimsTime ? (
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Preliminares
                </dt>
                <dd className="font-display text-xl font-bold">
                  {formatMadridTime(candidato.prelimsTime)}
                </dd>
              </div>
            ) : null}
            {horaEstelar ? (
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Cartelera estelar
                </dt>
                <dd className="font-display text-xl font-bold">{horaEstelar}</dd>
              </div>
            ) : null}
            {!hayUfc && fechaVelada ? (
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Día
                </dt>
                {/* first-letter y no `capitalize`: este pone mayúscula en CADA
                    palabra y deja "1 De Agosto". */}
                <dd className="font-display text-xl font-bold first-letter:uppercase">
                  {fechaVelada}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {resultado.verdict === "en-directo" ? (
            <Link
              href="/en-vivo"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground transition-opacity hover:opacity-90"
            >
              <span className="live-dot inline-block size-1.5 rounded-full bg-primary-foreground" />
              Seguirlo en directo
            </Link>
          ) : null}
          {candidato && resultado.verdict !== "en-directo" ? (
            <Link
              href={`/eventos/${candidato.id}`}
              className="inline-flex items-center rounded-md border border-border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-accent"
            >
              Ver la velada
            </Link>
          ) : null}
          {/* Dónde verlo en España. Config estática (S2-F): en España los
              derechos no cambian por evento. */}
          {candidato ? (
            <EventWatchOptions hasEarlyPrelims={Boolean(candidato.earlyPrelimsTime)} />
          ) : null}
        </div>
      </div>

      {secciones.length > 0 ? (
        <div className="mt-10 space-y-8">
          <h2 className="font-display text-xl font-bold uppercase tracking-tight">
            {hayUfc ? "La cartelera" : "Cartelera de la próxima velada"}
          </h2>
          {secciones.map((seccion) => (
            <section key={seccion.key}>
              <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {seccion.label}
              </h3>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {seccion.bouts.map((bout) => (
                  <EventBoutRow
                    key={bout.fightId}
                    bout={bout}
                    showRanks
                    eventDate={detalle?.eventDate ?? null}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
