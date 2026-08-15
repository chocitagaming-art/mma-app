import { describe, expect, it } from "vitest";

import {
  computeGrappledSplit,
  computeGripRounds,
  computeGripSplit,
  fightDurationSeconds,
  roundDurationSeconds,
} from "@/lib/fight-grip";

// TODAS las cifras de este fichero salen de consultar Neon el 9-ago-2026, y la
// respuesta esperada está derivada A MANO al lado de cada caso. Ningún número
// se ha copiado de lo que devuelve el código: un test que dice lo que produce
// el código no es un test, es un sello.

describe("fightDurationSeconds", () => {
  it("suma los asaltos completos y el reloj del último", () => {
    // 14232 Sousa-Miranda: U-DEC en el asalto 3. 2 asaltos enteros (600 s)
    // + 5:00 del tercero = 900 s.
    expect(fightDurationSeconds(3, "5:00")).toBe(900);
    // 13927 Goff-Miller: KO en el 3 a los 15 s. 600 + 15 = 615 s.
    expect(fightDurationSeconds(3, "0:15")).toBe(615);
    // 12863 Ankalaev-Guskov: KO en el 5 a 2:41. 4*300 + 161 = 1361 s.
    expect(fightDurationSeconds(5, "2:41")).toBe(1361);
  });

  it("respeta los asaltos sin límite de los primeros UFC", () => {
    // 11446 (1995): end_round 1, end_time 6:28. El asalto duró 388 s, más que
    // los 300 del formato moderno. Recortarlo a 300 inventaría un combate
    // más corto de lo que fue.
    expect(fightDurationSeconds(1, "6:28")).toBe(388);
  });

  it("devuelve null en vez de inventar una duración", () => {
    // end_time es TEXT sin restricción en la base: 68 filas lo tienen a NULL.
    expect(fightDurationSeconds(3, null)).toBeNull();
    expect(fightDurationSeconds(null, "5:00")).toBeNull();
    // Formatos que no son un reloj. La regla de la casa: sin denominador
    // fiable no se publica nada.
    expect(fightDurationSeconds(1, "")).toBeNull();
    expect(fightDurationSeconds(1, "5:0")).toBeNull();
    expect(fightDurationSeconds(1, "N/A")).toBeNull();
    expect(fightDurationSeconds(1, "5:60")).toBeNull();
    expect(fightDurationSeconds(0, "5:00")).toBeNull();
    expect(fightDurationSeconds(-1, "5:00")).toBeNull();
  });
});

describe("roundDurationSeconds", () => {
  it("da 300 a los asaltos completos y el reloj real al último", () => {
    // 13927: el KO cae a los 15 s del tercero.
    expect(roundDurationSeconds(1, 3, "0:15")).toBe(300);
    expect(roundDurationSeconds(2, 3, "0:15")).toBe(300);
    expect(roundDurationSeconds(3, 3, "0:15")).toBe(15);
    // 12863: el quinto duró 2:41 = 161 s.
    expect(roundDurationSeconds(5, 5, "2:41")).toBe(161);
  });

  it("no recorta el asalto largo de los combates antiguos", () => {
    // 11446: asalto único de 6:28.
    expect(roundDurationSeconds(1, 1, "6:28")).toBe(388);
  });

  it("devuelve null para un asalto que no se peleó", () => {
    // Pedir el asalto 4 de un combate que acabó en el 3 no es un 0: es una
    // pregunta sin respuesta.
    expect(roundDurationSeconds(4, 3, "5:00")).toBeNull();
    expect(roundDurationSeconds(0, 3, "5:00")).toBeNull();
    expect(roundDurationSeconds(1, 3, null)).toBeNull();
  });
});

