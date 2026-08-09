import { describe, expect, it } from "vitest";

import { mapDefense } from "@/lib/queries/fighters.mappers";
import type { DefenseRow } from "@/lib/queries/fighters.types";

// La query de defensa es un agregado SIN group by, así que devuelve siempre una
// fila: con NULLs cuando el luchador no tiene ni una fila en fight_stats. Por eso
// hay dos formas de quedarse sin denominador y las dos importan.
function fila(extra: Partial<DefenseRow> = {}): DefenseRow {
  return {
    opp_sig_strikes_landed: null,
    opp_sig_strikes_attempted: null,
    opp_takedowns_landed: null,
    opp_takedowns_attempted: null,
    opp_submission_attempts: null,
    submissions_lost: null,
    ...extra,
  };
}

describe("mapDefense", () => {
  // El bug, medido contra Neon el 9-ago-2026: 398 fichas de 2.859 pintaban
  // "Defensa de derribo 0 % · 0 de 0 permitidos" sin que nadie les hubiera
  // intentado un derribo. Otras 170 lo mismo en "Defensa de golpeo".
  it("no inventa un 0 % cuando el rival no intentó ni un derribo", () => {
    const d = mapDefense(fila({ opp_takedowns_attempted: "0", opp_takedowns_landed: "0" }));
    expect(d.takedownDefense).toBeNull();
  });

  it("no inventa un 0 % cuando el rival no tiró ni un golpe significativo", () => {
    const d = mapDefense(fila({ opp_sig_strikes_attempted: "0", opp_sig_strikes_landed: "0" }));
    expect(d.strikingDefense).toBeNull();
  });

  // Los 160 luchadores sin ninguna fila en fight_stats: la query devuelve NULLs.
  it("tampoco lo inventa cuando el luchador no tiene ni una estadística", () => {
    const d = mapDefense(fila());
    expect(d.takedownDefense).toBeNull();
    expect(d.strikingDefense).toBeNull();
  });

  it("devuelve nulos si no hay ni fila", () => {
    const d = mapDefense(undefined);
    expect(d.takedownDefense).toBeNull();
    expect(d.strikingDefense).toBeNull();
  });

  // 🪤 EL CONTRA-CASO, y es el que impide arreglar esto mirando el valor: 207
  // fichas tienen un 0 % de defensa de derribo VERDADERO — les intentaron
  // derribos y encajaron todos. Ese cero se publica.
  it("SÍ publica un 0 % legítimo: le intentaron 4 derribos y encajó los 4", () => {
    const d = mapDefense(fila({ opp_takedowns_attempted: "4", opp_takedowns_landed: "4" }));
    expect(d.takedownDefense).toBe(0);
  });

  it("calcula la fracción de intentos que NO conectaron", () => {
    // 4 intentados, 1 conectado => defendió 3 de 4.
    const d = mapDefense(fila({ opp_takedowns_attempted: "4", opp_takedowns_landed: "1" }));
    expect(d.takedownDefense).toBeCloseTo(0.75);
  });

  it("calcula igual la de golpeo", () => {
    // 358 intentados, 104 conectados => defendió 254 de 358.
    const d = mapDefense(fila({ opp_sig_strikes_attempted: "358", opp_sig_strikes_landed: "104" }));
    expect(d.strikingDefense).toBeCloseTo(1 - 104 / 358);
  });

  // Los contadores del texto de apoyo siguen siendo números: son un recuento,
  // no un ratio, y "0 de 0" es cierto aunque el porcentaje no exista.
  it("mantiene los contadores como números aunque el ratio sea nulo", () => {
    const d = mapDefense(fila());
    expect(d.oppTakedownsAttempted).toBe(0);
    expect(d.oppSigStrikesAttempted).toBe(0);
  });

  // Las dos métricas son independientes: hay fichas con golpes encajados y cero
  // derribos intentados en contra.
  it("resuelve cada métrica por su cuenta", () => {
    const d = mapDefense(
      fila({
        opp_sig_strikes_attempted: "358",
        opp_sig_strikes_landed: "104",
        opp_takedowns_attempted: "0",
        opp_takedowns_landed: "0",
      }),
    );
    expect(d.strikingDefense).not.toBeNull();
    expect(d.takedownDefense).toBeNull();
  });
});
