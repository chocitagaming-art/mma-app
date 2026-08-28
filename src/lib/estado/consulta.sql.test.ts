import { beforeEach, describe, expect, it, vi } from "vitest";

// LA OTRA MITAD DEL PANEL DE ESTADO. `veredicto.test.ts` prueba las funciones
// puras —qué significa cada número— y ahí se acababa: nadie miraba nunca QUÉ le
// pregunta el panel a la base, ni cómo viaja la respuesta del SQL al veredicto.
//
// Y ese viaje tiene una trampa de cuatro caracteres. `num()` es
// `Number(v ?? 0) || 0`, así que convierte NULL en CERO. Con
// `minutos_sin_pulso`, NULL significa «no hay ni una fila viva: NADIE está
// grabando» y cero significa «acaban de escribir hace un instante»: el peor
// verde posible de este panel, y el fallo del 1-ago-2026 otra vez, pintado de
// verde. Por eso ese campo va con `numOrNull` y por eso está probado aquí.
//
// Calcado de `src/lib/directo/consulta.sql.test.ts`, que nació por lo mismo.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import { obtenerEstado } from "@/lib/estado/consulta";
import { eventoPrincipalSql } from "@/lib/event-tier";

const sqlMock = vi.mocked(sql);

/** La fila del turno de guardia. Por defecto: velada en marcha y todo sano. */
type FilaGuardiaCruda = Record<string, unknown>;

let filaGuardia: FilaGuardiaCruda;

/** El 1064 a mitad de velada, con los tipos que devuelve de verdad el driver. */
function guardiaEnMarcha(cambios: FilaGuardiaCruda = {}): FilaGuardiaCruda {
  return {
    arranque_utc: "2026-08-15T21:30:00.000Z",
    horas_hasta_el_arranque: "-1.2",
    velada_en_marcha: true,
    minutos_desde_el_ancla: "5",
    minutos_sin_pulso: "0.4",
    muestras_ultima_hora: "0",
    peleas_activas: "12",
    peleas_con_fila_viva: "1",
    peleas_sin_cerrar: "1",
    peleas_con_pelicula: "0",
    muestras_del_evento: "0",
    minutos_desde_el_latido_del_bucle: "0.4",
    ...cambios,
  };
}

/**
 * Contesta según QUÉ consulta llega, no según el orden: las nueve salen juntas
 * en un `Promise.all` y el orden de llegada no está garantizado.
 */
function responder(query: string): Record<string, unknown>[] {
  if (query.includes("velada_en_marcha")) return [filaGuardia];
  if (query.includes("horas_desde_el_final")) {
    return [
      {
        id: 1064,
        name: "UFC 330: Makhachev vs. Machado Garry",
        start_time: "2026-08-16T01:30:00.000Z",
        combates_activos: "12",
        combates_resueltos: "12",
        muestras: "352",
        filas_por_asalto: "66",
        pesajes: "24",
        tiene_careo: true,
        horas_desde_el_final: "13",
      },
    ];
  }
  if (query.includes("sin_foto_cuerpo_en_la_base")) {
    return [
      {
        id: 1086,
        name: "UFC Fight Night: Hernandez vs. Rodrigues",
        start_time: "2026-08-22T21:00:00.000Z",
        tiene_prelims: true,
        combates_activos: "13",
        luchadores: "26",
        sin_ficha: "0",
        sin_foto_cuerpo_en_la_base: "3",
        dias_que_faltan: "6",
        pesajes: "0",
        tiene_careo: false,
      },
    ];
  }
  if (query.includes("tiene_cuerpo")) return [];
  if (query.includes("horas_noticia")) {
    return [{ horas_noticia: "11", horas_luchador: "8", horas_combate: "8" }];
  }
  if (query.includes("horas_desde_el_latido")) return [{ horas_desde_el_latido: "0.2" }];
  if (query.includes("eventos_pasados_incompletos")) {
    return [
      {
        luchadores: "2860",
        sin_foto_cuerpo: "936",
        sin_foto_cabeza: "577",
        eventos_pasados_incompletos: "0",
      },
    ];
  }
  if (query.includes("fi.headshot_url is null")) return [];
  if (query.includes("Bucle del directo")) return [];
  throw new Error(`Consulta inesperada en el panel de estado:\n${query}`);
}

/** El nivel del bloque entero: el peor de sus comprobaciones, como en el panel. */
async function nivelDelTurnoDeGuardia(): Promise<string> {
  const estado = await obtenerEstado();
  const bloque = estado.bloques.find((b) => b.titulo === "El turno de guardia");
  if (!bloque) throw new Error("El bloque del turno de guardia no está en el panel");
  if (bloque.comprobaciones.some((c) => c.nivel === "mal")) return "mal";
  if (bloque.comprobaciones.some((c) => c.nivel === "aviso")) return "aviso";
  return "ok";
}

