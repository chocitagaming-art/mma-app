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

export type NivelDirecto = "sin-velada" | "esperando" | "grabando" | "atencion" | "perdiendose";

export type Directo = {
  nivel: NivelDirecto;
  generadoUtc: string;
  /** Con la ventana abierta el panel se refresca cada 15 s en vez de cada 60. */
  ventanaAbierta: boolean;
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
const SILENCIO_RARO_S = 60;
const SILENCIO_MALO_S = 180;

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
const EN_CURSO_SQL = `
  SELECT l.status_detail, l.period, l.display_clock,
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
      nivel: "sin-velada", generadoUtc, ventanaAbierta: false,
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

  const { nivel, parte } = decidir({ ventanaAbierta, yaTermino, muestras, ritmo, silencioSegundos });

  return {
    nivel, generadoUtc, ventanaAbierta,
    evento: {
      id: ev.id,
      nombre: ev.name ?? `Evento ${ev.id}`,
      primerCombateUtc: aIso(primero),
      estelarUtc: aIso(ev.start_time),
      faltanSegundos: primeroMs == null ? null : Math.round((primeroMs - ahora.getTime()) / 1000),
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
 */
export function decidir(d: {
  ventanaAbierta: boolean;
  yaTermino: boolean;
  muestras: number;
  ritmo: number;
  silencioSegundos: number | null;
}): { nivel: NivelDirecto; parte: string[] } {
  const { ventanaAbierta, yaTermino, muestras, ritmo, silencioSegundos } = d;

  if (yaTermino) {
    if (muestras >= MUESTRAS_EXITO) {
      return { nivel: "grabando", parte: [`Velada terminada y grabada: ${muestras} muestras. Salió bien.`] };
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
  if (muestras === 0) {
    return {
      nivel: "perdiendose",
      parte: [
        "La velada está en marcha y NO se ha escrito ni una muestra.",
        "La franja roja de la portada estará encendida igual: se enciende por reloj, no por datos.",
        "Mira si el bucle tiene runs vivos antes de tocar nada. Si el vigilante está en rojo, él ya está relanzando.",
      ],
    };
  }
  if (ritmo === 0) {
    return {
      nivel: "perdiendose",
      parte: [
        `Hay ${muestras} muestras pero el ritmo es CERO: grabó un rato y se paró.`,
        "Un total que no crece es un total muerto.",
      ],
    };
  }
  if (silencioSegundos != null && silencioSegundos > SILENCIO_MALO_S) {
    return { nivel: "perdiendose", parte: [`Sin escribir desde hace ${Math.floor(silencioSegundos / 60)} min. Ha dejado de entrar dato.`] };
  }
  if (silencioSegundos != null && silencioSegundos > SILENCIO_RARO_S) {
    return { nivel: "atencion", parte: [`Última escritura hace ${silencioSegundos} s, y debería escribir cada 20 s. Vigílalo.`] };
  }
  return { nivel: "grabando", parte: [`Grabando: ${ritmo} muestras en los últimos 5 minutos. No hay nada que hacer.`] };
}

export const UMBRALES = { SILENCIO_RARO_S, SILENCIO_MALO_S, MUESTRAS_EXITO, MUESTRAS_PERDIDA };
