import { computeGrappledSplit, computeGripSplit } from "@/lib/fight-grip";
import { formatControlTime } from "@/lib/live-stats";

// T5 de la película — el titular, el subtitular y la nota del reparto de agarre.
//
// Dos reglas mandan sobre todo lo que se escribe aquí:
//
// 1. VERBOS FÍSICOS, NUNCA DE VEREDICTO. "Lo tuvo sujeto" sí; "mandó",
//    "dominó", "ventaja" o "controló el combate" no. ufcstats no distingue
//    montada de valla, y quien ataca desde abajo sale a cero: cualquier verbo
//    de mando sería una conclusión que el dato no sostiene. Hay un test que
//    barre las palabras vetadas sobre todas las salidas.
//
// 2. LOS DOS LADOS AL MISMO TAMAÑO. Nunca "falló 8 de sus 9" a secas: retrata
//    de fracasado justo al que acabó mandando, y sin su contraparte no es
//    información, es un juicio.
//
// El texto sale en CAJA NORMAL a propósito. El maquetado lo enseña gritado,
// pero la propia especificación veta las mayúsculas en frases largas —46
// caracteres en caja alta son tres líneas a 375 px— y el titular canónico mide
// exactamente 46. Decidir eso es del componente, que tendrá una pantalla
// delante; congelarlo aquí sería tomar una decisión visual a ciegas.
//
// 🪤 Y el presupuesto de palabras de la especificación (titular ≤ 8) no lo
// cumple ni su propio ejemplo, que tiene 9. No se testea un número que el
// diseño aprobado incumple: lo que sí se fija con test es el texto exacto y la
// lista de palabras prohibidas.

export type HeadlineCorner = "red" | "blue";

export type HeadlineInput = {
  // 🪤 Nullables a propósito. El nombre bueno sale del join con `fighters`
  // (red.name), NO de fights.fighter_red_name, que está a NULL en 8.694 de las
  // 8.851 filas. Quien llame a esta función con la columna equivocada se lo va
  // a encontrar vacío el 98 % de las veces, y aquí no se publica media frase.
  redName: string | null;
  blueName: string | null;
  redControlSeconds: number | null;
  blueControlSeconds: number | null;
  fightSeconds: number | null;
  winner: HeadlineCorner | null;
  method: string | null;
  endRound: number | null;
};

export type FightHeadline = {
  headline: string;
  subhead: string;
  // El segundo denominador de la regla 5. null cuando nadie sujetó a nadie:
  // sin agarre no hay porcentaje del agarre que enseñar.
  grappledLine: string | null;
  note: string | null;
};

// Por debajo de esta diferencia no hay historia que contar y la plantilla del
// titular cambia: decir "lo tuvo sujeto medio minuto más" con 20 s de por medio
// es mentir por énfasis. Son 2.310 combates de los 8.612 comparables.
const GAP_MINIMO_SEGUNDOS = 30;

// Las 36 fichas de la base con apellido compuesto llevan una de estas delante.
// Cortar por el último espacio dejaría "Santos" o "Silva", que es otra persona.
// "della" y "saint" salieron de la tercera revisión: sin ellas, 3215 publicaba
// «Makhachev lo tuvo sujeto 19 minutos más que Maddalena» sobre Jack DELLA
// Maddalena, que es campeón. Los otros dos son Saint Denis y Saint Preux.
//
// 🪤 "du" entró el 15-ago-2026, y la lección es que la lista se había escrito
// mirando quién estaba en pantalla, no quién está en la base: faltaba desde el
// principio y llevaba días publicando «Chimaev lo tuvo sujeto 21 minutos más
// que Plessis» sobre Dricus DU PLESSIS, que es campeón, igual que pasó con Jack
// Della Maddalena. Son 11 fichas.
//
// LA LISTA SE AMPLÍA CONTANDO, NUNCA POR SI ACASO. El barrido del 15-ago pasó
// por la base las 29 partículas de apellido que existen en los idiomas de la
// UFC, y de las que faltaban solo "du" es una partícula de verdad: "ben", "al",
// "mac", "abu" y "bin" aparecen SIEMPRE como nombre de pila (Ben Askren, Al
// Iaquinta, Mac Danzig, Abu Azaitar). Meterlas «por completar» habría roto 14
// fichas que hoy están bien. Verificado además que añadir "du" cambia
// EXACTAMENTE un luchador de los 2.859.
//
// 🪤 Y "li" estaba en esa lista de descartes por un motivo FALSO. Decía que «Li
// Jingliang» prueba que "li" es siempre nombre de pila. 李 es de los apellidos
// chinos más frecuentes, y en esta base los nombres chinos están guardados con
// el APELLIDO DELANTE. La conclusión (no meter "li" aquí) sigue siendo correcta,
// pero por otra razón: estas partículas se arrastran hacia ATRÁS y aquí el
// apellido está DELANTE, así que esta lista no puede arreglarlo. Ver
// APELLIDO_REVISADO.
const PARTICULAS = new Set([
  "da", "das", "de", "del", "della", "delle", "di", "do", "dos", "du",
  "la", "le", "saint", "st.", "van", "von",
]);

