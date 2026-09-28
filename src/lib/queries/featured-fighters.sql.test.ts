import { beforeEach, describe, expect, it, vi } from "vitest";

// LOS DESTACADOS DE LA PORTADA: «Mejores libra por libra».
//
// Tres cosas que el dueño decidió el 28-sep-2026 y que este fichero fija:
//
//   1. La consulta sirve para los DOS libra por libra, el masculino y el
//      femenino. Hasta ese día el filtro estaba escrito a mano
//      (`r.division = 'mens_pound_for_pound'`) y la portada no tenía mujeres.
//   2. El plan B «los de más peleas», para cuando la tabla rankings llega
//      vacía, NO filtra por sexo. Para el femenino devolvería hombres, así que
//      el femenino se queda en [] y la portada no pinta sus pestañas.
//   3. El contador del pie de la tarjeta sale del MISMO récord que la tarjeta
//      enseña al lado: Makhachev 29-1-0 → 30 peleas. Antes contaba filas de
//      `fights` (solo UFC y con los programados dentro) y decía 19.
//
// LA TÉCNICA es la de `proximo-evento.sql.test.ts`: el mock de `sql()` contesta
// según el TEXTO y los PARÁMETROS de la consulta que le llega, igual que haría
// Postgres. Si la consulta no pide la división, la «base» le devuelve el
// masculino, que es lo que devolvía la de verdad.

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import { resueltoSqlPredicate } from "@/lib/fight-result";
import { currentWeightClassSql } from "@/lib/queries/current-weight-class";
import { getFeaturedFighters } from "@/lib/queries/fighters";

const sqlMock = vi.mocked(sql);

type Fila = Record<string, unknown>;

/**
 * Una fila de luchador como la devuelve Postgres. `ufcDisputadas` y
 * `ufcConProgramados` son las dos respuestas posibles de la «base» al conteo de
 * `fights`, según la consulta excluya o no los programados.
 */
function luchador(
  id: number,
  name: string,
  [wins, losses, draws]: [number, number, number],
  ufc: { disputadas: number; conProgramados: number },
  categoria: { buena: string; vieja: string },
) {
  return { id, name, wins, losses, draws, ufc, categoria };
}

type Luchador = ReturnType<typeof luchador>;

// Cifras reales del 28-sep-2026 (récord de `fighters`, conteos de `fights`).
const MAKHACHEV = luchador(6258, "Islam Makhachev", [29, 1, 0], { disputadas: 19, conProgramados: 19 }, { buena: "Welterweight", vieja: "Welterweight" });
// Volkanovski tiene programado el UFC 333 (24-oct): la base vieja contaba 19.
const VOLKANOVSKI = luchador(7029, "Alexander Volkanovski", [28, 4, 0], { disputadas: 18, conProgramados: 19 }, { buena: "Featherweight", vieja: "Featherweight" });
// Shevchenko no está en el ranking del mosca (solo en el P4P); por `updated_at`
// salía «Women's Bantamweight», por una pelea de 2015.
const SHEVCHENKO = luchador(6260, "Valentina Shevchenko", [26, 4, 1], { disputadas: 19, conProgramados: 19 }, { buena: "Women's Flyweight", vieja: "Women's Bantamweight" });
// Kayla Harrison: 19-1-0 de carrera y solo 3 en UFC (4 con el programado).
const HARRISON = luchador(5850, "Kayla Harrison", [19, 1, 0], { disputadas: 3, conProgramados: 4 }, { buena: "Women's Bantamweight", vieja: "Women's Bantamweight" });

const HOMBRES = [MAKHACHEV, VOLKANOVSKI];
const MUJERES = [SHEVCHENKO, HARRISON];

/** Un veterano cualquiera: lo que devuelve el plan B «los de más peleas». */
const VETERANO = luchador(9001, "Jim Miller", [38, 18, 0], { disputadas: 45, conProgramados: 45 }, { buena: "Lightweight", vieja: "Lightweight" });

function aFila(l: Luchador, query: string): Fila {
  const sinProgramados = query.includes(resueltoSqlPredicate("fi"));
  const conHelper = query.includes(currentWeightClassSql("f"));
  const conteo = String(sinProgramados ? l.ufc.disputadas : l.ufc.conProgramados);
  return {
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
    wins: l.wins,
    losses: l.losses,
    draws: l.draws,
    updated_at: null,
    // Las dos columnas: la vieja (`fight_count`) y la nueva. Así el mock vale
    // para el código de antes y el de después, y lo que se juzga es cuál lee.
    fight_count: conteo,
    ufc_fight_count: conteo,
    latest_weight_class: conHelper ? l.categoria.buena : l.categoria.vieja,
  };
}

