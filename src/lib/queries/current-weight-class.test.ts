import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

// LA CATEGORÍA ACTUAL DE UN LUCHADOR, UNA SOLA REGLA PARA TODA LA WEB.
//
// Hasta el 28-sep-2026 había seis copias de la misma subconsulta, y todas
// ordenaban los combates por `updated_at` —la fecha en que el scraper tocó la
// fila, no la del combate—. Valentina Shevchenko salía «Peso Gallo (F)» por una
// pelea de 2015 y el cara a cara con Natalia Silva avisaba de un «Enfrentamiento
// hipotético» entre dos pesos mosca. Ordenar por fecha a secas tampoco valía:
// rompía a Zhang Weili (#1 del paja, perdió en el mosca y volvió), a Holloway y
// a Usman. La regla que manda ahora, decidida por el dueño:
//
//   1. la división de su RANKING en la última foto (sin libra por libra);
//   2. si no está rankeado, su último combate DISPUTADO, por fecha de evento;
//   3. si solo tiene programados, el programado.
//
// ⚠️ Los tests de abajo se ponen ROJOS con cualquiera de las copias viejas: el
// mock de `sql` guarda el texto que recibe y se comprueba que la categoría sale
// del helper, no de una subconsulta escrita a mano.

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import { formatDivision, formatWeightClass } from "@/lib/format";
import { resueltoSqlPredicate } from "@/lib/fight-result";
import { DIVISION_SLUGS } from "@/lib/maestro/prompt";
import { runMaestroTool } from "@/lib/maestro/tools";
import {
  RANKING_DIVISION_WEIGHT_CLASS,
  currentWeightClassSql,
} from "@/lib/queries/current-weight-class";
import {
  getFighterComparisonDetail,
  getFighterDetail,
  getFighters,
} from "@/lib/queries/fighters";

const sqlMock = vi.mocked(sql);

// Los slugs que había en `rankings` el 28-sep-2026, medidos con
// `select distinct division from rankings` (13, los dos P4P incluidos). Si la
// ingesta estrena uno, este test no lo sabe: por eso el mapa también se cruza
// con las listas del código (DIVISION_SLUGS del Maestro), que sí se mantienen.
const SLUGS_EN_LA_BASE = [
  "bantamweight",
  "featherweight",
  "flyweight",
  "heavyweight",
  "light_heavyweight",
  "lightweight",
  "mens_pound_for_pound",
  "middleweight",
  "welterweight",
  "womens_bantamweight",
  "womens_flyweight",
  "womens_pound_for_pound",
  "womens_strawweight",
];

const esP4P = (slug: string) => slug.endsWith("pound_for_pound");

describe("el mapa slug del ranking → categoría de `fights.weight_class`", () => {
  const todos = [...new Set([...SLUGS_EN_LA_BASE, ...DIVISION_SLUGS])].filter(
    (slug) => !esP4P(slug),
  );

  it("cubre TODAS las divisiones que no son libra por libra", () => {
    const sinMapa = todos.filter((slug) => !(slug in RANKING_DIVISION_WEIGHT_CLASS));
    expect(sinMapa, "slugs sin traducción: su ranking se ignoraría").toEqual([]);
  });

  it("no mapea los libra por libra: no son una categoría de peso", () => {
    const p4p = Object.keys(RANKING_DIVISION_WEIGHT_CLASS).filter(esP4P);
    expect(p4p).toEqual([]);
  });

  for (const slug of todos) {
    it(`${slug}: la ficha dice lo mismo que /clasificacion`, () => {
      const texto = RANKING_DIVISION_WEIGHT_CLASS[slug];
      // formatWeightClass pinta la categoría en tarjeta, ficha y cara a cara;
      // formatDivision pinta la misma división en /clasificacion. Si no
      // coinciden, el mapa ha escrito un texto que la web no reconoce.
      expect(formatWeightClass(texto)).toBe(formatDivision(slug));
      // La silueta y el sexo se deciden con /women/i sobre este texto.
      expect(/women/i.test(texto), texto).toBe(slug.startsWith("womens_"));
    });
  }
});

