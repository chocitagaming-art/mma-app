// Timeline del directo (migración 024 de mma-ingesta): la "película" del
// combate a partir de las muestras append-only de live_fight_stat_samples.
// El bucle del directo guarda una foto ACUMULADA por pasada (~20 s en eventos
// nuevos; ~2 min en el backfill de UFC 329) y aquí se convierte en series
// dibujables: golpes significativos conectados de cada esquina a lo largo del
// tiempo de combate, con los KD/derribos detectados por INCREMENTOS entre
// muestras consecutivas.
//
// Semántica del reloj de ESPN (verificada con la serie real de la pelea
// 12847, UFC 329): durante el asalto display_clock CUENTA ATRÁS desde 5:00;
// en los descansos es "-" (el corte es el fin del asalto); y en 'post' pasa a
// ser el tiempo TRANSCURRIDO oficial del último asalto (el "2:47" del KO de
// Garbrandt coincide con el end_time de ufcstats; decisiones = "5:00").

import { mapLiveStatsByFighter, type LiveStatValues } from "@/lib/live-stats";

export const ROUND_SECONDS = 300;

// Techo defensivo de asaltos: MMA no pasa de 5; el margen cubre formatos
// raros sin dejar que una fila corrupta (period gigante) infle rounds/
// totalSeconds y reviente el render con millones de nodos SVG.
export const MAX_PERIOD = 12;

export type FightTimelineSample = {
  state: "in" | "post";
  statusName: string | null;
  period: number;
  displayClock: string | null;
  byFighter: Record<string, LiveStatValues>;
  sampledAt: string;
};

// Fila cruda de live_fight_stat_samples -> muestra saneada; null si no es
// usable (mismo trato defensivo que mapLiveFightStatsRow: un dato corrupto
// degrada a "sin muestra", jamás rompe la página).
export function mapFightTimelineSample(row: {
  state: unknown;
  status_name: unknown;
  period: unknown;
  display_clock: unknown;
  stats: unknown;
  sampled_at: unknown;
}): FightTimelineSample | null {
  const state = row.state === "post" ? "post" : row.state === "in" ? "in" : null;
  const period =
    typeof row.period === "number" && Number.isFinite(row.period)
      ? Math.round(row.period)
      : null;
  if (!state || period == null || period < 1 || period > MAX_PERIOD) {
    return null;
  }
  const byFighter = mapLiveStatsByFighter(row.stats);
  if (Object.keys(byFighter).length === 0) {
    return null;
  }
  return {
    state,
    statusName: typeof row.status_name === "string" ? row.status_name : null,
    period,
    displayClock:
      typeof row.display_clock === "string" && row.display_clock.trim()
        ? row.display_clock
        : null,
    byFighter,
    sampledAt: typeof row.sampled_at === "string" ? row.sampled_at : "",
  };
}

// "3:41" -> 221 segundos; null si no parece un reloj de asalto.
function parseClock(clock: string | null): number | null {
  if (!clock) {
    return null;
  }
  const match = /^(\d+):(\d\d)$/.exec(clock.trim());
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= 0 && seconds <= ROUND_SECONDS ? seconds : null;
}

