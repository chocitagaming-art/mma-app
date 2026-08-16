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
  // Derribos que ESPN da por buenos en la ÚLTIMA muestra usable. Va aparte de
  // los tdDelta a propósito: los deltas son monótonos (una corrección
  // transitoria no puede pintar dos veces el mismo derribo), así que su suma se
  // queda con el MÁXIMO que llegó a marcar el directo, y al cerrar el combate
  // ESPN a veces retira un derribo que había acreditado. Cruzado con el acta de
  // ufcstats sobre las 116 series con muestras (2026-08-16): este total
  // coincide en 116/116, y la suma de deltas en 115/116 (falla en la 14022,
  // esquina roja 6455, donde marca 2 y el acta dice 1).
  tdTotal: number;
};

export type FightTimeline = {
  red: CornerSeries;
  blue: CornerSeries;
  totalSeconds: number;
  rounds: number;
  maxValue: number;
  // Tramos en que uno de los dos sujetaba al otro. Vacío = la película no
  // dibuja esa capa (ver buildControlBands, al final del fichero).
  control: ControlBand[];
};

function buildCornerSeries(
  samples: FightTimelineSample[],
  elapsed: number[],
  fighterId: number | null,
  metric: keyof LiveStatValues,
): CornerSeries {
  const points: TimelinePoint[] = [];
  if (fighterId == null) {
    return { points, final: null, tdTotal: 0 };
  }
  const key = String(fighterId);
  // Las stats de ESPN son acumuladas DESDE CERO: la línea base del primer
  // punto es 0 (un KD que ya viene en la primera muestra SÍ pinta anillo).
  // Y los previos son MONOTÓNICOS: una corrección transitoria de ESPN
  // (kd 1 -> 0 -> 1) no puede pintar dos anillos para el mismo knockdown.
  let prevKd = 0;
  let prevTd = 0;
  // Último tdl visto (NO monótono): el recuento con el que ESPN cierra.
  let lastTd = 0;
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
    // 🪤 ANTES del `continue` de deduplicación: la muestra que RETIRA un
    // derribo suele repetir segundo y golpes de la anterior (es la 'post' del
    // cierre), así que no llega a ser punto. Si esto se lee después, la
    // corrección se pierde justo en el caso para el que existe.
    if (side.tdl != null) {
      lastTd = side.tdl;
    }
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
    tdTotal: lastTd,
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
  // La banda vive en el MISMO eje X que las líneas, así que se recorta al
  // dominio: totalSeconds sale de los PUNTOS, y una última muestra sin ssl lo
  // dejaría por detrás del último `elapsed`. Sin este recorte el <title> de un
  // tramo podría nombrar un segundo que el eje no llega a dibujar.
  const control = buildControlBands(samples, elapsed, redId, blueId)
    .filter((band) => band.from < totalSeconds)
    .map((band) =>
      band.to <= totalSeconds
        ? band
        : {
            ...band,
            to: totalSeconds,
            seconds: Math.min(band.seconds, totalSeconds - band.from),
          },
    );
  return { red, blue, totalSeconds, rounds, maxValue, control };
}

// ── LA BANDA DE AGARRE: la segunda capa de la película ───────────────────────
//
// POR QUÉ EXISTE, medido sobre los 12 combates de UFC 330 (15-ago-2026, evento
// 1064, 352 muestras): la línea de golpes significativos describe bien una
// pelea de pie y se queda MUDA en una de agarre.
//
//   · El estelar es el peor caso. Makhachev gana por decisión unánime con 22
//     golpes significativos frente a los 29 de Garry (el acta y el directo
//     coinciden), así que la película de hoy dibuja al PERDEDOR por encima toda
//     la pelea. Lo que no dibuja es que lo tuvo sujetado 750 s de 1500 —el 50 %
//     del combate— contra 34 s (el 2 %), con 7 derribos.
//   · GRÁFICA PLANA A PALADAS. Las cuatro rachas de 2 minutos o más en que las
//     DOS líneas se quedan congeladas suman 971 s de línea horizontal (16 min
//     del eje, 17 si se cuenta hasta la muestra que las despega) con +776 s de
//     agarre acumulado por debajo. Eso no es una pelea sin nada que contar: es
//     una pelea cuya historia está en otra capa.
//   · Y no es cosa de un combate: en 6 de los 12 hay un luchador que llega al
//     25 % del tiempo sujetando al otro (el sexto, Luque-Gore, se queda clavado
//     en 225 s de 900). En total 3.388 s de agarre sobre 8.455 s de combate, el
//     40 % del eje X, hoy sin dibujar.
//
// Los segundos ya vienen en las muestras ('ctrl'): esto NO toca la ingesta.
//
// 🪤 Y NO SE RESUELVE con buildFightTimeline(samples, red, blue, 'ctrl'), que ya
// funciona hoy. Esa llamada devuelve dos series con REJILLAS DE X DISTINTAS —el
// dedupe de buildCornerSeries corta puntos distintos en cada esquina; en la
// 12872 la roja tiene 39 puntos de ctrl y 31 de ssl— y una banda necesita
// comparar a las DOS esquinas en el MISMO tramo. Por eso esto recorre
// samples+elapsed una sola vez y decide ventana a ventana.

