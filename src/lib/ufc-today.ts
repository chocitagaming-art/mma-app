import { parseEventTimestamp } from "@/lib/event-time";
import { firstSegmentStart, resolveLivePhase, type LiveEventTimes } from "@/lib/live-event";

// FASE 7 — la lógica de "¿hay UFC hoy?".
//
// REGLA DURA: el día lo decide SIEMPRE el reloj de la península, nunca el del
// proceso. Vercel corre en UTC y el portátil en Europe/Madrid, así que un
// `now.toISOString().slice(0, 10)` respondería con el día de ayer entre
// medianoche y las 02:00 españolas — justo la franja en la que hay UFC. Todo lo
// de aquí deriva la fecha con Intl y `timeZone` fijo, y por eso los tests dan
// exactamente lo mismo bajo TZ=UTC (el CI) y bajo TZ=Europe/Madrid (el megatest).
const MADRID = "Europe/Madrid";

// Una velada que empieza a las 02:00 del domingo es "la del sábado por la
// noche": así se anuncia, así se habla y así se busca. Por debajo de esta hora,
// el instante pertenece al día natural anterior. Caso real: el evento 1087
// (event_date 2026-08-08) arranca el domingo 9 a las 02:00 hora de Madrid; sin
// esta regla la página diría NO el sábado por la tarde, que es cuando preguntan.
const HORA_CORTE_MADRUGADA = 6;

// hourCycle "h23" y no `hour12: false`: con hour12 algunos motores devuelven
// "24" para la medianoche, y 24 nunca es menor que HORA_CORTE_MADRUGADA.
const PARTES_MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: MADRID,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type PartesMadrid = { year: number; month: number; day: number; hour: number; minute: number };

function partesMadrid(date: Date): PartesMadrid {
  const partes = PARTES_MADRID.formatToParts(date);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number => {
    const parte = partes.find((p) => p.type === tipo);
    return parte ? Number(parte.value) : 0;
  };
  return {
    year: valor("year"),
    month: valor("month"),
    day: valor("day"),
    hour: valor("hour"),
    minute: valor("minute"),
  };
}

// Clave "YYYY-MM-DD" de un día civil, con desplazamiento opcional en días. La
// aritmética va sobre Date.UTC a propósito: son fechas civiles ya extraídas en
// Madrid, así que sumar 86.400.000 ms nunca tropieza con el cambio de hora.
function claveDiaCivil(year: number, month: number, day: number, desplazamiento = 0): string {
  return new Date(Date.UTC(year, month - 1, day) + desplazamiento * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

// El día al que "pertenece" un instante para un espectador español.
export function claveDiaLogico(date: Date): string {
  const p = partesMadrid(date);
  return claveDiaCivil(p.year, p.month, p.day, p.hour < HORA_CORTE_MADRUGADA ? -1 : 0);
}

function diasEntreClaves(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

export type UfcTodayVerdict =
  | "en-directo" // está ocurriendo ahora mismo
  | "hoy" // hoy, a una hora normal
  | "esta-madrugada" // hoy para la gente, de madrugada para el calendario
  | "no"; // hoy no

export type UfcTodayEvent = LiveEventTimes & {
  mainEventFinished?: boolean;
};

export type UfcTodayResult = {
  verdict: UfcTodayVerdict;
  // Instante del primer tramo (early prelims → prelims → estelar).
  start: Date | null;
  // Días naturales de Madrid hasta la velada. 0 = es hoy. null = sin fecha.
  daysUntil: number | null;
  // El estelar ya cayó: la respuesta sigue siendo "sí", pero en pasado.
  finished: boolean;
};

const SIN_EVENTO: UfcTodayResult = {
  verdict: "no",
  start: null,
  daysUntil: null,
  finished: false,
};

// `now` se inyecta SIEMPRE (nunca se lee el reloj aquí dentro): es lo que hace
// esta función testeable sin congelar el tiempo y sin depender del huso.
export function resolveUfcToday(event: UfcTodayEvent | null, now: Date): UfcTodayResult {
  if (!event) {
    return SIN_EVENTO;
  }

  const finished = event.mainEventFinished === true;
  const start = firstSegmentStart(event);

  // Evento sin ningún horario (histórico o aún sin enriquecer por el scraper):
  // lo único que hay es la fecha civil, y se compara tal cual.
  if (!start) {
    if (!event.eventDate) {
      return SIN_EVENTO;
    }
    const claveEvento = event.eventDate.slice(0, 10);
    const dias = diasEntreClaves(claveDiaLogico(now), claveEvento);
    return {
      verdict: dias === 0 ? "hoy" : "no",
      start: null,
      daysUntil: dias,
      finished,
    };
  }

  const claveHoy = claveDiaLogico(now);
  const claveEvento = claveDiaLogico(start);
  const dias = diasEntreClaves(claveHoy, claveEvento);

  // "En directo" manda sobre todo lo demás, y se delega en la misma máquina de
  // estados que usa /en-vivo para no tener dos verdades sobre lo mismo.
  if (!finished && resolveLivePhase(event, now) === "live" && now >= start) {
    return { verdict: "en-directo", start, daysUntil: dias, finished };
  }

  if (dias !== 0) {
    return { verdict: "no", start, daysUntil: dias, finished };
  }

  const empiezaDeMadrugada = partesMadrid(start).hour < HORA_CORTE_MADRUGADA;
  return {
    verdict: empiezaDeMadrugada ? "esta-madrugada" : "hoy",
    start,
    daysUntil: 0,
    finished,
  };
}

// ── Formateo peninsular ───────────────────────────────────────────────────────
// Con la zona FIJA se puede formatear en el servidor. Los componentes que ya
// existen (EventStartTime, EventScheduleLine) pintan UTC en SSR y la zona del
// visitante tras montar, lo que aquí sería doblemente malo: Google indexaría la
// hora equivocada y el usuario vería el número cambiar al hidratar. En una
// página cuyo tema ES la hora, eso no vale.

const HORA_MADRID = new Intl.DateTimeFormat("es-ES", {
  timeZone: MADRID,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const FECHA_MADRID = new Intl.DateTimeFormat("es-ES", {
  timeZone: MADRID,
  weekday: "long",
  day: "numeric",
  month: "long",
});

// "16:00" — hora peninsular de un timestamptz de Postgres.
export function formatMadridTime(value: string | null): string | null {
  const date = parseEventTimestamp(value);
  return date ? HORA_MADRID.format(date) : null;
}

// "sábado, 1 de agosto" — fecha peninsular de un timestamptz de Postgres.
export function formatMadridDate(value: string | null): string | null {
  const date = parseEventTimestamp(value);
  return date ? FECHA_MADRID.format(date) : null;
}

// Igual que formatMadridDate pero desde un Date ya resuelto (el primer tramo).
export function formatMadridDateFromDate(date: Date): string {
  return FECHA_MADRID.format(date);
}
