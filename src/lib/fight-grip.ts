import { ROUND_SECONDS } from "@/lib/fight-timeline";

// T1 + T2 de la película — el reparto de agarre, calculado desde el ACTA.
//
// Qué es "agarre" aquí: los segundos que un luchador tuvo al otro sujeto, la
// columna control_time_seconds de ufcstats. El rótulo de pantalla es AGARRADOS
// y no "control": en la misma página hay ya una columna «Control»
// (round-by-round.tsx:184) y en español "tenía el control" se lee como "iba
// ganando", que es un veredicto y no un hecho físico.
//
// Lo que NO se puede afirmar con este dato, y por eso no se escribe en ninguna
// parte: desde dónde se sujeta. ESPN y ufcstats no distinguen montada de valla,
// así que el residuo —lo que sobra al restar— NO es "peleando de pie": incluye
// clinch y scrambles sin control acreditado. Se rotula "nadie sujetaba".
//
// La regla de la casa que manda en todo el fichero: un ratio sin denominador es
// null y NO SE PINTA. Un 0 solo se publica si es un cero de verdad. Con el acta
// esa diferencia es real: 374 filas de fight_stats_rounds tienen el control a
// NULL (toda la era 1995-1998), y confundirlas con un cero dibujaría un
// "nadie sujatalba el 100 %" perfectamente falso.

export type GripSplit = {
  redSeconds: number;
  blueSeconds: number;
  nobodySeconds: number;
  // Duración real del tramo medido (combate entero o un asalto).
  totalSeconds: number;
  // Fracciones exactas 0..1. SIEMPRE suman 1: son las anchuras de la barra.
  redShare: number;
  blueShare: number;
  nobodyShare: number;
  // Enteros, solo para el texto. Pueden sumar 101 por el redondeo: nunca se
  // usan como anchura.
  redPercent: number;
  bluePercent: number;
  nobodyPercent: number;
};

export type GrappledSplit = {
  grappledSeconds: number;
  // null cuando los dos sujetaron exactamente lo mismo: no hay a quién nombrar.
  leader: "red" | "blue" | null;
  leaderPercent: number;
};

export type GripRoundInput = {
  round: number;
  redControlSeconds: number | null;
  blueControlSeconds: number | null;
};

export type GripRound = {
  round: number;
  // null = asalto sin acta. Se rotula "no medido"; jamás se reparte a ojo.
  split: GripSplit | null;
};

// "5:00" -> 300. Devuelve null para cualquier cosa que no sea un reloj, porque
// fights.end_time es TEXT sin restricción en la base (68 filas a NULL) y esta
// es la primera lectura de esa columna en TypeScript de todo el repo. Las dos
// rutas que ya la convierten a segundos lo hacen en SQL y se protegen con la
// misma regex antes (skill-radar.ts:55, fighters.detail.ts:312).
function parseRoundClock(endTime: string | null): number | null {
  if (typeof endTime !== "string") {
    return null;
  }
  const match = /^(\d+):(\d\d)$/.exec(endTime.trim());
  if (!match) {
    return null;
  }
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  // "5:60" casa la forma pero no es una hora.
  if (seconds > 59) {
    return null;
  }
  return minutes * 60 + seconds;
}

// Segundos que se pueden creer: un control negativo o no finito es un dato
// roto, no un cero.
function toSeconds(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function toRound(value: number | null): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    ? value
    : null;
}

// Duración real del combate. Misma definición que fight_seconds en
// skill-radar.ts:34-36 —(end_round - 1) * 300 + el reloj final—, a propósito:
// si divergieran, la web tendría dos duraciones distintas del mismo combate.
export function fightDurationSeconds(
  endRound: number | null,
  endTime: string | null,
): number | null {
  const rounds = toRound(endRound);
  const lastClock = parseRoundClock(endTime);
  if (rounds === null || lastClock === null) {
    return null;
  }
  return (rounds - 1) * ROUND_SECONDS + lastClock;
}