// Los nombres donde NINGUNA regla acierta, revisados a mano uno por uno.
//
// Barrido del 15-ago-2026 sobre los 2.859 nombres de `fighters`, ejecutando
// esta misma función y leyendo después los 109 nombres de 3+ palabras, los 128
// de nacionalidad asiática y los 46 con partícula: 23 luchadores salen con un
// apellido que no es su apellido, y aparecen en 134 de los 8.612 combates que
// pintan el bloque de agarre. Los documentos decían «4 fichas»: ese 4 son los
// COMBATES de un solo luchador, el del conector «e», que resulta ser el caso
// más pequeño de todos.
//
// La vía dominante —20 de los 23— es el ORDEN ASIÁTICO, que no estaba
// mencionado en ninguna parte. La web publicaba «Weili lo tuvo sujeto 15
// minutos y medio más que Lemos» sobre Zhang Weili, CAMPEONA: el mismo fallo,
// palabra por palabra, que ya costó los parches de Della Maddalena y Du Plessis.
//
// 🪤 POR QUÉ UNA LISTA DE NOMBRES Y NO UNA REGLA. Una lista de apellidos
// («zhang», «li», «yan»…) es una regla disfrazada y rompe por los dos lados:
// "Yan Cabral" es brasileño y ahí «Yan» es nombre de pila, y "Te Edwards" sale
// bien hoy porque su «Te» tampoco es partícula, mientras que el «Te» de "James
// Te Huna" sí lo es. Ninguna regla automática separa "Li Jingliang" (apellido
// delante) de "Kevin Lee" (apellido detrás). Así que no se adivina: se cuenta,
// se lee y se escribe el nombre entero.
//
// EVIDENCIA MECÁNICA de que el orden es apellido-nombre, sin conocimiento
// externo: cuatro luchadores distintos de esta base comparten «Zhang» como
// primera palabra (Lipeng, Mingyang, Tiequan, Weili) y sus segundas palabras
// son únicas. Una palabra repetida en cuatro personas sin relación es un
// apellido. Igual con «Song» (Kenan, Yadong) y «Wang» (Cong, Guan).
//
// LO QUE NO ENTRA, y es deliberado: los 14 casos de doble apellido hispano,
// brasileño y mongol (Cortes Acosta, Conejo Ruiz, Batgerel Danaa…). Ahí no hay
// un error medible sino una convención discutible —cuál de los dos apellidos
// usa la prensa—, y esta lista es para lo que está mal, no para lo que es
// opinable. Quedan escritos en la continuación del 15-ago.
//
// AL ENTRAR UN LUCHADOR NUEVO ESTA LISTA ENVEJECE. `npm run apellidos` vuelve a
// pasar la función por la base entera y saca los que no están aquí.
export const APELLIDO_REVISADO = new Map<string, string>([
  // Orden asiático: el apellido va delante (20).
  ["li jingliang", "Li"],
  ["song yadong", "Song"],
  ["zhang weili", "Zhang"],
  ["yan xiaonan", "Yan"],
  ["song kenan", "Song"],
  ["wang cong", "Wang"],
  ["wu yanan", "Wu"],
  ["zhang mingyang", "Zhang"],
  ["xiao long", "Xiao"],
  ["liang na", "Liang"],
  ["zhang lipeng", "Zhang"],
  ["zhang tiequan", "Zhang"],
  ["yao zhikui", "Yao"],
  ["hu yaozong", "Hu"],
  ["shi ming", "Shi"],
  ["feng xiaocan", "Feng"],
  ["wang guan", "Wang"],
  ["ding meng", "Ding"],
  ["zhu kangjie", "Zhu"],
  ["kwon won il", "Kwon"],
  // Partícula polinesia: el apellido es «Te Huna» entero. NO se mete "te" en
  // PARTICULAS porque "Te Edwards" (id 7733) sale bien hoy y se rompería.
  ["james te huna", "Te Huna"],
  // Conector «e» dentro del apellido compuesto. Tampoco se arregla con regla:
  // con «arrastra si la anterior es conector», "Pedro e Silva" devolvería el
  // nombre entero. Es el único caso de la base.
  ["tiago dos santos e silva", "dos Santos e Silva"],
  // «de los» escrito pegado. No lo caza ningún criterio de partícula: «Delos»
  // tiene cinco letras y va en mayúscula.
  ["jon delos reyes", "Delos Reyes"],
]);