// Segundo de combate de una muestra (eje X), o null si la muestra no aporta
// información temporal propia (el llamador arrastra el tiempo previo). Ver la
// cabecera: el reloj cambia de significado según el estado. Patrones
// verificados con capturas reales de UFC 329:
//   - KO Garbrandt-Yanez (12845): un final a mitad de asalto pasa por
//     "STATUS_END_OF_ROUND" con el reloj CONGELADO en cuenta atrás, y luego
//     ESPN emite una 'post' TRANSICIONAL que aún lleva la cuenta atrás
//     congelada ("2:13") antes de la oficial con tiempo transcurrido
//     ("2:47"; 2:13 + 2:47 = 5:00 exacto).
//   - Steveson-Ellison (comp 401868927): "STATUS_END_OF_FIGHT" llega con
//     state 'in' y el MISMO reloj congelado en cuenta atrás del
//     END_OF_ROUND previo — se lee como una muestra en curso más.
// Como una 'post' suelta es ambigua (¿cuenta atrás congelada o tiempo
// oficial?), se calculan ambas lecturas y gana la MÁS CERCANA al tiempo
// previo de la serie (prevSeconds): el final real está siempre pegado a la
// última muestra en vivo, y así ni un final temprano salta 4 min hacia
// delante ni el clamp se come el tiempo oficial.
export function sampleElapsedSeconds(
  sample: FightTimelineSample,
  prevSeconds: number | null = null,
): number | null {
  const base = (sample.period - 1) * ROUND_SECONDS;
  const clock = parseClock(sample.displayClock);
  if (sample.state === "post") {
    // Sin reloj no hay dato nuevo: tras el final la pelea no avanza.
    if (clock == null) {
      return null;
    }
    const asOfficial = base + clock;
    const asFrozenCountdown = base + (ROUND_SECONDS - clock);
    if (prevSeconds == null) {
      return asOfficial;
    }
    return Math.abs(asOfficial - prevSeconds) <=
      Math.abs(asFrozenCountdown - prevSeconds)
      ? asOfficial
      : asFrozenCountdown;
  }
  if (sample.statusName === "STATUS_END_OF_ROUND") {
    // Descanso normal (reloj "-"): el corte es el fin del asalto. Con reloj
    // congelado (KO a mitad de asalto) se lee como una muestra en curso más.
    return clock != null
      ? base + (ROUND_SECONDS - clock)
      : sample.period * ROUND_SECONDS;
  }
  // En curso (incluye STATUS_END_OF_FIGHT con state 'in'): cuenta atrás.
  return clock != null ? base + (ROUND_SECONDS - clock) : null;
}

// Asalto COHERENTE con un segundo de combate ya aplanado: una muestra rancia
// clampeada no puede etiquetarse con su period crudo (saldría "R1 · 8:00").
// El corte exacto (300, 600...) pertenece al asalto que termina.
export function periodForSeconds(seconds: number): number {
  return Math.min(MAX_PERIOD, Math.max(1, Math.ceil(seconds / ROUND_SECONDS)));
}

// "R2 · 2:41" (tiempo TRANSCURRIDO del asalto, convención de los resultados).
export function timelinePointLabel(seconds: number, period: number): string {
  const into = Math.max(0, seconds - (period - 1) * ROUND_SECONDS);
  const minutes = Math.floor(into / 60);
  const rest = String(into % 60).padStart(2, "0");
  return `R${period} · ${minutes}:${rest}`;
}

export type TimelinePoint = {
  seconds: number;
  value: number;
  period: number;
  label: string;
  // KD/derribos NUEVOS respecto al punto anterior de esta esquina (para los
  // marcadores; la métrica dibujada es aparte).
  kdDelta: number;
  tdDelta: number;
};

export type CornerSeries = {
  points: TimelinePoint[];
  final: number | null;
};

export type FightTimeline = {
  red: CornerSeries;
  blue: CornerSeries;
  totalSeconds: number;
  rounds: number;
  maxValue: number;
};

function buildCornerSeries(
  samples: FightTimelineSample[],
  elapsed: number[],
  fighterId: number | null,
  metric: keyof LiveStatValues,
): CornerSeries {
  const points: TimelinePoint[] = [];
  if (fighterId == null) {
    return { points, final: null };
  }
  const key = String(fighterId);
  // Las stats de ESPN son acumuladas DESDE CERO: la línea base del primer
  // punto es 0 (un KD que ya viene en la primera muestra SÍ pinta anillo).
  // Y los previos son MONOTÓNICOS: una corrección transitoria de ESPN
  // (kd 1 -> 0 -> 1) no puede pintar dos anillos para el mismo knockdown.
  let prevKd = 0;
  let prevTd = 0;
  for (let i = 0; i < samples.length; i++) {
    const side = samples[i].byFighter[key];
    const value = side?.[metric];
    if (side == null || value == null) {
      continue;
    }
    const kdDelta = side.kd != null ? Math.max(0, side.kd - prevKd) : 0;
    const tdDelta = side.tdl != null ? Math.max(0, side.tdl - prevTd) : 0;
    prevKd = Math.max(prevKd, side.kd ?? 0);
    prevTd = Math.max(prevTd, side.tdl ?? 0);
    const seconds = elapsed[i];
    const last = points[points.length - 1];
    // Muestras redundantes (p. ej. las dos 'post' del cierre) no aportan punto.
    if (
      last &&
      last.seconds === seconds &&
      last.value === value &&
      kdDelta === 0 &&
      tdDelta === 0
    ) {
      continue;
    }
    // period/label salen del tiempo YA aplanado, no de la muestra cruda: una
    // muestra rancia clampeada no puede producir un "R1 · 8:00" imposible.
    const period = periodForSeconds(seconds);
    points.push({
      seconds,
      value,
      period,
      label: timelinePointLabel(seconds, period),
      kdDelta,
      tdDelta,
    });
  }
  return {
    points,
    final: points.length ? points[points.length - 1].value : null,
  };
}

