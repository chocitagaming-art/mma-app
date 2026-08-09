import { describe, expect, it } from "vitest";

import {
  fightResultCaseSql,
  isNoContestMethod,
  noContestSqlPredicate,
} from "@/lib/fight-result";

// Los métodos de abajo NO son inventados: son los valores literales que hay en
// la columna `fights.method` de producción, contados el 9-ago-2026 sobre las
// 224 filas con winner_id NULL:
//   CNC 33 · Overturned* 59 · M-DEC 38 · S-DEC 17 · U-DEC 7 · Other 2 · NULL 68
// No existe ni una fila con method 'Draw' ni 'Decision - ...' en `fights`.
describe("isNoContestMethod", () => {
  it("treats the ufcstats no-contest code CNC as a no contest", () => {
    expect(isNoContestMethod("CNC")).toBe(true);
  });

  it("treats a bare Overturned as a no contest", () => {
    expect(isNoContestMethod("Overturned")).toBe(true);
  });

  // 18 de las 59 filas 'Overturned' llevan el detalle concatenado detrás
  // (_join_method en parsers/fights.py). Un `=== "Overturned"` las perdería.
  it("treats Overturned with a concatenated detail as a no contest", () => {
    expect(isNoContestMethod("Overturned - Guillotine Choke")).toBe(true);
  });

  // Las tres decisiones son EMPATES de verdad: 62 filas que deben seguir
  // rotulando "Empate".
  it.each(["M-DEC", "S-DEC", "U-DEC"])(
    "does not treat the draw method %s as a no contest",
    (method) => {
      expect(isNoContestMethod(method)).toBe(false);
    },
  );

  // Decisión del dueño (9-ago-2026): las 2 únicas filas con method 'Other' son
  // Gracie-Shamrock (UFC 5) y Taktarov-Shamrock (UFC 7), los empates históricos
  // por límite de tiempo. No son no-contests aunque el récord UFC los excluyera.
  it("does not treat Other as a no contest: they are the 1995 time-limit draws", () => {
    expect(isNoContestMethod("Other")).toBe(false);
  });

  it("does not treat a missing method as a no contest", () => {
    expect(isNoContestMethod(null)).toBe(false);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(isNoContestMethod("  overturned - punch  ")).toBe(true);
  });
});

describe("fightResultCaseSql", () => {
  const sql = fightResultCaseSql("$1");

  // El orden es la parte que se puede romper sin que nada se queje: TODOS los
  // no-contests tienen winner_id NULL, así que si la rama 'draw' va primero la
  // rama 'nc' es inalcanzable y el bug vuelve entero.
  it("puts the no-contest branch before the winnerless draw branch", () => {
    expect(sql.indexOf("'nc'")).toBeLessThan(sql.indexOf("then 'draw'"));
  });

  // Un combate programado (o cancelado) tiene method NULL. Va el primero de
  // todos: es la única señal fiable, y por fecha se escaparían las 7 peleas
  // canceladas de eventos ya celebrados.
  it("puts the scheduled branch before every other branch", () => {
    expect(sql.indexOf("'scheduled'")).toBeLessThan(sql.indexOf("'nc'"));
  });

  it("uses a prefix match so Overturned with detail is covered", () => {
    expect(sql).toContain("ilike 'overturn%'");
  });

  it("does not classify Other as a no contest", () => {
    expect(sql).not.toContain("'Other'");
  });

  it("compares the winner against the fighter placeholder it is given", () => {
    expect(fightResultCaseSql("$3")).toContain("winner_id = $3");
  });

  it("accepts a different table alias", () => {
    expect(fightResultCaseSql("$1", "f")).toContain("f.winner_id is null");
  });

  // El récord W-L-D usa el mismo criterio pero como predicado suelto. Que salga
  // de la misma función es el objetivo del fichero: dos definiciones separadas
  // es exactamente lo que dejó la ficha diciendo "3-1-0" arriba y "Empate"
  // abajo sobre la misma pelea.
  it("is built from the same predicate the record count uses", () => {
    expect(fightResultCaseSql("$1")).toContain(noContestSqlPredicate());
  });
});

describe("noContestSqlPredicate", () => {
  it("matches Overturned by prefix and CNC/NC by exact code", () => {
    expect(noContestSqlPredicate()).toBe(
      "(fi.method ilike 'overturn%' or fi.method in ('CNC', 'NC'))",
    );
  });

  it("does not mention Other: the two 1995 rows are draws", () => {
    expect(noContestSqlPredicate()).not.toContain("Other");
  });

  it("honours the table alias it is given", () => {
    expect(noContestSqlPredicate("f")).toContain("f.method ilike");
  });
});