// 🪤 Y el agujero SIMÉTRICO, que se abrió al tapar el de las partículas: la
// regla miraba hacia atrás pero nunca hacia delante, así que si la última
// palabra era un sufijo lo devolvía como apellido. «Khalil Rountree Jr.» daba
// «Jr.», y el bloque publicaba un titular entero sobre alguien llamado Jr.
// Medido: 68 combates de los 8.612 que pintan el bloque.
//
// La solución NO es quitar el sufijo: en «Antonio Carlos Junior» o «Mario Neto»
// el sufijo ES parte del nombre con el que se le conoce. Se arrastra la palabra
// de delante, igual que con las partículas, y así salen bien los dos idiomas:
// «Rountree Jr.» y «Carlos Junior».
//
// Los cinco son los que existen de verdad en la base, contados el 11-ago: jr.
// (9 luchadores), neto (2), junior (2), iii (1) y filho (1). No se inventan
// sufijos que nadie tiene.
const SUFIJOS = new Set([
  "jr", "jr.", "sr", "sr.", "ii", "iii", "iv",
  "junior", "júnior", "filho", "neto", "netto",
]);

const NUMEROS = [
  "cero", "un", "dos", "tres", "cuatro", "cinco",
  "seis", "siete", "ocho", "nueve", "diez",
];

/**
 * El apellido con el que se nombra a un luchador en una frase.
 *
 * Primero la lista revisada a mano (`APELLIDO_REVISADO`), porque hay 23 nombres
 * en los que ninguna regla acierta; después las reglas, que cubren el resto.
 */
export function displayLastName(fullName: string | null | undefined): string {
  const partes = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) {
    return "";
  }
  const revisado = APELLIDO_REVISADO.get(partes.join(" ").toLowerCase());
  if (revisado !== undefined) {
    return revisado;
  }
  return porReglas(fullName);
}

/**
 * `displayLastName` SIN la lista revisada. No se usa en producción: existe para
 * que el test pueda exigir que ninguna entrada de la lista sobre, o sea que
 * cada una cambie de verdad el resultado. Sin esa comprobación la lista se
 * llena de nombres que la regla ya hacía bien y deja de saberse cuáles hacen
 * falta — y peor: una entrada podría estar tapando un arreglo de la regla.
 */
