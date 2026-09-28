import { describe, expect, it } from "vitest";

import { fightCountLabel, recordFightTotal } from "@/lib/fight-count";

// El pie de la tarjeta de luchador de la portada. La regla del dueño (28-sep):
// el número sale del MISMO récord que la tarjeta enseña al lado, así que cuadra
// por construcción. Makhachev 29-1-0 → «30 peleas».

describe("recordFightTotal · V + D + E del récord que se enseña", () => {
  it("suma las tres piezas", () => {
    expect(recordFightTotal(29, 1, 0)).toBe(30);
    expect(recordFightTotal(26, 4, 1)).toBe(31);
  });

  it("🪤 los no contests NO entran: no forman parte del récord que se pinta", () => {
    // Jon Jones tiene un no contest y la tarjeta enseña 28-1-0. Si el pie dijera
    // 30, sería la única cifra de la tarjeta que no sale de lo que se ve.
    expect(recordFightTotal(28, 1, 0)).toBe(29);
  });

  it("sin récord no se inventa un número: null", () => {
    expect(recordFightTotal(null, 1, 0)).toBeNull();
    expect(recordFightTotal(29, undefined, 0)).toBeNull();
    expect(recordFightTotal(Number.NaN, 1, 0)).toBeNull();
  });

  it("🪤 0-0-0 es el DEFAULT de la columna, no un dato: null", () => {
    // `fighters.wins/losses/draws` son `default 0`. Un luchador que está en la
    // base tiene como mínimo un combate UFC; «0 peleas» sería una mentira.
    expect(recordFightTotal(0, 0, 0)).toBeNull();
  });
});

describe("fightCountLabel · el rótulo del pie", () => {
  it("con récord: «N peleas»", () => {
    expect(fightCountLabel({ fightCount: 30, ufcFightCount: 19 })).toBe("30 peleas");
  });

  it("en singular cuando toca", () => {
    expect(fightCountLabel({ fightCount: 1, ufcFightCount: 1 })).toBe("1 pelea");
  });

  it("sin récord: cae a las UFC disputadas y lo DICE («N en UFC»)", () => {
    expect(fightCountLabel({ fightCount: null, ufcFightCount: 3 })).toBe("3 en UFC");
  });

  it("sin récord ni peleas UFC disputadas: no se pinta nada", () => {
    expect(fightCountLabel({ fightCount: null, ufcFightCount: 0 })).toBeNull();
    expect(fightCountLabel({ fightCount: null, ufcFightCount: null })).toBeNull();
  });
});
