import { beforeEach, describe, expect, it, vi } from "vitest";

// LA LISTA DE /eventos, SIN LOS ROAD TO UFC.
//
// El dueño, el 30-oct-2026, mirando «Pasados»: el «Road To UFC: Maheshate vs.
// Flowers» (id 1094, 2 combates, sin póster ni sede) «no queda bien, quítalo»;
// y, preguntado, «solo los Road to UFC» (los otros 70 eventos sin póster son
// veladas UFC de verdad y se quedan). En la base hay dos: el 1094 y el 317.
//
// ⚠️ ESTE FICHERO SE PONE ROJO CON EL CÓDIGO ANTERIOR AL CAMBIO. Misma técnica
// que proximo-evento.sql.test.ts: el mock de `sql()` contesta según el TEXTO de
// la consulta, igual que Postgres, que solo esconde el Road To UFC si se lo
// piden. El conteo (la paginación) se juzga aparte: si las filas filtran y el
// conteo no, «Pasados» anuncia una página de más.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

// `unstable_cache` necesita el contexto de petición de Next: paso directo.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import { getPastEvents, getUpcomingEvents } from "@/lib/queries/events";

const sqlMock = vi.mocked(sql);

const PIDE_SIN_ROAD_TO_UFC = /\btier NOT IN \('road_to_ufc'\)/;

const fila = (id: number, name: string, event_date: string, tier: string) => ({
  id,
  name,
  headliner: null,
  event_date,
  start_time: null,
  location: null,
  image_url: null,
  broadcast: null,
  ticket_url: null,
  tagline: null,
  tier,
  fight_count: "12",
});

const ROAD_TO_UFC = fila(1094, "Road To UFC: Maheshate vs. Flowers", "2026-08-28", "road_to_ufc");
const FIGHT_NIGHT = fila(1065, "UFC Fight Night: Nurmagomedov vs. Song", "2026-08-29", "fight_night");
const CONTENDER = fila(2001, "Dana White's Contender Series 2026: Week 1", "2026-08-04", "dwcs");

describe("la lista de /eventos, sin Road To UFC", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockImplementation((async (texto: string) => {
      const filas = PIDE_SIN_ROAD_TO_UFC.test(texto)
        ? [FIGHT_NIGHT, CONTENDER]
        : [ROAD_TO_UFC, FIGHT_NIGHT, CONTENDER];
      if (/count\(\*\)::text AS total/.test(texto)) {
        return [{ total: String(filas.length) }];
      }
      return filas;
    }) as unknown as typeof sql);
  });

  it("🔴 «Pasados» no enseña el Road To UFC, y el resto sí (el Contender Series incluido)", async () => {
    const { events } = await getPastEvents(1);
    expect(events.map((e) => e.id)).toEqual([1065, 2001]);
  });

  it("🔴 y el conteo de «Pasados» (la paginación) tampoco lo cuenta", async () => {
    const { total } = await getPastEvents(1);
    expect(total).toBe(2);
  });

  it("🔴 lo mismo filtrando por año", async () => {
    const { events, total } = await getPastEvents(1, 2026);
    expect(events.map((e) => e.id)).toEqual([1065, 2001]);
    expect(total).toBe(2);
    for (const [texto, params] of sqlMock.mock.calls) {
      expect(params?.[0], "el año sigue siendo el primer parámetro").toBe(2026);
      expect(texto).toMatch(PIDE_SIN_ROAD_TO_UFC);
    }
  });

  it("🔴 «Próximos» tampoco lo enseña", async () => {
    const eventos = await getUpcomingEvents();
    expect(eventos.map((e) => e.id)).toEqual([1065, 2001]);
  });

  // 🪤 Sin año, el WHERE de «Pasados» es un OR de tres ramas (fecha pasada, sin
  // fecha, o estelar terminado). Un `AND tier …` pegado detrás sin paréntesis
  // solo filtraría la ÚLTIMA rama: el Road To UFC pasado (rama 1) seguiría
  // saliendo. El mock no evalúa SQL, así que se mira la forma.
  it("🔴 sin año, el filtro abarca las tres ramas del OR (va entre paréntesis)", async () => {
    await getPastEvents(1);
    for (const [texto] of sqlMock.mock.calls) {
      expect(texto).toMatch(
        /WHERE \(e\.event_date < CURRENT_DATE OR e\.event_date IS NULL\s+OR [\s\S]+\)\s+AND e\.tier NOT IN \('road_to_ufc'\)/,
      );
    }
  });
});