describe("currentWeightClassSql · la forma de la regla", () => {
  const sqlTexto = currentWeightClassSql("f");

  it("mira PRIMERO el ranking y después los combates, dentro de un coalesce", () => {
    expect(sqlTexto.trimStart().startsWith("coalesce(")).toBe(true);
    const ranking = sqlTexto.indexOf("from rankings");
    const combates = sqlTexto.indexOf("from fights");
    expect(ranking).toBeGreaterThan(-1);
    expect(combates).toBeGreaterThan(ranking);
  });

  it("el ranking es el de la ÚLTIMA foto, sin libra por libra y por mejor puesto", () => {
    expect(sqlTexto).toContain("(select max(snapshot_date) from rankings)");
    expect(sqlTexto).not.toContain("pound_for_pound");
    expect(sqlTexto).toMatch(/order by cwc_r\.rank_position asc/);
    // Traducido en SQL al texto de `fights` (con la comilla escapada), para que
    // formatWeightClass y la silueta sigan funcionando sin tocarse.
    expect(sqlTexto).toContain("when 'womens_strawweight' then 'Women''s Strawweight'");
    expect(sqlTexto).toContain("when 'light_heavyweight' then 'Light Heavyweight'");
  });

  // 🪤 El CASE no tiene ELSE: si el filtro de divisiones faltara, una fila del
  // libra por libra con MEJOR puesto que la de su división ganaría el ORDER BY,
  // el CASE daría NULL y el coalesce saltaría a la regla de los combates: el
  // ranking se ignoraría sin que nada fallara. Mirar que el texto no diga
  // «pound_for_pound» no lo vigila; esto sí.
  it("filtra EXPLÍCITAMENTE las divisiones con traducción, y ningún libra por libra", () => {
    const filtro = /cwc_r\.division in \(([^)]*)\)/.exec(sqlTexto);
    expect(filtro, "falta el filtro `cwc_r.division in (...)`").not.toBeNull();
    const lista = (filtro?.[1] ?? "")
      .split(",")
      .map((slug) => slug.trim().replace(/^'|'$/g, ""));
    expect([...lista].sort()).toEqual(Object.keys(RANKING_DIVISION_WEIGHT_CLASS).sort());
    expect(lista.filter(esP4P)).toEqual([]);
  });

  it("sin ranking: disputados antes que programados, catch/open al final, por FECHA DEL EVENTO", () => {
    const orden = [
      `${resueltoSqlPredicate("cwc_fi")} desc`,
      "(cwc_fi.weight_class ~* '(catch|open)\\s*weight') asc",
      "cwc_e.event_date desc nulls last",
      "cwc_fi.id desc",
    ].map((trozo) => sqlTexto.indexOf(trozo));

    expect(orden.every((i) => i > -1), `falta algún criterio: ${orden}`).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(sqlTexto).toContain("left join events cwc_e on cwc_e.id = cwc_fi.event_id");
    expect(sqlTexto).toContain("cwc_fi.status is distinct from 'cancelled'");
    expect(sqlTexto).toContain("cwc_fi.weight_class is not null");
  });

  it("🪤 no queda ni rastro del `updated_at`, que es la fecha del scraper", () => {
    expect(sqlTexto).not.toContain("updated_at");
  });

  it("correlaciona con el alias que le pasan, y se niega a uno que no es un alias", () => {
    expect(currentWeightClassSql("x")).toContain("cwc_r.fighter_id = x.id");
    expect(currentWeightClassSql("x")).toContain("cwc_fi.fighter_red_id = x.id");
    expect(() => currentWeightClassSql("f.id; drop table fights")).toThrow();
  });
});

describe("🔴 todas las consultas que pintan la categoría usan el helper", () => {
  const helper = currentWeightClassSql("f");
  const consultas = () => sqlMock.mock.calls.map(([query]) => String(query));

  beforeEach(() => {
    sqlMock.mockReset();
    // Una base vacía: a cada consulta le basta con que el texto llegue.
    sqlMock.mockImplementation((query: string) =>
      Promise.resolve(
        (query.includes("count(*)::text as total") ? [{ total: "0" }] : []) as never,
      ),
    );
  });

  // El respaldo del contador (`ufc_fight_count`) de la ficha y del cara a cara
  // cuenta solo las peleas UFC ya DISPUTADAS, con el mismo criterio que la
  // tarjeta de la portada. Sin esto, quitar el predicado no ponía nada en rojo.
  /** La subconsulta que acaba en `as ufc_fight_count`, desde su `select count(*)`. */
  function subconsultaUfc(query: string): string {
    const fin = query.indexOf("as ufc_fight_count");
    const inicio = query.lastIndexOf("select count(*)", fin);
    return fin > -1 && inicio > -1 ? query.slice(inicio, fin) : "";
  }

  it("la ficha (getFighterDetail)", async () => {
    await getFighterDetail(6260);
    expect(consultas()[0]).toContain(`${helper} as latest_weight_class`);
    expect(subconsultaUfc(consultas()[0])).toContain(resueltoSqlPredicate("fi"));
  });

  it("el cara a cara (getFighterComparisonDetail), que decide el aviso «hipotético»", async () => {
    await getFighterComparisonDetail(6260, 7003);
    expect(consultas()[0]).toContain(`${helper} as latest_weight_class`);
    expect(subconsultaUfc(consultas()[0])).toContain(resueltoSqlPredicate("fi"));
  });

  it("el listado /fighters (getFighters)", async () => {
    await getFighters();
    const lista = consultas().find((q) => q.includes("from fighters f") && q.includes("limit $"));
    expect(lista, "no llegó la consulta del listado").toBeDefined();
    expect(lista).toContain(`${helper} as latest_weight_class`);
  });

  it("el Maestro (ficha_y_stats), para que no diga otra categoría que `comparar`", async () => {
    sqlMock
      .mockResolvedValueOnce([
        { id: 6260, name: "Valentina Shevchenko", wins: 26, losses: 4, draws: 1 },
      ] as never)
      .mockResolvedValueOnce([{ total_fight_stats: "0", fights_with_control: "0" }] as never);

    await runMaestroTool("ficha_y_stats", { id: 6260 });
    expect(consultas()[0]).toContain(`${helper} as latest_weight_class`);
  });

  // Guarda de fuente: la regla vieja no puede volver escrita a mano en ninguno
  // de los tres ficheros. skill-radar.ts se queda FUERA a propósito (cambiarlo
  // movería los percentiles del radar) y está apuntado en el BACKLOG.
  for (const ruta of [
    "./fighters.list.ts",
    "./fighters.detail.ts",
    "../maestro/tools.ts",
  ]) {
    it(`${ruta.split("/").pop()} no conserva ninguna copia del ORDER BY por updated_at`, () => {
      const fuente = readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), "utf8");
      expect(fuente).not.toMatch(/fi2\.updated_at/);
    });
  }
});
