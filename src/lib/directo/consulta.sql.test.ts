import { beforeEach, describe, expect, it, vi } from "vitest";

// LA OTRA MITAD DEL PANEL. `consulta.test.ts` prueba `decidir` como función
// pura —el veredicto— y ahí se acaba: nadie miraba nunca QUÉ le pregunta el
// panel a la base. RESULTADOS_SQL no aparecía en un solo test, y por eso su
// `WHERE event_id = $1` a secas sobrevivió: contaba las peleas CANCELADAS en el
// denominador del marcador.
//
// Medido contra Neon el 16-ago-2026 con el 1064 (UFC 330): 14 filas, 2
// canceladas (12894 y 13314), 12 con ganador y método. Sin el filtro el panel
// enseñaba 12/14 y `cartelCompleto` no se cumplía JAMÁS, así que la velada no
// se daba por cerrada aunque estuviera entera. Una pelea cancelada no tiene
// ganador ni método POR DEFINICIÓN: nunca puede completar la fracción.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import { obtenerDirecto } from "@/lib/directo/consulta";
import { eventoPrincipalSql } from "@/lib/event-tier";

const sqlMock = vi.mocked(sql);

/** Una velada de anoche: la ventana ya está cerrada por reloj. */
const ANOCHE = new Date(Date.now() - 20 * 3_600_000).toISOString();

/**
 * Contesta según QUÉ consulta llega, no según el orden: las cuatro salen juntas
 * en un `Promise.all` y el orden de llegada no está garantizado.
 */
function responder(query: string): Record<string, unknown>[] {
  if (query.includes("FROM events")) {
    return [{
      id: 1064,
      name: "UFC 330: Makhachev vs. Machado Garry",
      early_prelims_time: ANOCHE,
      prelims_time: null,
      start_time: ANOCHE,
    }];
  }
  if (query.includes("live_fight_stat_samples")) {
    return [{ muestras: "288", peleas: "12", ultima: ANOCHE, ritmo: "0" }];
  }
  if (query.includes("l.status_detail")) return [];
  if (query.includes("COUNT(*)::text AS n")) return [{ n: "0" }];
  if (query.includes("AS metodo")) {
    // Lo que devuelve la consulta CON el filtro puesto. El 12/12/12 real.
    return [{ total: "12", ganador: "12", metodo: "12" }];
  }
  throw new Error(`Consulta inesperada en el panel de directo:\n${query}`);
}

/**
 * El predicado del evento destacado SIN el alias: EVENTO_SQL mira `events` a
 * pelo, sin ponerle uno, así que lo que se cuenta es la CONDICIÓN y no el
 * prefijo. Se deriva del módulo para que añadir un tipo secundario mañana no
 * deje este fichero contando una cadena que ya no se escribe.
 */
const NUCLEO_TIER = eventoPrincipalSql("e").replace(/^e\./, "");

/** Cuántas veces aparece el predicado en un SQL. */
function vecesElPredicado(query: string): number {
  const escapado = NUCLEO_TIER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (query.match(new RegExp(escapado, "gi")) ?? []).length;
}

describe("obtenerDirecto · qué le pregunta el panel a la base", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockImplementation((query: string) =>
      Promise.resolve(responder(query) as never),
    );
  });

  it("no mete las peleas canceladas en el marcador de resultados", async () => {
    await obtenerDirecto();

    const consulta = sqlMock.mock.calls
      .map(([query]) => query)
      .find((query) => query.includes("AS metodo"));

    expect(consulta).toBeDefined();
    // El mismo predicado NULL-safe que usa el resto del repo (`status` sólo
    // vale NULL o 'cancelled'; un `!= 'cancelled'` se tragaría los NULL).
    expect(consulta).toContain("status IS DISTINCT FROM 'cancelled'");
  });

  it("y el marcador que llega a la página es el que cierra la velada", async () => {
    // La cadena entera: total → `cartelCompleto` → veredicto. Es lo que el
    // 12/14 rompía: con el denominador inflado el panel no cerraba nunca.
    const d = await obtenerDirecto();

    expect(d.resultados).toEqual({ total: 12, conGanador: 12, conMetodo: 12 });
    expect(d.nivel).toBe("grabada");
  });

  it("🔴 la velada que se vigila se elige saltándose los Road To UFC", async () => {
    // EL FALLO DEL 26-AGO-2026. Un "Road To UFC" del viernes (id 1094, 2
    // combates) se coló como «la velada de ahora» y desplazó al UFC Fight Night
    // del sábado (id 1065, 13 combates). Los dos son `promotion_id = 1`, así
    // que la promotora NO los distingue, y esta consulta elegía por CERCANÍA en
    // el tiempo: el viernes gana al sábado. Con la ventana del Road To UFC
    // abierta, el panel se habría pasado la noche del sábado diciendo "sin
    // muestras" de un evento de dos combates mientras la velada de verdad se
    // grababa sola y sin vigilancia. Lo arregla `events.tier` (migración 028).
    await obtenerDirecto();
    const consulta = sqlMock.mock.calls
      .map(([query]) => query)
      .find((query) => query.includes("FROM events"));

    expect(consulta).toBeDefined();
    // UNA vez y exactamente una: es la única consulta del fichero que ELIGE
    // evento. Se cuenta en vez de mirarla con un `toContain` porque el día que
    // esa cláusula se duplique en un `OR` mal cerrado, o que alguien la copie a
    // otro CTE, el número lo dice y la presencia no.
    expect(vecesElPredicado(consulta as string)).toBe(1);
  });

  it("y NO se lo pone a las otras cuatro, que ya van atadas a ese evento", async () => {
    // Las cuatro siguientes preguntan `WHERE ... event_id = $1` con el id que
    // acaba de elegir la de arriba: el tipo de evento ya está decidido y
    // repetir el filtro no cambia una fila. Pero si un día el vigilante tiene
    // que mirar a propósito un Road To UFC (`tier_override`, o una velada rara
    // metida a mano), el filtro repetido aquí abajo devolvería el marcador a
    // cero y el panel diría "no se está grabando nada" con la cámara puesta.
    await obtenerDirecto();
    const consultas = sqlMock.mock.calls.map(([query]) => query);

    // Las cinco: la del evento y las cuatro del `Promise.all`.
    expect(consultas).toHaveLength(5);
    const total = consultas.reduce((n, q) => n + vecesElPredicado(q), 0);
    expect(total).toBe(1);
  });

  it("y lo que ese filtro tapa es el Road To UFC, nunca el Fight Night", () => {
    // El recuento solo vale si la lista de tapados es la que creemos: el 1094
    // del viernes, que se coló, fuera; el 1065 del sábado, al que empujó, dentro.
    expect(NUCLEO_TIER).toContain("'road_to_ufc'");
    expect(NUCLEO_TIER).not.toContain("'fight_night'");
    expect(NUCLEO_TIER).not.toContain("'numbered'");
    // 🪤 `not in`, jamás `in`. Invertirlo son tres letras, no rompe la consulta
    // —sigue devolviendo una fila, la contraria— y el recuento seguiría dando 1.
    expect(NUCLEO_TIER).toMatch(/^tier not in \(/i);
  });
});
