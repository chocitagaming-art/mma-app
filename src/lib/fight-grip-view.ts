import {
  computeGripRounds,
  computeGripSplit,
  fightDurationSeconds,
  type GripRound,
  type GripRoundInput,
  type GripSplit,
} from "@/lib/fight-grip";
import {
  buildFightHeadline,
  displayLastName,
  type FightHeadline,
  type HeadlineCorner,
} from "@/lib/fight-headline";
import { formatControlTime } from "@/lib/live-stats";

// T8 de la película — el ensamblaje del bloque de agarre.
//
// Por qué existe un fichero solo para esto: la cuenta vive en fight-grip.ts y
// las frases en fight-headline.ts, que ya importa a la primera. Componer las
// dos DENTRO de cualquiera de ellas sería una dependencia circular. Y hacerlo
// dentro del .tsx sería peor: vitest ejecuta los .tsx pero el entorno es node,
// así que cualquier cuenta metida en el JSX se queda literalmente sin probar
// (es el mismo motivo por el que existe round-by-round.ts).
//
// Aquí no se decide nada de aspecto. Lo que se decide es qué se puede afirmar.

export type GripSegmentCorner = "red" | "nobody" | "blue";

export type GripSegment = {
  corner: GripSegmentCorner;
  // Fracción exacta 0..1. Es la ANCHURA, y sale de share, nunca de percent:
  // los enteros de 14232 suman 101 y desbordarían la barra.
  share: number;
  percent: number;
  seconds: number;
  clock: string;
};

export type FightGripView = {
  headline: FightHeadline;
  split: GripSplit;
  // Solo los tramos con anchura > 0, siempre en orden rojo → nadie → azul.
  // Un tramo de 0 px al que se le pinta un separador de 2 px se ve como un
  // tramo de verdad: 167 combates de 8.612 tienen las dos esquinas a cero.
  segments: GripSegment[];
  // Vacío = no hay tira que enseñar y NO se pinta el desplegable. Ni vacío ni
  // con un contenedor de cero barras.
  rounds: GripRound[];
  redLastName: string;
  blueLastName: string;
  totalClock: string;
};

export type FightGripViewInput = {
  redControlSeconds: number | null;
  blueControlSeconds: number | null;
  rounds: GripRoundInput[];
  redName: string | null;
  blueName: string | null;
  redId: number | null;
  blueId: number | null;
  winnerId: number | null;
  method: string | null;
  endRound: number | null;
  endTime: string | null;
};

/**
 * Traduce el id del ganador a la esquina que espera el titular.
 *
 * 🪤 La versión ingenua —`winnerId === redId ? "red" : …`— declara ganador al
 * rojo en cualquier combate por disputar: `FightCompetitor.id` es nullable en
 * los TBD y `winnerId` también, así que `null === null` da true y el bloque
 * publicaría un desenlace de una pelea que no se ha celebrado. El null se
 * guarda ANTES de comparar, igual que en tale-of-the-tape.tsx:254.
 */
export function winnerCorner(
  winnerId: number | null,
  redId: number | null,
  blueId: number | null,
): HeadlineCorner | null {
  if (winnerId === null) {
    return null;
  }
  if (redId !== null && winnerId === redId) {
    return "red";
  }
  if (blueId !== null && winnerId === blueId) {
    return "blue";
  }
  return null;
}

/** Los tramos dibujables de una barra, en el orden en que se pintan. */
export function gripSegments(split: GripSplit): GripSegment[] {
  const todos: GripSegment[] = [
    {
      corner: "red",
      share: split.redShare,
      percent: split.redPercent,
      seconds: split.redSeconds,
      clock: formatControlTime(split.redSeconds),
    },
    {
      corner: "nobody",
      share: split.nobodyShare,
      percent: split.nobodyPercent,
      seconds: split.nobodySeconds,
      clock: formatControlTime(split.nobodySeconds),
    },
    {
      corner: "blue",
      share: split.blueShare,
      percent: split.bluePercent,
      seconds: split.blueSeconds,
      clock: formatControlTime(split.blueSeconds),
    },
  ];

  return todos.filter((segment) => segment.share > 0);
}

// 🪤 AQUÍ VIVÍA `segmentBoundaries`, que decía en qué porcentaje del ancho iba
// cada separador para poder pintarlos en un overlay absoluto. Se borró el
// 15-ago-2026 con el fallo que causaba: al ir ENCIMA de los rellenos, la línea
// de 2 px tapaba 1 px del tramo de cada lado y borraba del dibujo 284 tramos
// que tenían segundos medidos. Ahora los separadores van en flujo, como
// hermanos entre relleno y relleno (fight-grip.tsx), así que no hay ninguna
// posición que calcular: la pone el propio flex.

export function buildFightGripView(
  input: FightGripViewInput,
): FightGripView | null {
  const fightSeconds = fightDurationSeconds(input.endRound, input.endTime);

  const split = computeGripSplit(
    input.redControlSeconds,
    input.blueControlSeconds,
    fightSeconds,
  );
  if (!split) {
    return null;
  }

  // Sin frases no hay bloque, aunque la barra se pudiera dibujar: una barra sin
  // titular no dice de quién es cada lado. buildFightHeadline devuelve null
  // cuando falta el apellido de alguna esquina.
  const headline = buildFightHeadline({
    redName: input.redName,
    blueName: input.blueName,
    redControlSeconds: input.redControlSeconds,
    blueControlSeconds: input.blueControlSeconds,
    fightSeconds,
    winner: winnerCorner(input.winnerId, input.redId, input.blueId),
    method: input.method,
    endRound: input.endRound,
  });
  if (!headline) {
    return null;
  }

  const rounds = computeGripRounds(input.rounds, input.endRound, input.endTime);
  // Una tira en la que NINGÚN asalto tiene reparto no informa de nada: son
  // filas de "sin medir" una detrás de otra. Se trata como si no hubiera tira.
  const conDato = rounds.some((round) => round.split !== null);

  const segments = gripSegments(split);

  return {
    headline,
    split,
    segments,
    rounds: conDato ? rounds : [],
    redLastName: displayLastName(input.redName),
    blueLastName: displayLastName(input.blueName),
    totalClock: formatControlTime(split.totalSeconds),
  };
}