export type ControlBandOwner = "red" | "blue";

export type ControlBand = {
  // Tramo del eje X (segundos de combate) que ocupa el rectángulo.
  from: number;
  to: number;
  owner: ControlBandOwner;
  // Segundos de agarre MEDIDOS del dueño dentro del tramo. NO es el ancho: el
  // tramo dice "aquí sujetaba" y esta cifra dice "cuánto de aquí". Es lo que
  // publica el <title> del carril, y es lo que impide que el dibujo afirme de
  // más cuando la ventana entre dos muestras es larga.
  seconds: number;
};

// Cuánto de una ventana tiene que ocupar el agarre para que la ventana lleve
// dueño. Un tercio, y está MEDIDO sobre los 12 combates de UFC 330:
//   · sin umbral (gana quien sume un segundo más) la banda pinta 4.650 s donde
//     hay 3.388 s de agarre (1,37x), y Barboza-Ribovics —una pelea de pie con
//     19 s de clinch— saldría con el 39 % del gráfico pintado;
//   · con 1/2 desaparecen combates enteros: Tobias-Fernando (55 s de agarre) se
//     queda en cero tramos y Johnson-Chapolin baja de 72 s a 15 s;
//   · con 1/3 la banda pinta 3.087 s donde hay 3.388 s: se queda CORTA a
//     propósito, que es el lado por el que hay que equivocarse.
export const MIN_CONTROL_SHARE = 1 / 3;

// Y un suelo ABSOLUTO además del relativo, porque el relativo solo se cumple a
// sí mismo: en una ventana de 1 s basta 1 s de agarre para llevarse el 100 %.
// Pasa de verdad —el reloj de ESPN a veces emite dos muestras pegadas justo en
// el corte de asalto— y en la 14232 producía DOS tramos de 1 y 2 segundos:
// rectángulos de 0,8 y 1,6 unidades del viewBox, o sea 0,3 y 0,6 px de pantalla
// en un móvil. Eso no es un tramo, es suciedad pegada a la línea del asalto:
// no se puede ver, no se puede apuntar con el ratón para leer su <title>, y
// SÍ contaba en el "5 tramos de Manoel Sousa" del aria-label, que es lo único
// que la banda le dice a quien no ve el dibujo.
// Medido sobre los 58 combates con muestras: subir el suelo a 5 s quita 4 de
// los 129 rectángulos y 9 s de los 9.122 de banda (el 0,1 %), y deja cero
// tramos por debajo de 2 px. El de 5 s más estrecho que sobrevive mide 4,7 px.
export const MIN_CONTROL_SECONDS = 5;

function sampleCtrl(
  sample: FightTimelineSample,
  key: string | null,
): number | null {
  if (key == null) {
    return null;
  }
  const value = sample.byFighter[key]?.ctrl;
  return typeof value === "number" ? value : null;
}

// 🪤 ctrl NO ES MONÓTONO: baja en 20 de las 116 series medidas, y el peor caso
// es la 13315 esquina roja (36 -> 14, o sea -22 s). Un retroceso significa "no
// sé quién sujetaba en esta ventana", JAMÁS "cero segundos", y por eso devuelve
// null y no un Math.max(0, delta).
//
// HONESTAMENTE: hoy las dos formas dan el MISMO dibujo, y conviene escribirlo
// aquí para que nadie "descubra" que el null sobra. El suelo del umbral es
// span/3 y span siempre es > 0, así que un delta de 0 tampoco llega nunca a
// dueño; y en el desempate, un rival con delta >= suelo gana igual contra 0 que
// contra null. El null vale por lo que protege SI ALGUIEN TOCA EL UMBRAL: con
// MIN_CONTROL_SHARE en 0 —que es la simplificación tentadora, "gana quien sume
// más"—, el cero pasaría a ser un dueño legítimo de 0 segundos y la banda
// pintaría tramos vacíos. Con null, no.
function ctrlDelta(prev: number, current: number | null): number | null {
  if (current == null) {
    return null;
  }
  const delta = current - prev;
  return delta >= 0 ? delta : null;
}