// Serie dibujable de una pelea. Devuelve null si no hay historia suficiente
// (hace falta al menos una esquina con 2+ puntos para que exista "película").
export function buildFightTimeline(
  samples: FightTimelineSample[],
  redId: number | null,
  blueId: number | null,
  metric: keyof LiveStatValues = "ssl",
): FightTimeline | null {
  if (samples.length === 0) {
    return null;
  }
  // Eje X no decreciente: el reloj del scoreboard puede llegar ligeramente
  // desincronizado de las stats; un retroceso puntual se aplana en vez de
  // dibujar una línea que vuelve atrás. Una muestra sin información temporal
  // propia (post con reloj "-") arrastra el tiempo previo, con suelo en el
  // inicio de su asalto.
  const elapsed: number[] = [];
  let prev = 0;
  let hasPrev = false;
  for (const sample of samples) {
    const raw = sampleElapsedSeconds(sample, hasPrev ? prev : null);
    const floor = (sample.period - 1) * ROUND_SECONDS;
    prev = raw != null ? Math.max(prev, raw) : Math.max(prev, floor);
    hasPrev = true;
    elapsed.push(prev);
  }
  const red = buildCornerSeries(samples, elapsed, redId, metric);
  const blue = buildCornerSeries(samples, elapsed, blueId, metric);
  if (red.points.length < 2 && blue.points.length < 2) {
    return null;
  }
  const totalSeconds = Math.max(
    1,
    ...red.points.map((p) => p.seconds),
    ...blue.points.map((p) => p.seconds),
  );
  const rounds = Math.max(...samples.map((s) => s.period));
  const maxValue = Math.max(
    1,
    ...red.points.map((p) => p.value),
    ...blue.points.map((p) => p.value),
  );
  return { red, blue, totalSeconds, rounds, maxValue };
}

// Decimación para la variante compacta (/en-vivo viaja entero en cada payload
// RSC de 20 s): conserva SIEMPRE primera y última muestra y un paso uniforme
// entre medias. Como las stats son ACUMULADAS, los deltas de KD/derribo
// sobreviven (el incremento aflora en la siguiente muestra conservada).
export function decimateSamples<T>(samples: T[], maxSamples: number): T[] {
  if (maxSamples < 2 || samples.length <= maxSamples) {
    return samples;
  }
  const out: T[] = [];
  const step = (samples.length - 1) / (maxSamples - 1);
  for (let i = 0; i < maxSamples; i++) {
    out.push(samples[Math.round(i * step)]);
  }
  return out;
}

// Posición horizontal de un segundo de combate en el área de dibujo.
export function scaleSeconds(
  seconds: number,
  totalSeconds: number,
  left: number,
  width: number,
): number {
  if (totalSeconds <= 0) {
    return left;
  }
  return left + (width * Math.min(seconds, totalSeconds)) / totalSeconds;
}

// Posición vertical de un valor acumulado (0 abajo, máximo arriba).
export function scaleValue(
  value: number,
  maxValue: number,
  top: number,
  height: number,
): number {
  if (maxValue <= 0) {
    return top + height;
  }
  return top + height - (height * Math.min(value, maxValue)) / maxValue;
}