describe("computeGripSplit", () => {
  it("reparte el combate del maquetado", () => {
    // 14232: Sousa (ROJO) 169 s, Miranda (AZUL) 231 s, 900 s de combate.
    // nadie = 900 - 169 - 231 = 500 s.
    // 169/900 = 18,78 %  ·  500/900 = 55,56 %  ·  231/900 = 25,67 %
    // Por resto mayor: 18 + 55 + 25 = 98, y los dos que faltan van a los dos
    // restos más grandes (0,78 del rojo y 0,67 del azul) -> 19, 55, 26.
    const split = computeGripSplit(169, 231, 900);
    expect(split).not.toBeNull();
    expect(split?.redSeconds).toBe(169);
    expect(split?.blueSeconds).toBe(231);
    expect(split?.nobodySeconds).toBe(500);
    expect(split?.totalSeconds).toBe(900);
    expect(split?.redPercent).toBe(19);
    expect(split?.bluePercent).toBe(26);
    expect(split?.nobodyPercent).toBe(55);
  });

  it("los tres porcentajes suman SIEMPRE 100", () => {
    // 🪤 Antes se redondeaba cada parte por su cuenta y en 14232 salía
    // 19 + 26 + 56 = 101. Eran 1.553 combates de 8.612 (18,0 %) publicando tres
    // trozos de un mismo entero que no cuadraban, uno al lado del otro y con la
    // misma tipografía. Ahora los tres los calcula `repartirPorcentajes`
    // juntos, por resto mayor.
    const split = computeGripSplit(169, 231, 900);
    expect(
      (split?.redPercent ?? 0) +
        (split?.bluePercent ?? 0) +
        (split?.nobodyPercent ?? 0),
    ).toBe(100);
    expect(split?.redShare).toBeCloseTo(169 / 900, 12);
    expect(split?.blueShare).toBeCloseTo(231 / 900, 12);
    expect(split?.nobodyShare).toBeCloseTo(500 / 900, 12);
    const suma =
      (split?.redShare ?? 0) + (split?.blueShare ?? 0) + (split?.nobodyShare ?? 0);
    expect(suma).toBeCloseTo(1, 12);
  });

  it("publica el cero de verdad", () => {
    // 12863: Guskov (AZUL) no sujetó a Ankalaev ni un segundo en 1361 s.
    // Ese 0 es un dato medido y se publica. Solo se calla el que no tiene
    // denominador — la misma regla que mapDefense y computeControlShare.
    const split = computeGripSplit(506, 0, 1361);
    expect(split?.blueSeconds).toBe(0);
    expect(split?.bluePercent).toBe(0);
    // 506/1361 = 0,37178… -> 37 %  ·  nadie = 855 -> 0,62821… -> 63 %
    expect(split?.redPercent).toBe(37);
    expect(split?.nobodyPercent).toBe(63);
  });

  it("🪤 nunca publica un 100 % sobre un tramo que no es el combate entero", () => {
    // 3850, Rozenstruik vs Tuivasa: 1 s y 1 s de agarre en 900. El residuo son
    // 898 s = 99,78 %, que redondeado a pelo sale 100 y afirma que NADIE sujetó
    // a nadie — dos líneas por encima de un «lo tuvo sujeto 0:01». Eran 86
    // combates. El 100 % no es un redondeo más: es una afirmación absoluta.
    const split = computeGripSplit(1, 1, 900);
    expect(split?.nobodySeconds).toBe(898);
    expect(split?.nobodyPercent).toBe(99);
    expect(split?.nobodyPercent).not.toBe(100);
  });

  it("pero el 100 % LEGÍTIMO se sigue publicando", () => {
    // 167 combates de 8.612 se pelean sin que ninguno llegue a sujetar. Ahí el
    // 100 % es verdad y taparlo sería el error contrario.
    const split = computeGripSplit(0, 0, 900);
    expect(split?.nobodyPercent).toBe(100);
    expect(split?.redPercent).toBe(0);
    expect(split?.bluePercent).toBe(0);
  });

  it("BARRIDO — los tres suman 100 y ningún 100 % es falso", () => {
    // Recorre el espacio de duraciones y repartos. Es la comprobación que
    // ninguna de las de arriba hace sola.
    let casos = 0;
    for (let total = 30; total <= 1500; total += 11) {
      for (const red of [0, 1, 2, 5, 37, Math.floor(total / 3), total]) {
        for (const blue of [0, 1, 3, 19, Math.floor(total / 4)]) {
          if (red + blue > total) continue;
          const split = computeGripSplit(red, blue, total);
          if (!split) continue;
          casos += 1;
          const ctx = `total=${total} red=${red} blue=${blue}`;

          expect(
            split.redPercent + split.bluePercent + split.nobodyPercent,
            ctx,
          ).toBe(100);

          for (const [segundos, porcentaje] of [
            [split.redSeconds, split.redPercent],
            [split.blueSeconds, split.bluePercent],
            [split.nobodySeconds, split.nobodyPercent],
          ] as const) {
            // Un 100 % solo cuando esa parte ES todo lo pintado.
            if (porcentaje === 100) {
              expect(segundos, ctx).toBe(
                split.redSeconds + split.blueSeconds + split.nobodySeconds,
              );
            }
            // Y ningún porcentaje se aleja más de un punto del real: es la
            // guarda que tumbó el primer intento de arreglo, que ponía un suelo
            // de 1 a las partes diminutas e inflaba el total.
            const pintado =
              split.redSeconds + split.blueSeconds + split.nobodySeconds;
            expect(
              Math.abs(porcentaje - (segundos / pintado) * 100),
              ctx,
            ).toBeLessThan(1);
          }
        }
      }
    }
    expect(casos).toBeGreaterThan(1000);
  });

  it("calla cuando no hay dato, en vez de dibujar un cero", () => {
    // 374 filas de fight_stats_rounds tienen el control a NULL (toda la era
    // 1995-1998). "No se midió" no es "no se agarraron": dibujar la barra
    // llena de "nadie sujetaba" sería publicar una mentira con cara de dato.
    expect(computeGripSplit(null, 231, 900)).toBeNull();
    expect(computeGripSplit(169, null, 900)).toBeNull();
    expect(computeGripSplit(null, null, 900)).toBeNull();
    expect(computeGripSplit(169, 231, null)).toBeNull();
    expect(computeGripSplit(169, 231, 0)).toBeNull();
  });

  it("no deja que el residuo se vuelva negativo", () => {
    // Cinturón. Medido el 9-ago: con el acta esto NO pasa nunca (0 combates
    // de 8.764 y 0 asaltos con rojo+azul por encima de su duración). Pero el
    // directo sí lo produce, y esta función la va a reutilizar la variante B.
    const split = computeGripSplit(200, 200, 300);
    expect(split?.nobodySeconds).toBe(0);
    expect(split?.nobodyShare).toBe(0);
    expect(split?.nobodyPercent).toBe(0);
  });

  it("rechaza segundos imposibles en vez de propagarlos", () => {
    expect(computeGripSplit(-5, 231, 900)).toBeNull();
    expect(computeGripSplit(169, Number.NaN, 900)).toBeNull();
    expect(computeGripSplit(169, 231, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("computeGrappledSplit", () => {
  it("da el segundo denominador de la regla 5", () => {
    // 14232: de los 400 s que alguno sujetó (169 + 231), Miranda se llevó
    // 231/400 = 0,5775 -> 58 %. Es el otro encuadre de la MISMA pelea: sobre
    // el combate entero Miranda es 26 %, sobre el agarre es 58 %.
    const g = computeGrappledSplit(169, 231);
    expect(g?.grappledSeconds).toBe(400);
    expect(g?.leader).toBe("blue");
    expect(g?.leaderPercent).toBe(58);
  });

  it("no nombra líder cuando el agarre está partido por la mitad", () => {
    const g = computeGrappledSplit(120, 120);
    expect(g?.grappledSeconds).toBe(240);
    expect(g?.leader).toBeNull();
    expect(g?.leaderPercent).toBe(50);
  });

  it("calla cuando nadie sujetó a nadie", () => {
    // Sin agarre no hay denominador, y "el 0 % de 0 segundos" no significa
    // nada. La frase entera desaparece.
    expect(computeGrappledSplit(0, 0)).toBeNull();
    expect(computeGrappledSplit(null, 231)).toBeNull();
  });
});

describe("computeGripRounds", () => {
  it("imprime los tres asaltos del criterio de aceptación", () => {
    // 🎯 CRITERIO DURO. Medido contra fight_stats_rounds el 9-ago:
    //    R1 64/147 · R2 57/31 · R3 48/53
    // Si sale otra cosa, algo está filtrando o repartiendo a ojo.
    const rounds = computeGripRounds(
      [
        { round: 1, redControlSeconds: 64, blueControlSeconds: 147 },
        { round: 2, redControlSeconds: 57, blueControlSeconds: 31 },
        { round: 3, redControlSeconds: 48, blueControlSeconds: 53 },
      ],
      3,
      "5:00",
    );
    expect(rounds.map((r) => r.split?.redSeconds)).toEqual([64, 57, 48]);
    expect(rounds.map((r) => r.split?.blueSeconds)).toEqual([147, 31, 53]);
    // nadie por asalto: 300-64-147 = 89 · 300-57-31 = 212 · 300-48-53 = 199
    expect(rounds.map((r) => r.split?.nobodySeconds)).toEqual([89, 212, 199]);
  });

  it("cuadra con el total del acta", () => {
    // Invariante: la suma de los asaltos tiene que dar el reparto global.
    // 64+57+48 = 169 (Sousa) · 147+31+53 = 231 (Miranda) · 89+212+199 = 500.
    const rounds = computeGripRounds(
      [
        { round: 1, redControlSeconds: 64, blueControlSeconds: 147 },
        { round: 2, redControlSeconds: 57, blueControlSeconds: 31 },
        { round: 3, redControlSeconds: 48, blueControlSeconds: 53 },
      ],
      3,
      "5:00",
    );
    const suma = (campo: "redSeconds" | "blueSeconds" | "nobodySeconds") =>
      rounds.reduce((acc, r) => acc + (r.split?.[campo] ?? 0), 0);
    expect(suma("redSeconds")).toBe(169);
    expect(suma("blueSeconds")).toBe(231);
    expect(suma("nobodySeconds")).toBe(500);
  });

  it("usa la duración real del último asalto, no 300", () => {
    // 13927 Goff-Miller, KO en el tercero a los 15 s. El azul tiene 1 s de
    // control en ese asalto: 1/15 = 6,67 % -> 7 %. Con 300 de denominador
    // saldría 1/300 = 0,33 % -> 0 %, y el asalto entero se leería como
    // "nadie sujetaba al 100 %".
    const rounds = computeGripRounds(
      [
        { round: 1, redControlSeconds: 166, blueControlSeconds: 0 },
        { round: 2, redControlSeconds: 0, blueControlSeconds: 59 },
        { round: 3, redControlSeconds: 0, blueControlSeconds: 1 },
      ],
      3,
      "0:15",
    );
    expect(rounds[2]?.split?.totalSeconds).toBe(15);
    expect(rounds[2]?.split?.bluePercent).toBe(7);
    expect(rounds[2]?.split?.nobodyPercent).toBe(93);
  });

  it("marca no medido el asalto sin acta, sin repartirlo a ojo", () => {
    // 11433 y compañía: los 6 registros con el control a NULL. El asalto se
    // rotula "no medido"; los que sí tienen dato se siguen dibujando.
    const rounds = computeGripRounds(
      [
        { round: 1, redControlSeconds: 64, blueControlSeconds: 147 },
        { round: 2, redControlSeconds: null, blueControlSeconds: null },
        { round: 3, redControlSeconds: 48, blueControlSeconds: 53 },
      ],
      3,
      "5:00",
    );
    expect(rounds).toHaveLength(3);
    expect(rounds[0]?.split).not.toBeNull();
    expect(rounds[1]?.split).toBeNull();
    expect(rounds[2]?.split).not.toBeNull();
  });

  it("ordena por asalto y descarta los que no se pelearon", () => {
    // Las filas llegan de la base ordenadas, pero el orden es un invariante
    // del dibujo: el asalto 2 a la derecha del 1, siempre.
    const rounds = computeGripRounds(
      [
        { round: 3, redControlSeconds: 48, blueControlSeconds: 53 },
        { round: 1, redControlSeconds: 64, blueControlSeconds: 147 },
        { round: 2, redControlSeconds: 57, blueControlSeconds: 31 },
        // El acta no debería traer un asalto 4 de un combate que acabó en el
        // 3, pero si lo trae no se dibuja: no tiene duración con la que
        // calcular ningún porcentaje.
        { round: 4, redControlSeconds: 10, blueControlSeconds: 10 },
      ],
      3,
      "5:00",
    );
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  });

  it("una fila que cubre dos asaltos se divide entre lo que duraron LOS DOS", () => {
    // 12877 Klein-Musayev, KO en el segundo a 4:07. Del asalto 1 no se guardó
    // ninguna muestra del directo, así que los 62 s de agarre del azul cubren
    // los dos asaltos (el acta dice 20 + 42 = 62). El denominador tiene que ser
    // 300 + 247 = 547, no 247: con el del asalto suelto saldría un 25 % donde
    // hay un 11 %, más del doble.
    const rounds = computeGripRounds(
      [{ round: 2, covers: [1, 2], redControlSeconds: 0, blueControlSeconds: 62 }],
      2,
      "4:07",
    );
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.covers).toEqual([1, 2]);
    expect(rounds[0]?.split?.totalSeconds).toBe(547);
    expect(rounds[0]?.split?.blueSeconds).toBe(62);
    // 62/547 = 11,33 % -> 11
    expect(rounds[0]?.split?.bluePercent).toBe(11);
  });

  it("una fila fundida que incluye un asalto que no se peleó no se dibuja", () => {
    // Si `covers` menciona un asalto sin duración conocida, del tramo entero no
    // se sabe la duración: sumar solo los que sí se saben daría un denominador
    // corto y con él un porcentaje inflado.
    expect(
      computeGripRounds(
        [{ round: 4, covers: [3, 4], redControlSeconds: 10, blueControlSeconds: 10 }],
        3,
        "5:00",
      ),
    ).toEqual([]);
  });

  it("🪤 marca no medido el asalto cuya suma no cabe, en vez de recortarlo", () => {
    // 14493 R3: las muestras del directo dan 245 + 71 = 316 s dentro de un
    // asalto de 300. El cinturón de computeGripSplit cerraría la barra
    // publicando 78 % / 0 % / 22 %, cuando el acta dice 59 % / 39 % / 2 %.
    // Veinte puntos de más a un luchador no son un redondeo.
    const rounds = computeGripRounds(
      [{ round: 3, redControlSeconds: 245, blueControlSeconds: 71 }],
      3,
      "5:00",
    );
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.split).toBeNull();
    expect(rounds[0]?.unmeasured).toBe("no-cuadra");
  });

  it("distingue «no hay dato» de «los datos no cuadran»", () => {
    // Las dos son "no lo sé", pero no se escriben igual en pantalla: una culpa
    // al acta y la otra no.
    const rounds = computeGripRounds(
      [
        { round: 1, redControlSeconds: null, blueControlSeconds: null },
        { round: 2, redControlSeconds: 200, blueControlSeconds: 200 },
        { round: 3, redControlSeconds: 48, blueControlSeconds: 53 },
      ],
      3,
      "5:00",
    );
    expect(rounds[0]?.unmeasured).toBe("sin-dato");
    expect(rounds[1]?.unmeasured).toBe("no-cuadra");
    // Y el que sí se puede repartir no lleva motivo ninguno.
    expect(rounds[2]?.unmeasured).toBeUndefined();
  });

  it("la suma que cabe JUSTA se sigue publicando", () => {
    // El límite es <=, no <: dos luchadores que se pasan el asalto entero
    // agarrados suman exactamente la duración y eso es un dato bueno.
    const rounds = computeGripRounds(
      [{ round: 1, redControlSeconds: 150, blueControlSeconds: 150 }],
      1,
      "5:00",
    );
    expect(rounds[0]?.split).not.toBeNull();
    expect(rounds[0]?.split?.nobodySeconds).toBe(0);
    expect(rounds[0]?.unmeasured).toBeUndefined();
  });

  it("devuelve lista vacía cuando no hay nada que dibujar", () => {
    expect(computeGripRounds([], 3, "5:00")).toEqual([]);
    expect(
      computeGripRounds(
        [{ round: 1, redControlSeconds: 64, blueControlSeconds: 147 }],
        3,
        null,
      ),
    ).toEqual([]);
  });
});
