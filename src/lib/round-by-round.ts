import { toIsoDateOnly } from "@/lib/structured-data";
import type { FightRoundStats } from "@/lib/types";

// FASE 9 — la lógica del "asalto a asalto", separada del componente para que
// vitest pueda probarla: la configuración solo recoge `src/**/*.test.ts`, no
// `.tsx`, así que cualquier cálculo que viva dentro del JSX no lo prueba nadie.
// Es lo mismo que se hizo con la película del combate (fight-timeline.ts).
//
// OJO, esto NO es la película del combate: aquí el dato viene de
// fight_stats_rounds (ufcstats, oficial y posterior al combate) y existe para
// 8.738 peleas. La película se capta en directo de ESPN y solo existe para 20.
// Son dos cosas distintas que se parecen mucho en pantalla: ver el aviso del
// componente.

export type CornerRoundStats = FightRoundStats | null;

export type RoundPair = {
  round: number;
  red: CornerRoundStats;
  blue: CornerRoundStats;
};

// Suma de un luchador en todo el combate. Mismos campos que FightRoundStats
// menos los que no tienen sentido acumular (fighterId, round).
export type CornerTotals = {
  sigStrikesLanded: number;
  sigStrikesAttempted: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  submissionAttempts: number;
  // null = ningun asalto trae control en el acta. Ver `acumular`.
  controlTimeSeconds: number | null;
  knockdowns: number;
};

export type RoundByRoundData = {
  rounds: RoundPair[];
  totals: { red: CornerTotals; blue: CornerTotals };
  // Golpes conectados en el mejor asalto de cualquiera de los dos. Es la escala
  // de las barras: si cada asalto se normalizara por su cuenta, un asalto de
  // 3 golpes se vería igual de lleno que uno de 40.
  maxSigLanded: number;
  // Solo se pinta la columna de sumisiones si alguien lo intentó alguna vez.
  // Son ~12% de los asaltos: en el resto sería una columna de ceros que
  // estrecha la tabla en móvil a cambio de nada.
  hasSubmissionAttempts: boolean;
};

const CEROS: CornerTotals = {
  sigStrikesLanded: 0,
  sigStrikesAttempted: 0,
  takedownsLanded: 0,
  takedownsAttempted: 0,
  submissionAttempts: 0,
  // Arranca en null, no en 0: el acumulado de cero asaltos con dato NO es cero
  // segundos de control, es «no se sabe».
  controlTimeSeconds: null,
  knockdowns: 0,
};

function acumular(total: CornerTotals, fila: FightRoundStats): CornerTotals {
  return {
    sigStrikesLanded: total.sigStrikesLanded + fila.sigStrikesLanded,
    sigStrikesAttempted: total.sigStrikesAttempted + fila.sigStrikesAttempted,
    takedownsLanded: total.takedownsLanded + fila.takedownsLanded,
    takedownsAttempted: total.takedownsAttempted + fila.takedownsAttempted,
    submissionAttempts: total.submissionAttempts + fila.submissionAttempts,
    // 🪤 LA TENTACION AQUI ES `(a ?? 0) + (b ?? 0)`, y eso reintroduce la
    // mentira que se acaba de quitar, escondida dentro del total. La regla es:
    // si NINGUNO de los dos tiene dato, el total sigue sin dato; en cuanto uno
    // lo tiene, se suma tratando al que falta como 0 y el total es parcial.
    // Hoy no hay ni un combate mixto medido (o vienen los 5 asaltos con
    // control o no viene ninguno), pero el tipo lo permite y el proximo
    // scrape parcial lo puede crear.
    controlTimeSeconds:
      total.controlTimeSeconds == null && fila.controlTimeSeconds == null
        ? null
        : (total.controlTimeSeconds ?? 0) + (fila.controlTimeSeconds ?? 0),
    knockdowns: total.knockdowns + fila.knockdowns,
  };
}

