import { beforeEach, describe, expect, it, vi } from "vitest";

// QUIÉN ES CAMPEÓN AHORA: la forma de la regla (dueño, 29-oct-2026).
//
// Campeón actual = `rankings.is_champion` en la ÚLTIMA foto. Medido en la base
// el 29-oct-2026 (solo lectura), y por eso NO es «la última foto de cada
// división»:
//   · las 13 divisiones comparten la foto del 28-oct (y las 100 anteriores
//     desde junio, todas con sus 13);
//   · la ingesta las escribe JUNTAS: refresh-rankings borra e inserta la foto
//     entera de una pasada (mma-ingesta, src/scrapers/rankings.py), con UNA
//     fecha para todas;
//   · y /clasificacion, el libra por libra y el orden de /fighters leen la
//     misma última foto. El oro tiene que coincidir con ellos: con «la última
//     de cada división», el campeón de una división que ufc.com dejara de
//     publicar se quedaría el oro para siempre.
//
// Las tarjetas que lo usan y lo que ven: campeones.sql.test.ts.

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import { currentChampionSql } from "@/lib/queries/current-champion";
import { getFeaturedFighters, getFighters } from "@/lib/queries/fighters";

const sqlMock = vi.mocked(sql);

describe("currentChampionSql · la forma de la regla", () => {
  const texto = currentChampionSql("f");

  it("es un exists sobre `rankings`: un booleano, nunca NULL", () => {
    expect(texto.trimStart().startsWith("exists (")).toBe(true);
    expect(texto).toMatch(/from rankings cch_r/);
  });

  it("mira `is_champion` en la ÚLTIMA foto, no en cualquiera", () => {
    expect(texto).toMatch(/cch_r\.is_champion\b/);
    expect(texto).toContain("cch_r.snapshot_date = (select max(snapshot_date) from rankings)");
  });

  it("correlaciona con el alias que le pasan, y se niega a uno que no es un alias", () => {
    expect(currentChampionSql("x")).toContain("cch_r.fighter_id = x.id");
    expect(() => currentChampionSql("f.id; drop table rankings")).toThrow();
  });
});

describe("🔴 las consultas que pintan tarjetas usan la regla", () => {
  const helper = currentChampionSql("f");
  const consultas = () => sqlMock.mock.calls.map(([query]) => String(query));

  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockImplementation((query: string) =>
      Promise.resolve(
        (query.includes("count(*)::text as total") ? [{ total: "0" }] : []) as never,
      ),
    );
  });

  it("la portada, del ranking libra por libra", async () => {
    await getFeaturedFighters(6, "womens_pound_for_pound");
    expect(consultas()[0]).toContain(`${helper} as is_champion`);
  });

  it("la portada, del plan B «los de más peleas» (con rankings vacía)", async () => {
    await getFeaturedFighters();
    expect(consultas()).toHaveLength(2);
    expect(consultas()[1]).toContain(`${helper} as is_champion`);
  });

  // /fighters no repite la regla: ya lee la última foto en su CTE `rel` (el
  // orden por relevancia) y saca de ahí el oro sin tocar otra vez la tabla.
  it("/fighters la saca de su CTE `rel`, que es la última foto", async () => {
    await getFighters();
    const lista = consultas().find((q) => q.includes("from fighters f") && q.includes("limit $"));
    expect(lista, "no llegó la consulta del listado").toBeDefined();
    const rel = /rel as \(([\s\S]*?)\n\s*\),/.exec(lista ?? "")?.[1] ?? "";
    expect(rel, "el CTE rel no lee la última foto").toContain("where snapshot_date = (select d from latest)");
    expect(lista).toContain("with latest as (select max(snapshot_date) as d from rankings)");
    expect(rel).toMatch(/bool_or\(is_champion\) as is_champion/);
    expect(lista).toContain("coalesce(rel.is_champion, false) as is_champion");
  });
});
