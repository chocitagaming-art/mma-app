import { describe, expect, it } from "vitest";

import { computeControlShare } from "@/lib/queries/fighters.mappers";

// Cuota de control = segundos de control / segundos de combate.
//
// LA TRAMPA, medida contra Neon el 9-ago-2026: el numerador y el denominador
// TIENEN QUE SALIR DE LA MISMA MUESTRA. Si se usa la suma global de control
// (sin filtro de era) contra el denominador que sí lo lleva (>= 2001), salen
// 3 fichas por encima del 100 % —la peor al 363,1 %— y 312 con denominador 0.
// Tomando los dos de la muestra cronometrada: 0 por encima del 100 % y un
// máximo real del 89,7 %.
// La firma pide las peleas de la muestra y las peleas con estadística: el
// criterio es que la muestra CUBRA LA CARRERA REGISTRADA ENTERA.
describe("computeControlShare", () => {
  it("calcula la fracción del combate que el luchador pasó controlando", () => {
    expect(computeControlShare(232, 400, 3, 3)).toBeCloseTo(0.58);
  });

  it("devuelve null sin denominador: no hay combate cronometrado que repartir", () => {
    expect(computeControlShare(0, 0, 0, 0)).toBeNull();
  });

  it("devuelve null también si el denominador es negativo o absurdo", () => {
    expect(computeControlShare(100, -5, 3, 3)).toBeNull();
  });

  // Un cero aquí es un dato: peleó y no controló ni un segundo.
  it("publica un 0 % legítimo cuando hubo combate y cero control", () => {
    expect(computeControlShare(0, 900, 3, 3)).toBe(0);
  });

  // Controlar más segundos que los que duró el combate es imposible: es un dato
  // roto, y publicarlo sería inventar. Mejor no enseñar nada que enseñar 363 %.
  it("devuelve null si el control supera la duración del combate", () => {
    expect(computeControlShare(500, 400, 3, 3)).toBeNull();
  });

  it("acepta el caso límite de control igual a la duración", () => {
    expect(computeControlShare(400, 400, 3, 3)).toBe(1);
  });

  // 🪤 EL CASO DE DAVID ABBOTT (id 8793), que se publicó roto y lo cazó una
  // revisión posterior. Tiene 18 peleas con estadística; las 15 anteriores a
  // 2001 traen el control como NULL y solo 3 entran en la muestra. Comparar
  // el CONTROL no bastaba —123 de control en la muestra y 123 en total, así que
  // pasaba— y la ficha publicaba «T. control 2:03 · 41 % del combate»: 2:03 al
  // 41 % implicaría una carrera de cinco minutos, cuando lleva 5.123 segundos
  // registrados. El criterio bueno es que la muestra cubra TODAS las peleas.
  it("devuelve null si la muestra deja fuera peleas con estadística", () => {
    // El caso Abbott: 123 s de control en 299 s, pero solo 3 de sus 18 peleas.
    expect(computeControlShare(123, 299, 3, 18)).toBeNull();
  });

  it("sí lo publica cuando la muestra cubre la carrera registrada entera", () => {
    expect(computeControlShare(600, 1200, 12, 12)).toBe(0.5);
  });

  // El control como NULL en las peleas excluidas hacía que el criterio viejo
  // (comparar sumas de control) fuera ciego justo ahí: NULL suma 0, así que las
  // dos sumas coincidían. Contar peleas no tiene ese punto ciego.
  it("no se deja engañar por peleas excluidas que no aportan control", () => {
    expect(computeControlShare(300, 600, 2, 5)).toBeNull();
  });
});
