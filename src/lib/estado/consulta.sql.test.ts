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
