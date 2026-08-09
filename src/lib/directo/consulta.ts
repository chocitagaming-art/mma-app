import { sql } from "@/lib/db";

// EL CONTROL ROOM DEL DIRECTO. Todo SELECT.
//
// EN QUÉ SE DIFERENCIA DE `/estado`, que es la pregunta obvia: `/estado` es el
// despacho de administración —¿está el catálogo, las fotos, los crons de la
// semana?— y responde a "¿el sitio está sano?". Esto responde a otra cosa muy
// distinta y sólo importa unas horas a la semana: **¿se está grabando AHORA?**
//
// 🪤 Y LA TRAMPA QUE LO HIZO NECESARIO, que además es de esta misma web: la
// franja roja de EN DIRECTO se enciende POR RELOJ (`lib/live-event.ts`, desde
// 30 min antes del primer combate hasta 8 h después del estelar). Está roja
// aunque no entre un solo dato. El 8-ago-2026, con ESPN devolviendo 403 a los
// scrapers, la franja habría salido roja toda la noche mientras la velada se
// perdía entera. **Aquí no se pinta ni un indicador por reloj: todo está medido
// contra lo que hay escrito en la base.**
//
// LO QUE ESTE PANEL NO PUEDE VER, y hay que decirlo en voz alta: la web sólo
// tiene DATABASE_URL, no habla con GitHub Actions. Así que sabe decir "no entra
// dato" pero no "porque el bucle murió a las 23:12". Para eso está el despacho
// de terminal (`Projects/despacho/`), que ve los dos mundos. Este panel es el
// que se mira desde el móvil sin encender el ordenador.

/**
 * 🪤 POR QUÉ HAY TRES NIVELES VERDES Y NO UNO. Lo cazó el dueño mirando su
 * propia web: el panel ponía **GRABANDO** en letras grandes, con el subtítulo
 * «Está entrando dato», trece horas después de terminar la velada — y tres
 * líneas más abajo, en la misma pantalla, «Velada terminada y grabada».
 *
 * El veredicto de dentro era correcto; la palabra de fuera mentía. `grabando`
 * servía para tres situaciones que sólo se parecen en que van bien:
 *
 *     grabando  · hay un asalto rodando y entra dato AHORA
 *     pausa     · nadie peleando; el contador parado es lo normal
 *     grabada   · la velada terminó y quedó grabada
 *
 * Es el mismo pecado que G4 y G5 por la puerta de atrás: **un panel que se
 * contradice en la misma pantalla deja de creerse.** Si la palabra grande no
 * es cierta a solas, sobra el resto de la página.
 */
export type NivelDirecto =
  | "sin-velada" | "esperando" | "grabando" | "pausa" | "grabada"
  | "atencion" | "perdiendose";

export type Directo = {
  nivel: NivelDirecto;
  generadoUtc: string;
  /** Con la ventana abierta el panel se refresca cada 15 s en vez de cada 60. */
  ventanaAbierta: boolean;
  /**
   * Hay un asalto rodando AHORA (mismo criterio que el escritor: `state='in'`
   * y `period >= 1`). Sale a la superficie porque la página lo necesita para
   * pintar los tonos: sin él, las filas de "Muestras" y "Ritmo" se ponen rojas
   * entre combates mientras el veredicto grande dice que todo va bien.
   */
  asaltoRodando: boolean;
  evento: EventoDirecto | null;
  grabacion: Grabacion | null;
  enCurso: BoutEnCurso | null;
  resultados: Resultados | null;
  parte: string[];
};

export type EventoDirecto = {
  id: number;
  nombre: string;
  primerCombateUtc: string | null;
  estelarUtc: string | null;
  /** Segundos hasta el primer combate. Negativo si ya empezó. */
  faltanSegundos: number | null;
};

export type Grabacion = {
  muestras: number;
  peleasConPelicula: number;
  filasVivas: number;
  ultimaEscrituraUtc: string | null;
  /** Segundos desde la última escritura. El corazón del directo. */
  silencioSegundos: number | null;
  /** Muestras en los últimos 5 minutos: distingue "graba" de "grabó y se paró". */
  ritmo5min: number;
};