// Agrupa las filas (una por luchador y asalto) en pares rojo/azul, ordenados por
// asalto, y suma los totales de cada esquina.
//
// Las filas cuyo fighter_id no case con ninguna esquina se descartan: son datos
// huérfanos y pintarlos daría un asalto con tres luchadores. En la BD hoy no hay
// ninguna, pero la ficha no debe romperse si aparece.
export function buildRoundByRound(
  filas: readonly FightRoundStats[],
  redId: number | null,
  blueId: number | null,
): RoundByRoundData | null {
  const porAsalto = new Map<number, { red: CornerRoundStats; blue: CornerRoundStats }>();
  let red = CEROS;
  let blue = CEROS;
  let maxSigLanded = 0;
  let hasSubmissionAttempts = false;

  for (const fila of filas) {
    const esRojo = redId != null && fila.fighterId === redId;
    const esAzul = blueId != null && fila.fighterId === blueId;
    if (!esRojo && !esAzul) {
      continue;
    }

    const entrada = porAsalto.get(fila.round) ?? { red: null, blue: null };
    if (esRojo) {
      entrada.red = fila;
      red = acumular(red, fila);
    } else {
      entrada.blue = fila;
      blue = acumular(blue, fila);
    }
    porAsalto.set(fila.round, entrada);

    maxSigLanded = Math.max(maxSigLanded, fila.sigStrikesLanded);
    hasSubmissionAttempts ||= fila.submissionAttempts > 0;
  }

  if (porAsalto.size === 0) {
    return null;
  }

  const rounds = [...porAsalto.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, esquinas]) => ({ round, red: esquinas.red, blue: esquinas.blue }));

  return { rounds, totals: { red, blue }, maxSigLanded, hasSubmissionAttempts };
}

// Ancho de la barra de un asalto, en porcentaje sobre el mejor asalto del
// combate. Devuelve 0 sin datos (no hay barra que pintar) y nunca divide por
// cero: un asalto donde nadie conectó un golpe es real (969 en la BD).
export function anchoBarra(conectados: number | null | undefined, maxSigLanded: number): number {
  if (!conectados || conectados <= 0 || maxSigLanded <= 0) {
    return 0;
  }
  return Math.min(100, (conectados / maxSigLanded) * 100);
}

// NOTA HISTÓRICA, para que no vuelva. Aquí vivía `esDecision`, que reconocía
// los dos formatos del método ("U-DEC" de ufcstats y "Decision - Unanimous") y
// servía para NO marcar final en las decisiones. Funcionaba, pero era una lista
// negra: los 24 combates `Overturned`/`Other` con end_time '5:00' no son
// decisiones, así que pasaban el filtro y se marcaban como finalizados. Se
// sustituye por la lista blanca de abajo. Si hace falta volver a saber si un
// combate fue a las tarjetas, escríbase de nuevo — pero no para decidir esto.

// Las formas en que un combate se acaba ANTES del límite. Es una lista blanca a
// propósito: el criterio anterior era "marcar salvo que sea una decisión", y una
// lista negra solo excluye lo que se te ocurrió. Se colaban 24 combates
// `Overturned`/`Other` con end_time '5:00' — llegaron al límite y les anularon
// el resultado después, así que marcarles "Final · 5:00" era falso. Verificado
// contra la BD el 1-ago-2026: los métodos almacenados son 'KO/TKO', 'SUB',
// 'Submission', 'DQ' y 'CNC', a veces con un detalle detrás ("SUB - Kimura").
const FINALIZACIONES = ["ko/tko", "sub", "submission", "dq", "cnc"];

export function esFinalizacion(method: string): boolean {
  const m = method.trim().toLowerCase();
  // Prefijo exacto: `Overturned - Rear Naked Choke` NO puede casar con "sub", y
  // el separador evita que un método futuro tipo "subasta" cuele por parecido.
  return FINALIZACIONES.some((f) => m === f || m.startsWith(`${f} `) || m.startsWith(`${f}-`));
}