export function buildControlBands(
  samples: FightTimelineSample[],
  elapsed: number[],
  redId: number | null,
  blueId: number | null,
): ControlBand[] {
  const redKey = redId == null ? null : String(redId);
  const blueKey = blueId == null ? null : String(blueId);
  const bands: ControlBand[] = [];
  // Las stats de ESPN son ACUMULADAS DESDE CERO (misma doctrina que los KD de
  // buildCornerSeries): la primera ventana va del segundo 0 con línea base 0,
  // así que un agarre anterior a la primera muestra SÍ pinta banda.
  let prevRed = 0;
  let prevBlue = 0;
  let from = 0;
  for (let i = 0; i < samples.length; i++) {
    const to = elapsed[i];
    const red = sampleCtrl(samples[i], redKey);
    const blue = sampleCtrl(samples[i], blueKey);
    const span = to - from;
    // Muestras que no mueven el reloj (las dos 'post' del cierre, los polls del
    // descanso) no abren ventana, pero sí actualizan el acumulado de abajo.
    if (span > 0) {
      const redDelta = ctrlDelta(prevRed, red);
      const blueDelta = ctrlDelta(prevBlue, blue);
      const floor = Math.max(span * MIN_CONTROL_SHARE, MIN_CONTROL_SECONDS);
      let owner: ControlBandOwner | null = null;
      let delta = 0;
      if (
        redDelta != null &&
        redDelta >= floor &&
        (blueDelta == null || redDelta > blueDelta)
      ) {
        owner = "red";
        delta = redDelta;
      } else if (
        blueDelta != null &&
        blueDelta >= floor &&
        (redDelta == null || blueDelta > redDelta)
      ) {
        owner = "blue";
        delta = blueDelta;
      }
      if (owner) {
        const last = bands[bands.length - 1];
        // 🪤 EL RELOJ DE AGARRE DE ESPN LLEGA A RÁFAGAS, no gota a gota: en el
        // estelar pasa de 2 a 103 s en una ventana de 30 (índice 3 de la serie
        // real). Una ventana que declara más segundos de agarre de los que duró
        // los estaba ARRASTRANDO de antes —el acumulado no puede superar al
        // reloj de combate, así que ese agarre ocurrió sí o sí antes—, y el
        // sobrante se devuelve hacia atrás. Sin esto, el tramo de R1 del
        // estelar empezaría en 1:28 cuando la propia cifra de ESPN demuestra
        // que a 1:58 llevaba ya 1:43 sujetándolo.
        // Dos suelos, y los dos son físicos: no se pisa el tramo anterior, y no
        // se cruza el corte de asalto (entre asalto y asalto no se sujeta a
        // nadie).
        const backstop = Math.max(
          last ? last.to : 0,
          (periodForSeconds(to) - 1) * ROUND_SECONDS,
        );
        const start =
          delta > span ? Math.max(backstop, from - (delta - span)) : from;
        // El ancho es el techo de lo que se puede afirmar: una corrección gorda
        // de ESPN no puede publicar "sujetó 6:40" en un tramo de 30 s.
        const seconds = Math.min(delta, to - start);
        if (last && last.owner === owner && last.to === start) {
          last.to = to;
          last.seconds += seconds;
        } else {
          bands.push({ from: start, to, owner, seconds });
        }
      }
      from = to;
    }
    // 🪤 LA LÍNEA BASE NO BAJA CON EL RETROCESO, misma doctrina que los KD y
    // los derribos de buildCornerSeries: el acumulado que se recuerda es el
    // MÁXIMO visto. Un reloj de agarre es un contador que solo sube, así que
    // cuando ESPN lo baja es un error suyo, no un hecho de la pelea; medir la
    // ventana siguiente desde el valor rebajado hace que los MISMOS segundos se
    // cuenten dos veces.
    //
    // Con el máximo, la banda no puede afirmar nunca más agarre del que ESPN
    // llegó a acreditar: los deltas positivos telescopan hasta el máximo. Sin
    // él sí podía, y pasaba — 13315 (Abdul-Malik, esquina roja): ctrl sube a 36,
    // ESPN lo desploma a 14 durante dos muestras y lo devuelve a 34. La versión
    // que bajaba la base leía esa recuperación como "+20 s nuevos" y publicaba
    // un segundo rectángulo con el <title> «sujetó 0:20», sobre 56 s totales
    // cuando el directo cierra en 37 y el acta de ufcstats dice 37. Un tramo
    // entero inventado. Con el máximo, la banda de esa esquina se queda en 36 s.
    //
    // LO QUE CUESTA, medido sobre los 58 combates con muestras: 3 rectángulos y
    // 89 s de los 9.122 de banda (el 1 %). En el estelar, el bloque del R1
    // arranca en 0:19 en vez de en 0:17 y declara 3:44 en vez de 3:46.
    if (red != null) {
      prevRed = Math.max(prevRed, red);
    }
    if (blue != null) {
      prevBlue = Math.max(prevBlue, blue);
    }
  }
  return bands;
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