export type BoutEnCurso = {
  rojo: string | null;
  azul: string | null;
  detalle: string | null;
  asalto: number | null;
  reloj: string | null;
};

export type Resultados = { total: number; conGanador: number; conMetodo: number };

// El bucle escribe cada 20 s. Dos pasadas de margen antes de extrañarse, seis
// antes de dar por parado el corazón. Por debajo de eso saltaría con cualquier
// hipo de red, y una alarma que salta sola enseña a no mirar las alarmas.
//
// ⚠️ Estos dos umbrales SOLO valen con un asalto rodando. Entre combates el
// contador se para por diseño y estos números darían un rojo cada diez minutos.
const SILENCIO_RARO_S = 60;
const SILENCIO_MALO_S = 180;

// Cuánto puede durar una pausa LEGÍTIMA sin que nadie escriba nada.
//
// 🪤 EL FALLO QUE ESTO ARREGLA (G4 y G5, medidos en el 1087 la noche del
// 8-ago). El escritor solo graba muestras con un asalto rodando
// (`live_stats.py:117`, `period >= 1`). El panel no lo sabía y leía cualquier
// contador parado como avería:
//
//     entre cada par de combates ... 11 huecos por velada  (~168 min de rojo)
//     los paseíllos del primero  ...  1 hueco             (~34 min de rojo)
//     ------------------------------------------------------------------
//     total en una velada de 5 h 21 min ... ~202 min = MÁS DEL 60 % DEL TIEMPO
//
// Y esa noche grabó perfecta. Un panel que grita nueve veces en falso deja de
// mirarse, que es exactamente lo que este panel nació para evitar.
//
// Medido: los huecos entre peleas duran ~10 min, y ESPN tardó 14 min en pasar
// de `Pre-fight` a `R1` en el primer combate. 25 min cubre los dos con margen.
// Por encima ya no es una pausa: es que el bucle se ha muerto.
const PAUSA_ESPERADA_MAX_S = 25 * 60;

// Margen de gracia del arranque. La ventana se abre 20 min antes del primer
// combate y ESPN tarda otro cuarto de hora en pasar de `Pre-fight` a `R1`
// (medido el 8-ago: 21:06Z Pre-fight, 21:10Z Walkouts, 21:14Z R1, primera
// muestra 24 s después). Cero muestras dentro de esa franja es lo normal, no
// una avería.
const GRACIA_ARRANQUE_S = 15 * 60;

// Referencias MEDIDAS, no elegidas: el 1062 del 25-jul hizo 345 muestras en una
// velada entera y se considera el patrón bueno; el 1063 del 1-ago se quedó en 14
// y se dio por perdido.
const MUESTRAS_EXITO = 250;
const MUESTRAS_PERDIDA = 50;

// La ventana tiene FIN, y olvidarlo es un rojo falso garantizado: sin él,
// cualquier velada pasada diría "el corazón se ha parado" el domingo por la
// mañana. Se midió contra el 1062, que salió perfecto y aun así gritaba.
// 6 h desde el estelar = el relevo más largo (235 min) más margen.
const CIERRE_VENTANA_H = 6;
const APERTURA_VENTANA_MIN = 20;

type FilaEvento = {
  id: number;
  name: string | null;
  early_prelims_time: string | Date | null;
  prelims_time: string | Date | null;
  start_time: string | Date | null;
};

type FilaGrabacion = {
  muestras: string;
  peleas: string;
  ultima: string | Date | null;
  ritmo: string;
};

type FilaResultados = { total: string; ganador: string; metodo: string };

type FilaEnCurso = {
  status_detail: string | null;
  period: number | null;
  display_clock: string | null;
  rojo: string | null;
  azul: string | null;
  /** 'in' o 'post'. Con `period` decide si hay un asalto rodando AHORA. */
  state: string | null;
  /** Última vez que el bucle tocó una fila viva. El pulso entre combates. */
  updated_at: string | Date | null;
};