export function porReglas(fullName: string | null | undefined): string {
  const partes = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) {
    return "";
  }
  if (partes.length === 1) {
    return partes[0];
  }
  let inicio = partes.length - 1;
  // Un sufijo no es un apellido: se arrastra la palabra de delante y se queda
  // dentro. En un nombre de dos palabras ("Mario Neto") eso llega hasta el
  // principio, que es justo lo correcto.
  if (SUFIJOS.has(partes[inicio].toLowerCase())) {
    inicio -= 1;
  }
  // Mientras la palabra de delante sea partícula, se arrastra hacia atrás:
  // "de la Rocha" lleva dos seguidas. Nunca se come el nombre de pila.
  while (inicio > 1 && PARTICULAS.has(partes[inicio - 1].toLowerCase())) {
    inicio -= 1;
  }
  return partes.slice(inicio).join(" ");
}

/**
 * Una diferencia de tiempo en palabras que se puedan imaginar.
 *
 * Nunca mm:ss: "1:02" hay que dividirlo mentalmente, "un minuto" se ve. Se
 * redondea a la media unidad más cercana, que es la resolución a la que un
 * lector distingue algo.
 */
export function grappleGapWords(seconds: number): string {
  const medios = Math.max(1, Math.round(seconds / 30));
  const minutos = Math.floor(medios / 2);
  const conMedio = medios % 2 === 1;
  if (minutos === 0) {
    return "medio minuto";
  }
  if (minutos === 1) {
    return conMedio ? "minuto y medio" : "un minuto";
  }
  // A partir de diez la palabra deja de ayudar: la mayor diferencia real de la
  // base son 21,6 minutos, y "21" se lee mejor que "veintiún".
  const cuerpo = `${minutos <= 10 ? NUMEROS[minutos] : minutos} minutos`;
  return conMedio ? `${cuerpo} y medio` : cuerpo;
}

