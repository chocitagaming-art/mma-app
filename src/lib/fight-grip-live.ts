import type { GripRoundInput } from "@/lib/fight-grip";
import type { FightTimelineSample } from "@/lib/fight-timeline";
import type { FightGripStats } from "@/lib/queries/fight-grip";

// T3 de la película — el reparto de agarre calculado DESDE EL DIRECTO, cuando
// todavía no hay acta de ufcstats.
//
// La diferencia con T1/T2 no es el cálculo, es la materia prima. El acta trae
// una fila por asalto con sus segundos ya separados. ESPN trae fotos del
// marcador cada ~20 s con el control ACUMULADO desde el principio del combate,
// así que los segundos de un asalto salen de restarle el asalto anterior. Todo
// lo raro de este fichero viene de esa resta.
//
// La salida es EXACTAMENTE la misma forma que devuelve el acta
// (`FightGripStats`), a propósito: así el directo es un reemplazo directo y ni
// la vista ni el componente tienen que saber de dónde salió el dato.
//
// 🪤 LA REGLA QUE MÁS FÁCIL SE ROMPE, y no rompe nada visible al romperse: aquí
// NO SE FILTRA POR `state` NI POR `display_clock`. Es el invariante 3 de la
// especificación. Filtrar los descansos «por limpieza» parece inofensivo —son
// filas con el reloj a "-"— pero es que las anclas VIVEN ahí: de las 82 últimas
// muestras de asalto de la base, 46 son `post` y 35 son `STATUS_END_OF_ROUND`.
// O sea que un filtro por limpieza se lleva por delante 81 de las 82. Medido
// sobre 12872: filtrar por reloj mueve el asalto 2 de 249 s (el acta) a 222.
//
// Los seis `statusName` que existen de verdad en la tabla, medidos el 15-ago:
// STATUS_IN_PROGRESS_2 (476), STATUS_END_OF_ROUND (103), STATUS_IN_PROGRESS
// (63), STATUS_FINAL (51), STATUS_END_OF_FIGHT (3) y
// STATUS_FIGHTERS_INTRODUCTION (1).

// Lo que significa que un asalto ya no va a crecer más. STATUS_END_OF_FIGHT
// llega con `state: "in"` —no es una errata: es como ESPN cerró la pelea de
// Steveson-Ellison— así que mirar solo el estado no basta.
const CIERRAN_EL_ASALTO = new Set([
  "STATUS_END_OF_ROUND",
  "STATUS_END_OF_FIGHT",
  "STATUS_FINAL",
]);

function cierraElAsalto(sample: FightTimelineSample): boolean {
  return (
    sample.state === "post" ||
    (sample.statusName !== null && CIERRAN_EL_ASALTO.has(sample.statusName))
  );
}

// Los segundos de agarre de una esquina en una muestra, o null si esa muestra
// no los trae. Un control negativo o no finito es un dato roto, no un cero:
// misma regla que `toSeconds` en fight-grip.ts.
function ctrlDe(
  sample: FightTimelineSample,
  fighterId: number,
): number | null {
  const valor = sample.byFighter[String(fighterId)]?.ctrl;
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0
    ? valor
    : null;
}

type Ancla = { red: number; blue: number };

const VACIO: FightGripStats = {
  redControlSeconds: null,
  blueControlSeconds: null,
  rounds: [],
};

