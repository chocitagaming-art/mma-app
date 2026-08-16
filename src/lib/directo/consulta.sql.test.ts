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
});