const consultaDeGuardia = () =>
  sqlMock.mock.calls.map(([query]) => query).find((q) => q.includes("velada_en_marcha"));

// EL FILTRO DEL EVENTO DESTACADO, y por qué se cuenta en vez de mirarlo.
//
// El 26-ago-2026 un "Road To UFC" del viernes —id 1094, 2 combates, sin sede y
// sin póster— se coló como «la próxima velada» y desplazó al UFC Fight Night
// del sábado (id 1065, 13 combates) en la portada, en /eventos, en /en-vivo, en
// /ufc-hoy y también en ESTE panel. Los dos son `promotion_id = 1`, así que la
// promotora NO los distingue: las consultas ordenaban por fecha y nada más, y
// el viernes va antes que el sábado. El arreglo vive en `events.tier`
// (migración 028) y lo lee `eventoPrincipalSql`.
//
// ⚠️ POR QUÉ UN RECUENTO Y NO UN `toContain` SUELTO. La pregunta «¿cuál es EL
// evento?» está copiada CINCO veces en este fichero y las cinco tienen que
// contestar lo mismo. Con un `toContain` bastaría con que UNA lo llevara para
// dejar el test verde, y el panel se contradiría consigo mismo en la MISMA
// pantalla: la cabecera hablando del Fight Night del sábado mientras el bloque
// de fotos cuenta las cuatro esquinas del Road To UFC. Es la misma técnica que
// el `toHaveLength(7)` de los `join` de aquí arriba, y por el mismo motivo:
// subconsulta copiada = recuento, nunca presencia.

/**
 * El predicado tal y como lo escribe `eventoPrincipalSql`, pero SIN el alias:
 * cada consulta lo pide con el suyo, y lo que hay que contar es la CONDICIÓN,
 * no el prefijo. Se deriva del módulo a propósito — si mañana se añade un tipo
 * secundario a la lista, este fichero sigue contando lo que hay, no lo que
 * había el día que se escribió.
 */
const NUCLEO_TIER = eventoPrincipalSql("e").replace(/^e\./, "");

/** Cuántas veces aparece el predicado en un SQL. La regex se construye aquí
 *  dentro para que cada llamada empiece limpia y no comparta estado con otra. */
function vecesElPredicado(query: string): number {
  const escapado = NUCLEO_TIER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (query.match(new RegExp(escapado, "gi")) ?? []).length;
}