// La velada que toca vigilar: la más cercana en el tiempo, mirando un día atrás
// y dos adelante. El día atrás no es capricho — a las 02:00 de la madrugada la
// velada "de ayer" sigue siendo la de ahora, que es justo cuando se abre esto.
const EVENTO_SQL = `
  SELECT id, name, early_prelims_time, prelims_time, start_time
  FROM events
  WHERE event_date BETWEEN (NOW() - INTERVAL '1 day')::date
                       AND (NOW() + INTERVAL '2 day')::date
  ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(start_time, event_date::timestamptz) - NOW())))
  LIMIT 1`;

// Los contadores van a ::text a propósito: `COUNT(*)` es bigint y el driver lo
// devuelve como string para no perder precisión. Convertirlo aquí evita que
// media aplicación acabe haciendo Number() sobre algo que a veces es number.
const GRABACION_SQL = `
  SELECT
    COUNT(*)::text                   AS muestras,
    COUNT(DISTINCT s.fight_id)::text AS peleas,
    MAX(s.sampled_at)                AS ultima,
    COUNT(*) FILTER (
      WHERE s.sampled_at > NOW() - INTERVAL '5 minutes'
    )::text                          AS ritmo
  FROM live_fight_stat_samples s
  JOIN fights f ON f.id = s.fight_id
  WHERE f.event_id = $1`;

const VIVAS_SQL = `
  SELECT COUNT(*)::text AS n
  FROM live_fight_stats l
  JOIN fights f ON f.id = l.fight_id
  WHERE f.event_id = $1`;

const RESULTADOS_SQL = `
  SELECT COUNT(*)::text                                       AS total,
         COUNT(*) FILTER (WHERE winner_id IS NOT NULL)::text  AS ganador,
         COUNT(*) FILTER (WHERE method IS NOT NULL)::text     AS metodo
  FROM fights
  WHERE event_id = $1`;

// La última fila viva que tocó el bucle: es lo más parecido a "qué se está
// peleando ahora" que hay en la base, porque `fights` no guarda estado en vivo.
//
// Se piden `state` y `updated_at` aunque no se pinten: son el discriminador del
// veredicto. Ordena por `updated_at`, así que esta fila trae además el pulso más
// reciente de todo el evento. 🪤 Ya se ordenaba por esa columna sin traerla: el
// panel tenía el dato a un carácter de distancia y gritaba igual.
const EN_CURSO_SQL = `
  SELECT l.status_detail, l.period, l.display_clock, l.state, l.updated_at,
         rf.name AS rojo, bf.name AS azul
  FROM live_fight_stats l
  JOIN fights f ON f.id = l.fight_id
  LEFT JOIN fighters rf ON rf.id = f.fighter_red_id
  LEFT JOIN fighters bf ON bf.id = f.fighter_blue_id
  WHERE f.event_id = $1
  ORDER BY l.updated_at DESC NULLS LAST
  LIMIT 1`;