/**
 * El reparto de agarre de una pelea a partir de sus muestras del directo.
 *
 * Devuelve la misma forma que el acta. `rounds` trae SOLO los asaltos ya
 * cerrados; el que se está peleando ahora mismo no sale, y los que se quedaron
 * sin muestra salen fundidos con el siguiente (ver abajo).
 *
 * Las cinco decisiones que este fichero toma, y que la especificación dejaba
 * abiertas (sesión 9, 15-ago-2026). La quinta está justo en la línea que la
 * contradice, más abajo; las otras cuatro son estas:
 *
 * 1. EL ASALTO EN CURSO NO SE PUBLICA. Se sabe cuánto lleva agarrado, pero no
 *    sobre cuánto: el asalto aún no ha durado lo que va a durar. Dividir por el
 *    tiempo jugado daría un porcentaje que cambia solo cada 20 s, y dividir por
 *    300 publicaría «10 %» donde va un 50 % (30 s de agarre en el primer minuto).
 *    Y la §7 punto 9 prohíbe expresamente que la barra se mueva sola.
 *    Hoy no se dispara NUNCA: los 46 combates de la tabla acaban en
 *    STATUS_FINAL. Eso no es que no pueda pasar, es que aún no ha pasado.
 *
 * 2. UNA MUESTRA QUE VUELVE ATRÁS SE IGNORA. Si tras una foto del asalto 3
 *    llega otra del 2, no se toca el asalto 2: se descarta la fila. Quedarse
 *    con «la última por orden de llegada» haría que un acumulado más pequeño
 *    pasara por bueno y, con el `Math.max(0, …)` de abajo, el asalto se
 *    publicaría con 0 segundos de agarre sin avisar de nada. Hoy tampoco pasa
 *    nunca (0 casos en 697 muestras), y por eso mismo hay que dejarlo escrito:
 *    la primera vez que ocurra no habrá nadie mirando.
 *
 * 3. SI FALTA EL ASALTO DE ANTES, LOS DOS VAN JUNTOS. Sin el acumulado del
 *    asalto N-1 no hay nada que restar, así que lo que hay cubre los dos y se
 *    publica como uno solo («Asaltos 1-2»). La alternativa —apuntarle el
 *    acumulado entero al asalto de la muestra— publica un número falso, y no
 *    poco: medido contra el acta en los 4 combates de la base a los que les
 *    falta el ancla de R1, se pasa +164 s en 12880, +135 s en 14493 y +20 s en
 *    12877. Fundiéndolos acierta el acta EXACTAMENTE en los cuatro.
 *
 *    🪤 Y el cuarto, 12875, acierta de las dos maneras: su acta es
 *    R1 0/0 · R2 0/0 · R3 191/0, así que darle los 191 s enteros al tercero da
 *    la respuesta correcta POR CASUALIDAD. Es un falso negativo perfecto: un
 *    test escrito solo sobre él da verde con la regla equivocada. Por eso está
 *    congelado en `grip-live-12875.json` y por eso el test lo usa como control.
 *
 * 4. UN HUECO EN MEDIO SE TRATA IGUAL. Un asalto sin ninguna muestra en mitad
 *    de la tira se funde con el siguiente, no desaparece: una tira que salta
 *    del 1 al 3 sin decir nada deja al lector contando asaltos que no están.
 */
