import { beforeEach, describe, expect, it, vi } from "vitest";

// LOS CAMPEONES ACTUALES, EN ORO (el dueño, 29-oct-2026): «bordear los cuadros
// donde están los CAMPEONES actuales y resaltarlos con un bordeado oro, solo a
// los actuales campeones y así con los que vayan llegando».
//
// «Así con los que vayan llegando» es la regla: NO hay lista a mano. Campeón es
// quien lleva `is_champion` en la ÚLTIMA foto de `rankings`, que el cron semanal
// refresh-rankings renueva; el que pierde el cinturón pierde el oro solo.
// Comprobado en la base el 29-oct-2026 (solo lectura): las 13 divisiones
// comparten la foto del 28-oct y hay 11 campeones (las 11 divisiones de peso;
// los libra por libra nunca traen `is_champion`).
//
// Aquí se fija lo que ven las TARJETAS: la de /fighters y la de «Mejores libra
// por libra» de la portada. La forma de la regla (qué foto, qué columna) está en
// current-champion.test.ts.
//
// LA TÉCNICA es la de featured-fighters.sql.test.ts: el mock de `sql()` contesta
// según el TEXTO de la consulta, como Postgres. Si la consulta no pide la
// columna `is_champion`, la fila no la trae, igual que en la base de verdad. Y
// si la pide SIN limitarse a la última foto, el cinturón de una foto vieja
// cuenta, como contaría en la base: Topuria y Shevchenko saldrían en oro.
// (Revisión del 29-oct-2026: el mock daba el oro de hoy a cualquier consulta,
// y «Topuria (lo fue) no» pasaba aunque el SQL mirase cualquier foto.)

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import { getFeaturedFighters, getFighters } from "@/lib/queries/fighters";

const sqlMock = vi.mocked(sql);

type Fila = Record<string, unknown>;

// Los de la foto del 28-oct-2026.
const MAKHACHEV = { id: 6258, name: "Islam Makhachev" }; // campeón del wélter
const VOLKANOVSKI = { id: 7029, name: "Alexander Volkanovski" }; // del pluma
const HARRISON = { id: 5850, name: "Kayla Harrison" }; // del gallo femenino
// Nº 5 y nº 1 de los libra por libra y campeones en fotos ANTERIORES, no en la
// última: el oro no se queda con quien ya no tiene el cinturón.
const TOPURIA = { id: 5828, name: "Ilia Topuria" };
const SHEVCHENKO = { id: 6260, name: "Valentina Shevchenko" };
// Ni campeón ni en el libra por libra: el nº 1 del mosca.
const PANTOJA = { id: 7084, name: "Alexandre Pantoja" };

const CAMPEONES_HOY = new Set([MAKHACHEV.id, VOLKANOVSKI.id, HARRISON.id]);
const CAMPEONES_ANTES = new Set([TOPURIA.id, SHEVCHENKO.id]);

/**
 * ¿La consulta lee `is_champion` SOLO de la última foto? Las dos formas de la
 * casa: el helper de la portada (current-champion.ts) y el CTE `rel` de
 * /fighters, que ya lee esa foto para ordenar.
 */
function soloLaUltimaFoto(query: string): boolean {
  if (query.includes("cch_r.snapshot_date = (select max(snapshot_date) from rankings)")) {
    return true;
  }
  const rel = /rel as \(([\s\S]*?)\n\s*\),/.exec(query)?.[1] ?? "";
  return (
    rel.includes("bool_or(is_champion)") &&
    rel.includes("where snapshot_date = (select d from latest)")
  );
}

function aFila(l: { id: number; name: string }, query: string): Fila {
  const fila: Fila = {
    id: l.id,
    name: l.name,
    nickname: null,
    headshot_url: null,
    nationality: null,
    birth_date: null,
    height_cm: null,
    reach_cm: null,
    stance: null,
    weight_grams: null,
    wins: 20,
    losses: 2,
    draws: 0,
    updated_at: null,
    ufc_fight_count: "12",
    latest_weight_class: "Lightweight",
  };
  // Postgres solo devuelve la columna si la consulta la PIDE.
  if (/\bas is_champion\b/.test(query)) {
    fila.is_champion =
      CAMPEONES_HOY.has(l.id) || (!soloLaUltimaFoto(query) && CAMPEONES_ANTES.has(l.id));
  }
  return fila;
}

let rankingsVacia = false;

function responder(query: string, params: unknown[] = []): Fila[] {
  if (query.includes("from rankings r")) {
    if (rankingsVacia) return [];
    const mujeres = params[1] === "womens_pound_for_pound";
    const lista = mujeres ? [SHEVCHENKO, HARRISON] : [MAKHACHEV, VOLKANOVSKI, TOPURIA];
    return lista.map((l) => aFila(l, query));
  }
  if (query.includes("count(*)::text as total")) return [{ total: "4" }];
  if (query.includes("select distinct")) return [];
  if (query.includes("from fighters f")) {
    // El listado de /fighters y el plan B «los de más peleas» de la portada.
    return [VOLKANOVSKI, MAKHACHEV, TOPURIA, PANTOJA].map((l) => aFila(l, query));
  }
  throw new Error(`Consulta inesperada:\n${query}`);
}

beforeEach(() => {
  rankingsVacia = false;
  sqlMock.mockReset();
  sqlMock.mockImplementation((query: string, params?: unknown[]) =>
    Promise.resolve(responder(query, params) as never),
  );
});

const campeones = (lista: { name: string; isChampion: boolean }[]) =>
  lista.filter((f) => f.isChampion).map((f) => f.name);

describe("🔴 la tarjeta sabe si su luchador es campeón AHORA", () => {
  it("portada, masculino: Makhachev y Volkanovski sí; Topuria (lo fue) no", async () => {
    const { fighters } = await getFeaturedFighters(6, "mens_pound_for_pound");

    expect(fighters.map((f) => f.isChampion)).toEqual([true, true, false]);
    expect(campeones(fighters)).toEqual(["Islam Makhachev", "Alexander Volkanovski"]);
  });

  it("portada, femenino: Harrison sí; Shevchenko, nº 1 del libra por libra, no", async () => {
    const { fighters } = await getFeaturedFighters(6, "womens_pound_for_pound");

    expect(campeones(fighters)).toEqual(["Kayla Harrison"]);
  });

  it("portada, plan B «los de más peleas»: también trae el oro", async () => {
    rankingsVacia = true;

    const { fighters, source } = await getFeaturedFighters();

    expect(source).toBe("most-fights");
    expect(campeones(fighters)).toEqual(["Alexander Volkanovski", "Islam Makhachev"]);
  });

  it("/fighters: los campeones del listado, y nadie más", async () => {
    const { fighters } = await getFighters();

    expect(campeones(fighters)).toEqual(["Alexander Volkanovski", "Islam Makhachev"]);
    expect(fighters.find((f) => f.name === "Alexandre Pantoja")?.isChampion).toBe(false);
  });
});

describe("🔴 sin consultas de más (nada de N+1)", () => {
  it("la portada sigue haciendo UNA consulta por libra por libra", async () => {
    await getFeaturedFighters(6, "mens_pound_for_pound");

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("/fighters sigue haciendo una sola consulta de listado", async () => {
    await getFighters();

    const listados = sqlMock.mock.calls.filter(([q]) => String(q).includes("limit $"));
    expect(listados).toHaveLength(1);
  });
});