// Texto del final del combate para marcarlo en el asalto donde ocurrió.
// Devuelve null si el combate llegó al límite (decisión o resultado anulado), si
// aún no hay resultado, o si el método no es una finalización reconocida: ante
// la duda es mejor no marcar nada que anunciar un final que no ocurrió.
export function etiquetaFinal(
  method: string | null,
  endRound: number | null,
  endTime: string | null,
  round: number,
): string | null {
  if (!method || endRound == null || endRound !== round) {
    return null;
  }
  if (!esFinalizacion(method)) {
    return null;
  }
  return endTime ? `Final · ${endTime}` : "Final";
}

// Qué enseñar cuando `buildRoundByRound` no devuelve nada.
export type EstadoDesglose = "tabla" | "aviso" | "nada";

// Antes de esta fecha, la UFC no registraba estadísticas por asalto. Consultado
// contra la BD el 1-ago-2026: de los 32 combates con método y sin desglose, 19
// son de 1995-1998 y los otros 13 son de esa misma noche. Entre 1999 y 2025 no
// hay NI UNO, así que el corte no parte por la mitad ningún caso real.
const PRIMER_ANIO_CON_ASALTOS = 1999;

/**
 * Decide si se pinta la tabla del asalto a asalto, un aviso de que no existe, o
 * nada en absoluto.
 *
 * EL BUG QUE ARREGLA. Antes bastaba con que `method` no fuera null para soltar
 * «en las veladas más antiguas no se registraba». Y `method` no llega a la vez
 * que el desglose: lo escribe el scraper de ESPN a los minutos de acabar cada
 * pelea, mientras `fight_stats_rounds` viene después con la consolidación de
 * ufcstats. Entre medias, las fichas más visitadas del sitio le dicen al
 * visitante que un combate de hace dos horas es tan antiguo que no se
 * registraba. La noche del 1-ago-2026 hubo 13 combates exactamente así.
 *
 * POR QUÉ LA FECHA Y NO «¿han llegado ya los totales?». Se valoró mirar
 * `fight_stats`, que llega en el mismo scrape que los asaltos. Serviría, pero
 * exige otra consulta y sigue siendo una señal indirecta. La fecha responde a
 * la pregunta que el aviso realmente hace: la frase habla de cómo se registraba
 * en su época, así que lo que decide es la época — no el estado de nuestra
 * ingesta.
 *
 * Y ante la duda, CALLAR. Un combate moderno cuyo desglose no llegue nunca se
 * queda sin sección, que es discreto y cierto. La alternativa es afirmar algo
 * falso sobre 8.800 fichas, y eso no lo arregla ningún dato que llegue después.
 */
export function estadoDesglose(
  hayDatos: boolean,
  method: string | null,
  // `string | Date` NO es defensa preventiva: `events.event_date` es una
  // columna DATE y node-postgres devuelve un objeto Date, por mucho que el tipo
  // `FightDetail` prometa `string`. Se descubrió levantando el sitio contra la
  // BD real — el megatest no lo veía —, y es el mismo fallo que publicó mal la
  // fecha de nacimiento de 1.515 luchadores en julio.
  eventDate: string | Date | null,
): EstadoDesglose {
  if (hayDatos) {
    return "tabla";
  }
  // Sin método aún no se ha peleado: no hay hueco que explicar.
  if (!method || !eventDate) {
    return "nada";
  }
  // `toIsoDateOnly` lee los componentes LOCALES del Date, que son los que
  // reconstruyen el día que guardó Postgres. Con los UTC, el 16-oct-1998
  // llegaba como `1998-10-15T22:00:00.000Z` y un evento del 1 de enero caería
  // al año anterior.
  const iso = toIsoDateOnly(eventDate);
  if (!iso) {
    return "nada";
  }
  const anio = Number(iso.slice(0, 4));
  return anio < PRIMER_ANIO_CON_ASALTOS ? "aviso" : "nada";
}