export function buildLiveGripStats(
  samples: FightTimelineSample[],
  redId: number | null,
  blueId: number | null,
): FightGripStats {
  // Sin saber qué esquina es cada luchador no se puede afirmar nada: el orden
  // de `byFighter` es el del fighter_id, que no tiene ninguna relación con el
  // rojo y el azul (en 14493 el azul es 9021 y el rojo 9103, o sea que el
  // primero del objeto es el AZUL).
  if (redId === null || blueId === null) {
    return VACIO;
  }

  const anclas = new Map<number, Ancla>();
  // El asalto más alto VISTO, no el más alto con dato: es el que dice si una
  // muestra vuelve atrás, y una muestra puede venir sin control y aun así
  // demostrar que el combate ya va por el tercero.
  let periodMaximo = 0;
  let ultimaDelMaximo: FightTimelineSample | null = null;

  for (const sample of samples) {
    // Decisión 2: lo que retrocede no cuenta.
    if (sample.period < periodMaximo) {
      continue;
    }
    if (sample.period > periodMaximo) {
      periodMaximo = sample.period;
      ultimaDelMaximo = null;
    }
    ultimaDelMaximo = sample;

    const red = ctrlDe(sample, redId);
    const blue = ctrlDe(sample, blueId);
    if (red === null || blue === null) {
      continue;
    }
    // La última gana: el mapa se sobrescribe a cada muestra del mismo asalto.
    // Sin filtrar por estado ni por reloj — ver la cabecera.
    anclas.set(sample.period, { red, blue });
  }

  if (anclas.size === 0) {
    return VACIO;
  }

  const asaltos = [...anclas.keys()].sort((a, b) => a - b);

  // Decisión 1: el asalto que se está peleando no entra en la tira. Solo puede
  // serlo el más alto, y solo si su última muestra no dice que ya terminó.
  const enCurso =
    ultimaDelMaximo !== null &&
    !cierraElAsalto(ultimaDelMaximo) &&
    anclas.has(periodMaximo);
  const publicables = enCurso
    ? asaltos.filter((asalto) => asalto !== periodMaximo)
    : asaltos;

  const rounds: GripRoundInput[] = [];
  // El acumulado del asalto anterior. Arranca en cero porque las estadísticas
  // de ESPN cuentan desde el principio del combate, no desde el asalto.
  let previo: Ancla = { red: 0, blue: 0 };
  let previoAsalto = 0;

  for (const asalto of publicables) {
    const ancla = anclas.get(asalto);
    if (!ancla) {
      continue;
    }

    // Decisiones 3 y 4: la fila cubre todo lo que va desde el último asalto con
    // dato hasta este. Si son consecutivos, cubre uno solo y no hay fundido.
    const covers: number[] = [];
    for (let n = previoAsalto + 1; n <= asalto; n += 1) {
      covers.push(n);
    }

    const restaRed = ancla.red - previo.red;
    const restaBlue = ancla.blue - previo.blue;

    // 🪤 AQUÍ NO VA EL `Math.max(0, …)` QUE MANDA LA ESPECIFICACIÓN, y esta es
    // la única línea de T3 que se aparta de ella.
    //
    // El caso: que el acumulado de un asalto sea MENOR que el del anterior. La
    // resta sale negativa y `Math.max(0, …)` la convierte en un cero, o sea que
    // el asalto se publica como «no sujetó a nadie ni un segundo». Pero eso no
    // es lo que ha pasado: lo que ha pasado es que el dato está roto. Es
    // exactamente el `?? 0` que este proyecto lleva persiguiendo por cinco
    // tuberías distintas, entrando por una sexta puerta.
    //
    // La regla de la casa manda sobre la especificación: un 0 solo se publica
    // si es un cero de verdad. Un asalto con la resta negativa se marca no
    // medido, que es lo que realmente se sabe de él.
    //
    // Que hoy no pase no es que no pueda pasar: entre anclas el acumulado no ha
    // bajado nunca (0 casos de 82), pero entre muestras consecutivas baja en 60
    // de 651 pares, con un peor caso de −77 s. Solo hace falta que una de esas
    // correcciones caiga justo en un cambio de asalto. Y ESPN corrige a la baja
    // de verdad: en 14022 la `post` final baja el control del azul de 469 a
    // 467, y esa corrección es BUENA — por eso se coge la última muestra y no
    // la mayor, y por eso una bajada pequeña no se puede tratar como ruido.
    const roto = restaRed < 0 || restaBlue < 0;

    rounds.push({
      round: asalto,
      ...(covers.length > 1 ? { covers } : {}),
      redControlSeconds: roto ? null : restaRed,
      blueControlSeconds: roto ? null : restaBlue,
    });

    previo = ancla;
    previoAsalto = asalto;
  }

  // El total del combate es el último acumulado que se conoce, INCLUIDO el
  // asalto en curso si lo hay: «lleva sujeto 4:20» es cierto en cualquier
  // momento, mientras que «el 30 % del asalto» todavía no lo es. Los dos
  // números salen de sitios distintos a propósito.
  const ultima = anclas.get(asaltos[asaltos.length - 1]);

  return {
    redControlSeconds: ultima?.red ?? null,
    blueControlSeconds: ultima?.blue ?? null,
    rounds,
  };
}