describe("obtenerEstado · qué le pregunta el turno de guardia a la base", () => {
  beforeEach(() => {
    filaGuardia = guardiaEnMarcha();
    sqlMock.mockReset();
    sqlMock.mockImplementation((query: string) =>
      Promise.resolve(responder(query) as never),
    );
  });

  it("las muestras y el pulso se cuentan DEL EVENTO EN MARCHA, no de toda la base", async () => {
    await obtenerEstado();
    const q = consultaDeGuardia();

    expect(q).toBeDefined();
    // Las cuentas nuevas van unidas por `fights.event_id` al evento vivo. Se
    // cuentan los `join`, no basta con que aparezca uno: quitarle el filtro a
    // UNA subconsulta —justo la del pulso, que es la que devuelve 371 min de
    // ayer— dejaba la comprobación en verde. Son siete: pulso, muestras de la
    // última hora, activas, con fila viva, sin cerrar, con película y totales.
    expect(q?.match(/join en_marcha m on m\.id = f\.event_id/g)).toHaveLength(7);
    // 🪤 Y la vieja, la que contaba muestras de TODA la base, ya no está. No es
    // cosmético: `prune_live_fight_stats` conserva 48 h, así que pueden convivir
    // dos veladas, y medido HOY (16-ago, sin velada) el pulso sin filtrar
    // devuelve 351 min por las filas de ayer en vez del NULL que corresponde.
    expect(q).not.toMatch(
      /count\(\*\)\s+from\s+live_fight_stat_samples\s+s\s+where\s+s\.sampled_at/i,
    );
  });

  it("y el pulso mira `live_fight_stats`, que es lo que late en los paseíllos", async () => {
    await obtenerEstado();
    // La tabla del pulso NO aparecía en ningún punto de este panel: el bucle
    // reescribe `updated_at` en cada pasada aunque no haya muestras que guardar.
    expect(consultaDeGuardia()).toContain("from live_fight_stats l");
  });

  it("🔴 un pulso NULL llega al veredicto como null, NO como cero", async () => {
    // Ancla+5 y ni una fila viva: ESPN todavía no ha abierto el evento. Ámbar,
    // que se ve y no manda correo. Con `num()` esto sería «pulso escrito hace 0
    // minutos» y saldría VERDE con la sala a oscuras.
    filaGuardia = guardiaEnMarcha({
      minutos_sin_pulso: null,
      peleas_con_fila_viva: "0",
      peleas_sin_cerrar: "0",
    });
    expect(await nivelDelTurnoDeGuardia()).toBe("aviso");
  });

  it("🔴 y pasada la gracia, ese mismo pulso NULL es rojo", async () => {
    // El 1-ago en directo: velada en marcha, nadie grabando, y el panel tiene
    // que despertar al guardián. Con `num()` seguiría en verde.
    filaGuardia = guardiaEnMarcha({
      minutos_desde_el_ancla: "40",
      minutos_sin_pulso: null,
      peleas_con_fila_viva: "0",
      peleas_sin_cerrar: "0",
    });
    expect(await nivelDelTurnoDeGuardia()).toBe("mal");
  });

  it("🔴 el latido del bucle viaja de verdad desde el SQL hasta el veredicto", async () => {
    // SIN ESTE TEST, UN TYPO APAGA EL LATIDO PARA SIEMPRE Y EN SILENCIO. La
    // consulta lo cablea con `numOrNull`, y un alias mal escrito en el SELECT
    // llegaría como `undefined` → null → y un latido null NUNCA es rojo por
    // diseño. O sea: la comprobación quedaría muerta y la suite seguiría verde.
    // Es exactamente el fallo silencioso que este fichero existe para vigilar.
    filaGuardia = guardiaEnMarcha({
      minutos_desde_el_latido_del_bucle: "12",
      minutos_sin_pulso: "3",
      muestras_ultima_hora: "45",
      minutos_desde_el_ancla: "90",
      peleas_con_fila_viva: "6",
      peleas_con_pelicula: "6",
    });
    expect(await nivelDelTurnoDeGuardia()).toBe("mal");
  });

  it("y la consulta pregunta por el servicio 'live-loop', que es quien late", async () => {
    // El nombre del servicio es una cadena escrita a mano a los dos lados: aquí
    // y en mma-ingesta/src/scrapers/repositories/service_heartbeats.py. Si se
    // renombra en un lado, este SELECT deja de encontrar la fila y el latido se
    // apaga sin que nada falle.
    await obtenerEstado();
    const q = consultaDeGuardia();
    expect(q).toContain("service_heartbeats");
    expect(q).toContain("'live-loop'");
    // 🪤 Y EL ALIAS EXACTO, que es lo que de verdad se rompe. El test de arriba
    // no puede cazar un typo aquí: el mock devuelve la fila que se le da, mire
    // el SQL lo que mire. Con el alias mal escrito, `guardia.minutos_..._bucle`
    // sería `undefined` → `numOrNull` → null → y un latido null NUNCA es rojo.
    // La comprobación quedaría apagada para siempre sin una línea en rojo.
    // Con `toContain` no bastaría: un typo que AÑADE letras al final
    // (`..._buclee`) contiene la cadena buena. Hace falta el límite de palabra.
    expect(q).toMatch(/as minutos_desde_el_latido_del_bucle\b/);
  });

  it("los minutos desde el ancla tampoco se convierten en cero", async () => {
    // No debería pasar nunca (los dos salen del mismo CTE), pero si la hora del
    // evento se perdiera, `num()` daría «ancla+0» = dentro de la gracia = ámbar.
    // Sin hora no se puede afirmar que esté arrancando: ante la duda, rojo.
    filaGuardia = guardiaEnMarcha({
      minutos_desde_el_ancla: null,
      minutos_sin_pulso: null,
      peleas_con_fila_viva: "0",
      peleas_sin_cerrar: "0",
    });
    expect(await nivelDelTurnoDeGuardia()).toBe("mal");
  });

  it("sin velada el turno de guardia está entero en verde", async () => {
    // La foto del panel de HOY: sin velada, con las 12 filas de ayer todavía en
    // la tabla. Los cinco en verde y el ámbar global sigue siendo el de las
    // fotos, no el de la guardia.
    filaGuardia = {
      arranque_utc: "2026-08-22T21:00:00.000Z",
      horas_hasta_el_arranque: "149.94",
      velada_en_marcha: false,
      minutos_desde_el_ancla: null,
      minutos_sin_pulso: null,
      muestras_ultima_hora: "0",
      peleas_activas: "0",
      peleas_con_fila_viva: "0",
      peleas_sin_cerrar: "0",
      peleas_con_pelicula: "0",
      muestras_del_evento: "0",
    };
    expect(await nivelDelTurnoDeGuardia()).toBe("ok");
    expect((await obtenerEstado()).veladaEnMarcha).toBe(false);
  });

  it("con la velada en marcha el panel se refresca más a menudo", async () => {
    // Sale de la MISMA columna que el veredicto de la cámara: si divergieran,
    // el panel podría refrescarse cada minuto diciendo que no hay velada.
    expect((await obtenerEstado()).veladaEnMarcha).toBe(true);
  });
});