// Duración real de UN asalto. El último dura lo que marque el acta, nunca 300:
// en 13927 el KO cae a los 15 s del tercero, y con 300 de denominador el
// segundo de agarre que hubo ahí se leería como 0 %.
//
// Y el asalto completo tampoco se recorta a 300 cuando el acta dice más: los
// primeros UFC no tenían límite y hay combates con end_time 6:28.
export function roundDurationSeconds(
  round: number | null,
  endRound: number | null,
  endTime: string | null,
): number | null {
  const target = toRound(round);
  const last = toRound(endRound);
  const lastClock = parseRoundClock(endTime);
  if (target === null || last === null || lastClock === null) {
    return null;
  }
  // Un asalto que no se peleó no vale 0 segundos: no tiene respuesta.
  if (target > last) {
    return null;
  }
  return target < last ? ROUND_SECONDS : lastClock;
}

export function computeGripSplit(
  redControlSeconds: number | null,
  blueControlSeconds: number | null,
  totalSeconds: number | null,
): GripSplit | null {
  const red = toSeconds(redControlSeconds);
  const blue = toSeconds(blueControlSeconds);
  const total = toSeconds(totalSeconds);
  if (red === null || blue === null || total === null || total <= 0) {
    return null;
  }

  // Cinturón. Con el acta no se dispara (medido el 9-ago: 0 combates de 8.764
  // y 0 asaltos con rojo+azul por encima de su duración), pero la variante del
  // directo sí produce sumas que se pasan, y va a reutilizar esta función.
  const nobody = Math.max(0, total - red - blue);

  // El denominador de las anchuras es lo que se dibuja, no la duración: así la
  // barra queda cerrada aunque el cinturón haya recortado el residuo. Sin
  // recorte los dos valores coinciden.
  const painted = red + blue + nobody;

  return {
    redSeconds: red,
    blueSeconds: blue,
    nobodySeconds: nobody,
    totalSeconds: total,
    redShare: red / painted,
    blueShare: blue / painted,
    nobodyShare: nobody / painted,
    redPercent: Math.round((red / painted) * 100),
    bluePercent: Math.round((blue / painted) * 100),
    nobodyPercent: Math.round((nobody / painted) * 100),
  };
}

// El segundo denominador de la regla 5: sobre el tiempo que alguno sujetó, no
// sobre el combate entero. Los dos encuadres cuentan la misma pelea y dan
// titulares opuestos —en 14232 el azul es 26 % del combate y 58 % del agarre—,
// así que si se enseña uno se enseñan los dos.
export function computeGrappledSplit(
  redControlSeconds: number | null,
  blueControlSeconds: number | null,
): GrappledSplit | null {
  const red = toSeconds(redControlSeconds);
  const blue = toSeconds(blueControlSeconds);
  if (red === null || blue === null) {
    return null;
  }
  const grappled = red + blue;
  // Sin agarre no hay denominador: la frase entera desaparece.
  if (grappled <= 0) {
    return null;
  }

  // 🪤 El 100 % se topa en 99 mientras el otro haya llegado a sujetar. "El
  // 100 %" no es un redondeo cualquiera: es una afirmación absoluta que dice
  // que el otro estuvo a cero. En 11212 (Couture 846 s, Belfort 1 s) el 99,88 %
  // redondeaba a 100 y publicaba «Couture se llevó el 100 %» con Belfort a un
  // segundo. Son 91 combates de la base. El 100 % legítimo —2.433 combates
  // donde el otro SÍ estuvo a cero— se sigue publicando: es un cero medido.
  const bruto = Math.round((Math.max(red, blue) / grappled) * 100);
  const perdedor = Math.min(red, blue);

  return {
    grappledSeconds: grappled,
    leader: red > blue ? "red" : blue > red ? "blue" : null,
    leaderPercent: perdedor > 0 ? Math.min(99, bruto) : bruto,
  };
}

export function computeGripRounds(
  rounds: GripRoundInput[],
  endRound: number | null,
  endTime: string | null,
): GripRound[] {
  const out: GripRound[] = [];
  // Copia antes de ordenar: la entrada es de quien la pasó. Y el orden es un
  // invariante del dibujo, no una casualidad de la query.
  for (const row of [...rounds].sort((a, b) => a.round - b.round)) {
    const duration = roundDurationSeconds(row.round, endRound, endTime);
    if (duration === null) {
      continue;
    }
    out.push({
      round: row.round,
      split: computeGripSplit(
        row.redControlSeconds,
        row.blueControlSeconds,
        duration,
      ),
    });
  }
  return out;
}