function aIso(v: string | Date | null): string | null {
  if (v == null) return null;
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

/**
 * La velada que toca vigilar: la más cercana en el tiempo, mirando un día atrás
 * y dos adelante. El día atrás no es capricho: a las 02:00 de la madrugada la
 * velada "de ayer" sigue siendo la de ahora, y ese es justo el momento en que
 * alguien abre este panel.
 */
async function eventoDeAhora(): Promise<FilaEvento | null> {
  const filas = await sql<FilaEvento>(EVENTO_SQL);
  return filas[0] ?? null;
}

export async function obtenerDirecto(): Promise<Directo> {
  const ahora = new Date();
  const generadoUtc = ahora.toISOString();
  const ev = await eventoDeAhora();

  if (!ev) {
    return {
      nivel: "sin-velada", generadoUtc, ventanaAbierta: false, asaltoRodando: false,
      evento: null, grabacion: null, enCurso: null, resultados: null,
      parte: ["No hay ninguna velada cerca. Nada que vigilar."],
    };
  }

  const primero = ev.early_prelims_time ?? ev.prelims_time ?? ev.start_time;
  const primeroMs = primero ? new Date(primero).getTime() : null;
  const estelarMs = ev.start_time ? new Date(ev.start_time).getTime() : primeroMs;

  const abre = primeroMs != null ? primeroMs - APERTURA_VENTANA_MIN * 60_000 : null;
  const cierra = estelarMs != null ? estelarMs + CIERRE_VENTANA_H * 3_600_000 : null;
  const ventanaAbierta =
    abre != null && cierra != null && ahora.getTime() >= abre && ahora.getTime() <= cierra;
  const yaTermino = cierra != null && ahora.getTime() > cierra;

  // Las cuatro a la vez: son independientes y el panel se refresca cada 15 s
  // durante una velada. En serie, cuatro idas y vueltas a Neon por refresco.
  const [[gr], [vivas], [res], [curso]] = await Promise.all([
    sql<FilaGrabacion>(GRABACION_SQL, [ev.id]),
    sql<{ n: string }>(VIVAS_SQL, [ev.id]),
    sql<FilaResultados>(RESULTADOS_SQL, [ev.id]),
    sql<FilaEnCurso>(EN_CURSO_SQL, [ev.id]),
  ]);

  const muestras = Number(gr?.muestras ?? 0);
  const ultimaIso = aIso(gr?.ultima ?? null);
  const silencioSegundos =
    ultimaIso == null ? null : Math.floor((ahora.getTime() - new Date(ultimaIso).getTime()) / 1000);
  const ritmo = Number(gr?.ritmo ?? 0);

  const grabacion: Grabacion = {
    muestras,
    peleasConPelicula: Number(gr?.peleas ?? 0),
    filasVivas: Number(vivas?.n ?? 0),
    ultimaEscrituraUtc: ultimaIso,
    silencioSegundos,
    ritmo5min: ritmo,
  };

  // El mismo criterio que usa el escritor para grabar (`live_stats.py:117`).
  // Que el panel y el escritor juzguen igual es todo el arreglo de G4 y G5.
  const asaltoRodando = curso?.state === "in" && (curso?.period ?? 0) >= 1;
  const vivaIso = aIso(curso?.updated_at ?? null);
  const silencioVivasSegundos =
    vivaIso == null ? null : Math.floor((ahora.getTime() - new Date(vivaIso).getTime()) / 1000);

  const faltanSegundos =
    primeroMs == null ? null : Math.round((primeroMs - ahora.getTime()) / 1000);
  const combatesTotales = Number(res?.total ?? 0);
  const combatesConMetodo = Number(res?.metodo ?? 0);
  const combatesConGanador = Number(res?.ganador ?? 0);

  const { nivel, parte } = decidir({
    ventanaAbierta, yaTermino, muestras, ritmo, silencioSegundos,
    faltanSegundos, asaltoRodando, silencioVivasSegundos,
    combatesTotales, combatesConMetodo, combatesConGanador,
  });

  return {
    nivel, generadoUtc, ventanaAbierta, asaltoRodando,
    evento: {
      id: ev.id,
      nombre: ev.name ?? `Evento ${ev.id}`,
      primerCombateUtc: aIso(primero),
      estelarUtc: aIso(ev.start_time),
      faltanSegundos,
    },
    grabacion,
    enCurso: curso
      ? {
          rojo: curso.rojo, azul: curso.azul, detalle: curso.status_detail,
          asalto: curso.period, reloj: curso.display_clock,
        }
      : null,
    resultados: {
      total: Number(res?.total ?? 0),
      conGanador: Number(res?.ganador ?? 0),
      conMetodo: Number(res?.metodo ?? 0),
    },
    parte,
  };
}

/**
 * El veredicto. Vive separado y sin tocar la base para poder probarlo entero
 * sin Postgres: son las ramas que sólo se ejercitan una noche a la semana, y
 * esas son justo las que nadie prueba nunca.
 *
 * LA REGLA QUE LO ORDENA TODO, y que faltaba: **el panel y el escritor tienen
 * que juzgar con el mismo criterio**. El escritor solo graba con un asalto
 * rodando (`live_stats.py:117`, `period >= 1`); el panel leía cualquier
 * contador parado como avería. De ahí los ~202 min de rojo falso por velada.
 *
 * Así que primero se pregunta si hay alguien peleando, y sólo entonces se
 * exige que el contador suba.
 */
export function decidir(d: {
  ventanaAbierta: boolean;
  yaTermino: boolean;
  muestras: number;
  ritmo: number;
  silencioSegundos: number | null;
  /** Segundos hasta el primer combate. Negativo si ya empezó. */
  faltanSegundos?: number | null;
  /** Hay un asalto rodando AHORA. Mismo criterio que el escritor. */
  asaltoRodando?: boolean;
  /**
   * Segundos desde que el bucle tocó una fila viva por última vez. Es el pulso
   * que sigue latiendo entre combates, cuando ya no se escriben muestras: en
   * los paseíllos ESPN da `state='in'` con `period=0` y el bucle sí escribe.
   */
  silencioVivasSegundos?: number | null;
  /** Combates del cartel y cuántos están resueltos. Detecta el final por DATO. */
  combatesTotales?: number;
  combatesConMetodo?: number;
  combatesConGanador?: number;
}): { nivel: NivelDirecto; parte: string[] } {
  const {
    ventanaAbierta, muestras, ritmo, silencioSegundos,
    faltanSegundos = null,
    asaltoRodando = false,
    silencioVivasSegundos = null,
    combatesTotales = 0,
    combatesConMetodo = 0,
    combatesConGanador = 0,
  } = d;

  // El cartel está entero aunque el reloj de la ventana siga abierto. Es el
  // mismo principio que rige este panel —medir por dato, no por reloj—
  // aplicado también al final: sin esto, una velada perfecta seguía en rojo
  // las horas que quedaban de ventana.
  //
  // Se mira el MAYOR de los dos contadores, no sólo el método, y hay una razón
  // medida: rebobinando la noche del 1087 minuto a minuto, exigir el método
  // dejaba el panel en rojo desde las 03:01 hasta el cierre de la ventana —
  // tres horas gritando por una velada que había terminado bien. El método del
  // primer combate no llegó hasta las 05:50, pero a las 02:39 ya había ganador
  // en los doce. Al revés también pasa: un empate o un no-contest tienen método
  // y NO tienen ganador, así que ninguno de los dos contadores vale solo.
  const cartelCompleto =
    combatesTotales > 0 &&
    Math.max(combatesConGanador, combatesConMetodo) >= combatesTotales;
  const yaTermino = d.yaTermino || cartelCompleto;

  if (yaTermino) {
    if (muestras >= MUESTRAS_EXITO) {
      return { nivel: "grabada", parte: [`Velada terminada y grabada: ${muestras} muestras. Salió bien.`] };
    }
    if (muestras >= MUESTRAS_PERDIDA) {
      return { nivel: "atencion", parte: [`Velada terminada, grabada a medias: ${muestras} muestras (la referencia buena son ${MUESTRAS_EXITO}).`] };
    }
    return { nivel: "perdiendose", parte: [`Velada terminada y PERDIDA: sólo ${muestras} muestras. Hay que averiguar en qué eslabón se cortó.`] };
  }

  if (!ventanaAbierta) {
    return { nivel: "esperando", parte: ["La velada no ha empezado. Nada que grabar todavía."] };
  }

  // Ventana abierta: aquí es donde este panel se gana el sueldo.

  // ── ¿Hay alguien peleando? ──────────────────────────────────────────────
  // Es la pregunta que separa "no entra dato" de "no hay dato que entrar", y
  // es la que faltaba. Sin ella, los paseíllos y los huecos entre combates se
  // leían como avería.
  if (!asaltoRodando) {
    // El pulso: entre combates ya no se escriben muestras, pero el bucle sí
    // sigue tocando la fila viva mientras ESPN dé `state='in'` (paseíllos).
    // Se prefiere ese pulso al de las muestras, que aquí está parado a propósito.
    const pausa = silencioVivasSegundos ?? silencioSegundos;

    if (pausa != null && pausa > PAUSA_ESPERADA_MAX_S) {
      // Aquí SÍ. Ninguna pausa legítima dura tanto: si el bucle hubiera muerto
      // durante los paseíllos, callar sin este límite dejaría el panel en verde
      // el resto de la noche. Es el punto ciego que crea cualquier silencio, y
      // se cierra con retraso a propósito: 25 min de espera valen menos que
      // once gritos en falso.
      return {
        nivel: "perdiendose",
        parte: [
          `Nadie está peleando y el bucle lleva ${Math.floor(pausa / 60)} min sin tocar nada.`,
          `Entre combates es normal que el contador se pare, pero no más de ${Math.floor(PAUSA_ESPERADA_MAX_S / 60)} min.`,
          "Mira si el bucle tiene runs vivos. Si el vigilante está en rojo, él ya está relanzando.",
        ],
      };
    }

    if (muestras === 0) {
      // Arranque de la velada. La ventana se abre 20 min antes y ESPN tarda
      // otro cuarto de hora en llegar a R1: cero muestras aquí es lo normal.
      const dentroDeLaGracia = faltanSegundos != null && faltanSegundos > -GRACIA_ARRANQUE_S;
      if (dentroDeLaGracia) {
        return {
          nivel: "esperando",
          parte: [
            "La velada está a punto de empezar y todavía no hay nada que grabar.",
            "ESPN tarda un cuarto de hora en pasar de las presentaciones al primer asalto.",
          ],
        };
      }
      return {
        nivel: "perdiendose",
        parte: [
          "La velada está en marcha y NO se ha escrito ni una muestra.",
          "La franja roja de la portada estará encendida igual: se enciende por reloj, no por datos.",
          "Mira si el bucle tiene runs vivos antes de tocar nada. Si el vigilante está en rojo, él ya está relanzando.",
        ],
      };
    }

    return {
      nivel: "pausa",
      parte: [
        `Entre combates: ${muestras} muestras grabadas y nadie peleando ahora mismo.`,
        "Que el contador esté parado es lo normal aquí. Vuelve a subir con el primer asalto.",
      ],
    };
  }

  // ── Hay un asalto rodando: el contador TIENE que subir ───────────────────
  if (muestras === 0) {
    return {
      nivel: "perdiendose",
      parte: [
        "Hay un asalto rodando y NO se ha escrito ni una muestra.",
        "La franja roja de la portada estará encendida igual: se enciende por reloj, no por datos.",
        "Mira si el bucle tiene runs vivos antes de tocar nada. Si el vigilante está en rojo, él ya está relanzando.",
      ],
    };
  }
  if (ritmo === 0) {
    return {
      nivel: "perdiendose",
      parte: [
        `Hay un asalto rodando y ${muestras} muestras, pero el ritmo es CERO: grabó un rato y se paró.`,
        "Un total que no crece es un total muerto.",
      ],
    };
  }
  if (silencioSegundos != null && silencioSegundos > SILENCIO_MALO_S) {
    return { nivel: "perdiendose", parte: [`Sin escribir desde hace ${Math.floor(silencioSegundos / 60)} min con un asalto rodando. Ha dejado de entrar dato.`] };
  }
  if (silencioSegundos != null && silencioSegundos > SILENCIO_RARO_S) {
    return { nivel: "atencion", parte: [`Última escritura hace ${silencioSegundos} s, y debería escribir cada 20 s. Vigílalo.`] };
  }
  return { nivel: "grabando", parte: [`Grabando: ${ritmo} muestras en los últimos 5 minutos. No hay nada que hacer.`] };
}

export const UMBRALES = {
  SILENCIO_RARO_S, SILENCIO_MALO_S, MUESTRAS_EXITO, MUESTRAS_PERDIDA,
  PAUSA_ESPERADA_MAX_S, GRACIA_ARRANQUE_S,
};
