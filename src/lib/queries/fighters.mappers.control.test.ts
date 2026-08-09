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
describe("computeControlShare", () => {
  it("calcula la fracción del combate que el luchador pasó controlando", () => {
    // 232 s de control en 400 s de combate, y la muestra cubre todo el control.
    expect(computeControlShare(232, 400, 232)).toBeCloseTo(0.58);
  });

  it("devuelve null sin denominador: no hay combate cronometrado que repartir", () => {
    expect(computeControlShare(0, 0, 0)).toBeNull();
  });

  it("devuelve null también si el denominador es negativo o absurdo", () => {
    expect(computeControlShare(100, -5, 100)).toBeNull();
  });

  // Un cero aquí es un dato: peleó y no controló ni un segundo.
  it("publica un 0 % legítimo cuando hubo combate y cero control", () => {
    expect(computeControlShare(0, 900, 0)).toBe(0);
  });

  // Controlar más segundos que los que duró el combate es imposible: es un dato
  // roto, y publicarlo sería inventar. Mejor no enseñar nada que enseñar 363 %.
  it("devuelve null si el control supera la duración del combate", () => {
    expect(computeControlShare(500, 400, 500)).toBeNull();
  });

  it("acepta el caso límite de control igual a la duración", () => {
    expect(computeControlShare(400, 400, 400)).toBe(1);
  });

  // 🪤 EL TERCER ARGUMENTO, y es lo que impide que la ficha se contradiga. El
  // tile enseña el control TOTAL del luchador; la cuota solo puede calcularse
  // sobre las peleas cronometradas (>= 2001 y con duración legible). Cuando la
  // muestra no cubre todo ese control, el porcentaje no corresponde al tiempo
  // que hay escrito encima. Medido el 9-ago-2026: 74 fichas, 20 de ellas con
  // más de un 10 % de desvío. No se aproxima: no se publica.
  it("devuelve null si la muestra no cubre todo el control del luchador", () => {
    // Controló 900 s en su carrera, pero solo 600 caen en peleas cronometradas.
    expect(computeControlShare(600, 1200, 900)).toBeNull();
  });

  it("sí lo publica cuando la muestra cubre exactamente todo el control", () => {
    expect(computeControlShare(600, 1200, 600)).toBe(0.5);
  });
});