describe("obtenerEstado · qué evento mira el panel", () => {
  beforeEach(() => {
    filaGuardia = guardiaEnMarcha();
    sqlMock.mockReset();
    sqlMock.mockImplementation((query: string) =>
      Promise.resolve(responder(query) as never),
    );
  });

  it("🔴 el filtro del evento destacado va en las CINCO consultas que eligen «el evento»", async () => {
    await obtenerEstado();
    const consultas = sqlMock.mock.calls.map(([query]) => query);

    // Las nueve del `Promise.all`. Si un día son diez, el recuento de la línea
    // siguiente deja de significar lo que dice y hay que mirar la nueva.
    expect(consultas).toHaveLength(9);

    // CINCO. Ni cuatro (una consulta se quedó sin filtro y el panel se
    // contradice) ni seis (se le puso a una que pregunta «qué eventos existen»,
    // y entonces hay datos de la UFC que dejan de verse).
    const total = consultas.reduce((n, q) => n + vecesElPredicado(q), 0);
    expect(total).toBe(5);
  });

  it("y cae exactamente donde toca: dos veces en la guardia y una en las otras tres", async () => {
    // El 5 de arriba se puede cumplir con el reparto mal: sobra uno en la
    // última velada, falta el de la cartelera, y sigue sumando 5. Cada consulta
    // se localiza por un trozo suyo que no aparece en ninguna otra.
    const reparto: [string, string, number][] = [
      ["la última velada", "horas_desde_el_final", 1],
      ["la próxima velada", "sin_foto_cuerpo_en_la_base", 1],
      // Se localiza por su CTE `esquinas`, no por el alias `tiene_cuerpo`: desde
      // que la consulta de fotos del catálogo también devuelve `tiene_cuerpo`
      // (28-ago-2026), ese trozo ya no es único y localizaba la consulta
      // equivocada. El CTE sí lo es.
      ["las fotos de la cartelera", "esquinas as (", 1],
      // DOS, y no es un descuido: el CTE `proxima` (de dónde sale la hora del
      // arranque que enseña el panel) y el CTE `en_marcha` (qué velada se está
      // grabando AHORA) son dos preguntas distintas sobre la misma tabla. Con
      // el filtro en una sola, el panel contaría las horas que faltan para el
      // evento bueno mientras vigila el malo — o al revés, que es peor: la
      // cámara en verde grabando dos combates que no mira nadie.
      ["el turno de guardia", "velada_en_marcha", 2],
    ];

    await obtenerEstado();
    const consultas = sqlMock.mock.calls.map(([query]) => query);

    for (const [nombre, marca, esperadas] of reparto) {
      const consulta = consultas.find((q) => q.includes(marca));
      expect(consulta, `no se encontró la consulta de ${nombre}`).toBeDefined();
      expect(vecesElPredicado(consulta as string), nombre).toBe(esperadas);
    }
  });

  it("🪤 pero NO en el catálogo, y ahí ponerlo sería el fallo", async () => {
    // CATALOGO_SQL es un `count(*)` de COBERTURA HISTÓRICA: cuántos eventos ya
    // pasados siguen con combates sin resultado. Su pregunta no es «cuál es EL
    // evento» sino «qué nos falta por rellenar», y un Road To UFC a medias es
    // justo lo que esa alarma existe para gritar. Con el predicado puesto esos
    // eventos dejarían de contarse y el panel diría "0 pendientes" con la base
    // incompleta: una alarma apagada, que es peor que no tenerla.
    await obtenerEstado();
    const catalogo = sqlMock.mock.calls
      .map(([query]) => query)
      .find((q) => q.includes("eventos_pasados_incompletos"));

    expect(catalogo).toBeDefined();
    expect(vecesElPredicado(catalogo as string)).toBe(0);
  });

  it("y lo que el predicado tapa es el Road To UFC, nunca el Fight Night", () => {
    // El recuento solo vale si la lista de tapados es la que creemos. Los dos
    // nombres son los dos eventos del incidente: el 1094 del viernes, que se
    // coló, y el 1065 del sábado, al que empujó.
    expect(NUCLEO_TIER).toContain("'road_to_ufc'");
    expect(NUCLEO_TIER).not.toContain("'fight_night'");
    expect(NUCLEO_TIER).not.toContain("'numbered'");
    // 🪤 Y `not in`, jamás `in`. Invertido, el panel enseñaría SOLO los eventos
    // que hay que esconder y los cinco recuentos de arriba seguirían dando 5.
    expect(NUCLEO_TIER).toMatch(/^tier not in \(/i);
  });
});