let rankingsVacia = false;

/** La base, en pequeño. */
function responder(query: string, params: unknown[] = []): Fila[] {
  if (query.includes("from rankings r")) {
    if (rankingsVacia) return [];
    // Postgres solo filtra por la división que le PIDEN. Con el literal
    // masculino escrito a mano (el código de antes), devuelve hombres siempre.
    const pideMujeres =
      query.includes("r.division = $2") && params[1] === "womens_pound_for_pound";
    return (pideMujeres ? MUJERES : HOMBRES).map((l) => aFila(l, query));
  }
  if (query.includes("from fighters f")) {
    // Plan B: los de más peleas, SIN mirar el sexo. Aquí sale un hombre.
    return [aFila(VETERANO, query)];
  }
  throw new Error(`Consulta inesperada en los destacados:\n${query}`);
}

beforeEach(() => {
  rankingsVacia = false;
  sqlMock.mockReset();
  sqlMock.mockImplementation((query: string, params?: unknown[]) =>
    Promise.resolve(responder(query, params) as never),
  );
});

describe("🔴 getFeaturedFighters · la división va por parámetro", () => {
  it("sin argumentos sigue siendo el libra por libra MASCULINO", async () => {
    const { fighters: destacados, source } = await getFeaturedFighters();

    expect(destacados.map((f) => f.name)).toEqual(["Islam Makhachev", "Alexander Volkanovski"]);
    expect(sqlMock.mock.calls[0][1]).toContain("mens_pound_for_pound");
    expect(source).toBe("ranking");
  });

  it("con 'womens_pound_for_pound' devuelve el FEMENINO", async () => {
    const { fighters: destacadas, source } = await getFeaturedFighters(6, "womens_pound_for_pound");

    expect(destacadas.map((f) => f.name)).toEqual(["Valentina Shevchenko", "Kayla Harrison"]);
    expect(source).toBe("ranking");
    expect(sqlMock.mock.calls[0][1]).toEqual([6, "womens_pound_for_pound"]);
  });
});

describe("🔴 el plan B «los de más peleas» es SOLO del masculino", () => {
  it("femenino con rankings vacía → [] y una sola consulta: nunca se cuela un hombre", async () => {
    rankingsVacia = true;

    const { fighters: destacadas } = await getFeaturedFighters(6, "womens_pound_for_pound");

    expect(destacadas).toEqual([]);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: masculino con rankings vacía → sí tira del plan B", async () => {
    rankingsVacia = true;

    const { fighters: destacados, source } = await getFeaturedFighters();

    expect(sqlMock).toHaveBeenCalledTimes(2);
    expect(destacados.map((f) => f.name)).toEqual(["Jim Miller"]);
    // Y lo DICE: la portada no puede llamar «ranking oficial» a los de más
    // peleas (p4p-description.ts).
    expect(source).toBe("most-fights");
  });
});

describe("🔴 el contador sale del récord que la tarjeta enseña", () => {
  it("Makhachev 29-1-0 → 30 peleas (no las 19 filas de `fights`)", async () => {
    const {
      fighters: [makhachev],
    } = await getFeaturedFighters();

    expect(makhachev.fightCount).toBe(30);
    expect(makhachev.fightCount).toBe(makhachev.wins + makhachev.losses + makhachev.draws);
  });

  it("Kayla Harrison 19-1-0 → 20 peleas, aunque en UFC lleve 3", async () => {
    const {
      fighters: [, harrison],
    } = await getFeaturedFighters(6, "womens_pound_for_pound");

    expect(harrison.fightCount).toBe(20);
  });

  it("el respaldo «N en UFC» cuenta solo las DISPUTADAS: Volkanovski 18, no 19", async () => {
    // Si algún día el récord falta, la tarjeta cae a las peleas UFC ya
    // celebradas. El UFC 333 del 24-oct no se ha peleado todavía.
    const {
      fighters: [, volkanovski],
    } = await getFeaturedFighters();

    expect(volkanovski.ufcFightCount).toBe(18);
  });
});

describe("🔴 la categoría de la tarjeta sale de la regla única", () => {
  it("Shevchenko: «Women's Flyweight», no el gallo de 2015", async () => {
    const {
      fighters: [shevchenko],
    } = await getFeaturedFighters(6, "womens_pound_for_pound");

    expect(shevchenko.latestWeightClass).toBe("Women's Flyweight");
  });
});