// Cuánto del combate se peleó agarrado, EN PORCENTAJE.
//
// 🪤 TERCERA VERSIÓN DE ESTA FUNCIÓN, y las dos anteriores se cayeron por el
// mismo motivo: decían el agarre en minutos redondeados. Eso obligaba a que
// convivieran DOS ESCALAS DE REDONDEO en la misma tarjeta —la del titular, que
// va a medias unidades de 30 s, y la del subtítulo, a minutos enteros— y las
// frases resultantes se desmentían entre sí. Los mismos 36 segundos salían
// como «medio minuto» arriba y «casi un minuto» abajo, con «0:36» en la
// tercera línea. Dos revisiones adversariales, diez fallos confirmados, y cada
// parche abría un caso nuevo: 452 combates con «casi todo el combate se peleó
// agarrado» sobre un tercio real, 1.066 con «1 de los 15 minutos se pelearon»,
// 2.383 publicando más duración de la que tuvo el combate.
//
// El porcentaje no tiene escala que colisionar, no tiene singular ni plural
// que concordar, y es lo que pide la regla 3 de la especificación al pie de la
// letra: «Porcentaje antes que segundos. "58 % del combate" se entiende;
// "232 segundos" hay que dividirlo mentalmente.»
//
// Devuelve la frase SIN punto: el titular la usa tal cual y el subtítulo le
// añade el suyo.
// 🪤 El porcentaje NO se recalcula aquí: se toma del MISMO reparto que pinta la
// barra. Antes esta función redondeaba por su cuenta —round((rojo+azul)/total)—
// mientras la barra redondeaba cada esquina por separado, y las dos cifras del
// mismo dato salían distintas a tres líneas de distancia: en 4296 la frase decía
// «El 63 %» sobre una barra de 27 % + 37 %. Eran 1.531 combates. Misma lección
// que fight-result.ts: una regla, un sitio.
//
// Y por eso ya no existe la rama «Menos del 1 %»: es inalcanzable por
// construcción. `repartirPorcentajes` pone un suelo de 1 a toda parte con
// segundos medidos, así que si alguien sujetó algo el porcentaje agarrado vale
// 1 como mínimo. El cero que no es cero lo impide ahora el reparto, que es
// donde tiene que impedirse.
function fraseDelAgarre(grappledPercent: number): string {
  return `El ${grappledPercent} % del combate se peleó agarrado`;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// La diferencia entre los dos, en palabras — salvo cuando el redondeo al alza
// se pasaría de lo que hay.
//
// 🪤 grappleGapWords redondea a medias unidades de 30 s, así que 45 segundos
// de diferencia se dicen «un minuto». El techo NO es la duración del combate
// sino EL AGARRE TOTAL: la diferencia sale de ahí, no de la pelea. En 11949
// (Ruffy 45 s, Fiziev 0 s, combate de 570 s) el titular decía «un minuto más»
// sobre un agarre entero de 0:45; con el techo de la duración no saltaba
// porque 60 cabe en 570. Son 801 combates de la base.
//
// Cuando la palabra no cabe se dice el reloj exacto: feo, pero nunca falso.
function diferenciaEnTexto(gap: number, grappledSeconds: number): string {
  const segundosQueImplicaLaPalabra = Math.max(1, Math.round(gap / 30)) * 30;
  return segundosQueImplicaLaPalabra <= grappledSeconds
    ? grappleGapWords(gap)
    : formatControlTime(gap);
}

type Familia = "unanime" | "jueces" | "final" | "otro";

// Familia del desenlace, para que la nota no afirme nada falso.
//
// 🪤 "Los tres jueces vieron ganar a X" es falso en 932 combates de la base:
// 828 decisiones divididas y 104 mayoritarias, donde por definición al menos
// un juez vio ganar al otro.
//
// 🪤 Y "lo acabó en el asalto N" es falso en las 23 descalificaciones: al
// combate lo acaba el árbitro, no el rival.
function familiaDelMetodo(method: string | null): Familia {
  const key = (method ?? "").trim().toUpperCase();
  if (key.startsWith("U-DEC")) {
    return "unanime";
  }
  if (key.startsWith("S-DEC") || key.startsWith("M-DEC")) {
    return "jueces";
  }
  if (key.startsWith("KO") || key.startsWith("TKO") || key.startsWith("SUB")) {
    return "final";
  }
  return "otro";
}

// Cómo se cuenta el desenlace detrás de "y aun así perdió: ".
function comoGano(
  familia: Familia,
  ganador: string,
  endRound: number | null,
): string {
  if (familia === "unanime") {
    return `los tres jueces vieron ganar a ${ganador}.`;
  }
  if (familia === "jueces") {
    return `los jueces vieron ganar a ${ganador}.`;
  }
  if (familia === "final" && endRound != null) {
    return `${ganador} lo acabó en el asalto ${endRound}.`;
  }
  return `ganó ${ganador}.`;
}

// La misma información, como frase suelta detrás de la nota N3.
function quienDecidio(
  familia: Familia,
  ganador: string,
  endRound: number | null,
): string {
  if (familia === "unanime" || familia === "jueces") {
    return "Quién ganó lo decidieron los jueces.";
  }
  if (familia === "final" && endRound != null) {
    return `${ganador} lo acabó en el asalto ${endRound}.`;
  }
  return `Ganó ${ganador}.`;
}

export function buildFightHeadline(input: HeadlineInput): FightHeadline | null {
  const split = computeGripSplit(
    input.redControlSeconds,
    input.blueControlSeconds,
    input.fightSeconds,
  );
  // Sin dato de agarre no hay bloque. Es la regla de la casa: un ratio sin
  // denominador es null y no se pinta.
  if (!split) {
    return null;
  }

  const red = displayLastName(input.redName);
  const blue = displayLastName(input.blueName);
  // Sin nombre no hay frase: "lo tuvo sujeto un minuto más que " se corta a
  // mitad. Misma regla que el ratio sin denominador — no se publica.
  if (!red || !blue) {
    return null;
  }

  const grappled = computeGrappledSplit(split.redSeconds, split.blueSeconds);
  const gap = Math.abs(split.redSeconds - split.blueSeconds);

  // Quién sujetó más, y con qué nombre se le llama.
  const mayorEsRojo = split.redSeconds > split.blueSeconds;
  const mayor = mayorEsRojo ? red : blue;
  const menor = mayorEsRojo ? blue : red;
  const ganador = input.winner === "red" ? red : input.winner === "blue" ? blue : null;
  const familia = familiaDelMetodo(input.method);

  // 🪤 La diferencia se calcula UNA SOLA VEZ y de aquí beben el titular y la
  // nota. Antes cada uno la formateaba por su cuenta —el titular con el
  // guardarraíl, la nota con grappleGapWords en crudo— y en el combate 5117
  // los mismos 227 s salían como «3:47» arriba y «cuatro minutos» abajo, que
  // además son más segundos que todo el combate. Es la misma lección que
  // fight-result.ts: una regla, un sitio.
  const diferencia = grappled
    ? diferenciaEnTexto(gap, grappled.grappledSeconds)
    : null;

  let headline: string;
  let subhead: string;

  if (!grappled) {
    // 167 combates de 8.612 se pelean sin que ninguno llegue a sujetar. Sin
    // número de minutos: con un KO en el primer minuto la plantilla imprimía
    // "en los 1 minutos", y la duración ya está bajo la barra.
    headline = "Nadie sujetó a nadie en todo el combate";
    subhead = "Los dos pelearon sin llegar a sujetarse ni un segundo.";
  } else if (gap >= GAP_MINIMO_SEGUNDOS) {
    headline = `${mayor} lo tuvo sujeto ${diferencia} más que ${menor}`;
    subhead = `${fraseDelAgarre(split.redPercent + split.bluePercent)}.`;
  } else {
    // Sin diferencia que contar, el titular dice el hecho principal.
    headline = capitalizar(
      fraseDelAgarre(split.redPercent + split.bluePercent),
    );
    // 🪤 El subtítulo ENUNCIA los dos tiempos y no juzga si se parecen. Decir
    // «los dos sujetaron casi lo mismo» era un juicio, y se rompía por los dos
    // extremos: con uno a cero (1.083 combates) y con repartos de 7 a 1 —el
    // combate 6819, Kattar 5 s contra Fishgold 33 s, lo publicaba junto a
    // «Fishgold se llevó el 87 %»—. Un hecho no puede contradecir a otro hecho.
    //
    // Y van en orden rojo, azul: la frase tiene que casar con la barra, donde
    // el rojo está siempre a la izquierda.
    subhead = `${red} lo tuvo sujeto ${formatControlTime(
      split.redSeconds,
    )} y ${blue} ${formatControlTime(split.blueSeconds)}.`;
  }

  let grappledLine: string | null = null;
  if (grappled) {
    const reloj = formatControlTime(grappled.grappledSeconds);
    grappledLine =
      grappled.leader === null
        ? `De los ${reloj} que alguno sujetó, se lo repartieron mitad y mitad.`
        : `De los ${reloj} que alguno sujetó, ${
            grappled.leader === "red" ? red : blue
          } se llevó el ${grappled.leaderPercent} %.`;
  }

  // La nota N1 solo cabe cuando hay una diferencia que contar Y el que más
  // sujetó perdió. Es un HECHO comprobable, no un descargo: el maquetado
  // original decía "sujetar no es ganar: esto no mide quién pegó", dos
  // negaciones sobre nuestros propios datos que se leen como "esta web no es
  // fiable". El hecho enseña lo mismo mostrándolo.
  const masAgarreYPerdio =
    grappled !== null &&
    grappled.leader !== null &&
    ganador !== null &&
    gap >= GAP_MINIMO_SEGUNDOS &&
    mayor !== ganador;

  let note: string;
  if (masAgarreYPerdio && ganador) {
    note = `${mayor} lo tuvo sujeto ${diferencia} más y aun así perdió: ${comoGano(
      familia,
      ganador,
      input.endRound,
    )}`;
  } else {
    const base = "Esto cuenta dónde se peleó el combate: agarrados o de pie.";
    // 156 combates disputados no tienen ganador (64 empates y 92 anulados):
    // ahí no cabe ni "ganó" ni "perdió".
    note = ganador
      ? `${base} ${quienDecidio(familia, ganador, input.endRound)}`
      : base;
  }

  return { headline, subhead, grappledLine, note };
}
