import { describe, expect, it } from "vitest";

import {
  SUBMISSION_DEFENSE_MIN_ATTEMPTS,
  computeSubmissionDefense,
} from "@/lib/queries/fighters.mappers";

// Defensa de sumisión = de los intentos que le hicieron, cuántos sobrevivió.
//
// EL UMBRAL ES DECISIÓN DEL DUEÑO (9-ago-2026), tomada sobre estas cifras
// medidas contra Neon, en fichas de 2.859 que ven el medidor:
//   umbral 1 -> 63,94 %   umbral 3 -> 30,85 %   umbral 5 -> 16,37 %
// Se eligió 3. Con 1, las 556 fichas con un único intento encajado solo podrían
// decir 100 % o 0 %, que es ruido con cara de dato; con 5 se quedaban fuera 83
// de cada 100 fichas, incluidas las de élite (los 176 rankeados tienen la misma
// muestra que el resto: 2,4 intentos encajados de media).
describe("SUBMISSION_DEFENSE_MIN_ATTEMPTS", () => {
  it("es 3, la decisión del dueño", () => {
    expect(SUBMISSION_DEFENSE_MIN_ATTEMPTS).toBe(3);
  });
});

describe("computeSubmissionDefense", () => {
  it("calcula la fracción de intentos que sobrevivió", () => {
    // Le intentaron 8 sumisiones y perdió por una: sobrevivió a 7.
    expect(computeSubmissionDefense(8, 1)).toBeCloseTo(7 / 8);
  });

  it("publica el 100 % de quien nunca ha sido sometido", () => {
    expect(computeSubmissionDefense(6, 0)).toBe(1);
  });

  // Un cero aquí es un dato: le intentaron 3 y perdió las 3.
  it("publica un 0 % legítimo", () => {
    expect(computeSubmissionDefense(3, 3)).toBe(0);
  });

  it("muestra el medidor justo al llegar al umbral", () => {
    expect(computeSubmissionDefense(3, 1)).toBeCloseTo(2 / 3);
  });

  it("lo esconde justo por debajo del umbral", () => {
    expect(computeSubmissionDefense(2, 0)).toBeNull();
  });

  // 1.031 fichas (36 %) no han encajado jamás un intento de sumisión. Sin este
  // guard, la fase 7 habría multiplicado por 2,6 el bug de los "0 %" falsos que
  // acabamos de arreglar en mapDefense.
  it("no inventa nada cuando nadie le intentó una sumisión", () => {
    expect(computeSubmissionDefense(0, 0)).toBeNull();
  });

  // 🪤 No existe columna de sumisiones consumadas: se derivan de fights.method,
  // que es otra fuente. 9 fichas tienen hoy más sumisiones sufridas que
  // intentos encajados registrados — ninguna llega al umbral, pero el dato
  // incoherente no se publica aunque llegase: daría un porcentaje negativo.
  it("devuelve null si sufrió más sumisiones de las que le intentaron", () => {
    expect(computeSubmissionDefense(4, 6)).toBeNull();
  });
});
