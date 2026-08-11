import { describe, expect, it } from "vitest";

import {
  buildFightGripView,
  gripSegments,
  segmentBoundaries,
  winnerCorner,
  type FightGripViewInput,
} from "@/lib/fight-grip-view";
import { computeGripSplit, type GripSplit } from "@/lib/fight-grip";

// El combate del maquetado, con las cifras del acta verificadas contra Neon:
// 14232, Sousa (ROJO, id 7245) vs Miranda (AZUL, id 9109), U-DEC para Sousa.
// ctrl 169 s / 231 s en 900 s. Asaltos: 64/147, 57/31, 48/53.
const CANONICO: FightGripViewInput = {
  redControlSeconds: 169,
  blueControlSeconds: 231,
  rounds: [
    { round: 1, redControlSeconds: 64, blueControlSeconds: 147 },
    { round: 2, redControlSeconds: 57, blueControlSeconds: 31 },
    { round: 3, redControlSeconds: 48, blueControlSeconds: 53 },
  ],
  redName: "Ismael Sousa",
  blueName: "Vitor Miranda",
  redId: 7245,
  blueId: 9109,
  winnerId: 7245,
  method: "U-DEC",
  endRound: 3,
  endTime: "5:00",
};

const split = (red: number, blue: number, total: number): GripSplit =>
  computeGripSplit(red, blue, total) as GripSplit;

describe("winnerCorner", () => {
  it("traduce el id de cada esquina", () => {
    expect(winnerCorner(7245, 7245, 9109)).toBe("red");
    expect(winnerCorner(9109, 7245, 9109)).toBe("blue");
  });

  it("sin ganador devuelve null", () => {
    // 156 combates disputados no tienen ganador: 64 empates y 92 anulados.
    expect(winnerCorner(null, 7245, 9109)).toBeNull();
  });

  it("🪤 un combate por disputar NO declara ganador al rojo", () => {
    // La trampa: en un TBD el id de la esquina es null Y winnerId es null, así
    // que `winnerId === redId` es `null === null`, que es TRUE. La comparación
    // ingenua publicaría el desenlace de una pelea que no se ha celebrado.
    expect(winnerCorner(null, null, null)).toBeNull();
    expect(winnerCorner(null, null, 9109)).toBeNull();
    expect(winnerCorner(null, 7245, null)).toBeNull();
  });

  it("un ganador que no es ninguna de las dos esquinas devuelve null", () => {
    expect(winnerCorner(1234, 7245, 9109)).toBeNull();
  });
});

describe("gripSegments", () => {
  it("devuelve los tres tramos en orden rojo → nadie → azul", () => {
    // El orden es un invariante del dibujo, no una casualidad: el rojo va
    // SIEMPRE a la izquierda porque #d20a0a y #0a5fc2 tienen casi la misma
    // luminancia y en escala de grises solo desambigua la posición.
    const segments = gripSegments(split(169, 231, 900));
    expect(segments.map((s) => s.corner)).toEqual(["red", "nobody", "blue"]);
  });

  it("la anchura sale de share, no de percent", () => {
    const segments = gripSegments(split(169, 231, 900));
    const suma = segments.reduce((acc, s) => acc + s.share, 0);
    expect(suma).toBeCloseTo(1, 10);

    // Los enteros ya suman 100 —los reparte `repartirPorcentajes` juntos— pero
    // siguen sin ser la anchura: son un redondeo, y la barra necesita la
    // fracción exacta para que los tramos no se desplacen medio punto.
    const sumaPercent = segments.reduce((acc, s) => acc + s.percent, 0);
    expect(sumaPercent).toBe(100);
    expect(segments[0].share).not.toBe(segments[0].percent / 100);
  });

  it("trae el reloj de cada tramo ya formateado", () => {
    const segments = gripSegments(split(169, 231, 900));
    expect(segments.map((s) => s.clock)).toEqual(["2:49", "8:20", "3:51"]);
    expect(segments.map((s) => s.percent)).toEqual([19, 55, 26]);
  });

  it("descarta los tramos de anchura cero", () => {
    // 167 combates de 8.612 se pelean sin que ninguno llegue a sujetar: ahí
    // solo hay un tramo. Dibujar dos tramos de 0 px con su separador de 2 px
    // los haría visibles, que es justo la mentira que evitamos.
    const soloNadie = gripSegments(split(0, 0, 900));
    expect(soloNadie.map((s) => s.corner)).toEqual(["nobody"]);

    const sinRojo = gripSegments(split(0, 231, 900));
    expect(sinRojo.map((s) => s.corner)).toEqual(["nobody", "blue"]);
  });

  it("un cero MEDIDO sigue apareciendo en el texto aunque no se dibuje", () => {
    // El tramo desaparece del dibujo, pero el dato no se pierde: el titular y
    // las frases siguen contando los dos lados.
    const segments = gripSegments(split(0, 231, 900));
    expect(segments.some((s) => s.corner === "red")).toBe(false);
    expect(split(0, 231, 900).redSeconds).toBe(0);
    expect(split(0, 231, 900).redPercent).toBe(0);
  });
});

describe("segmentBoundaries", () => {
  it("pone una frontera entre cada par de tramos visibles", () => {
    const segments = gripSegments(split(169, 231, 900));
    const boundaries = segmentBoundaries(segments);

    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).toBeCloseTo((169 / 900) * 100, 6);
    expect(boundaries[1]).toBeCloseTo(((169 + 500) / 900) * 100, 6);
  });

  it("con un solo tramo no hay ninguna frontera", () => {
    expect(segmentBoundaries(gripSegments(split(0, 0, 900)))).toEqual([]);
  });

  it("con dos tramos hay exactamente una", () => {
    expect(segmentBoundaries(gripSegments(split(0, 231, 900)))).toHaveLength(1);
  });

  it("ninguna frontera cae en 0 ni en 100", () => {
    // Una frontera en el borde sería un separador pegado al canto de la barra:
    // se leería como si hubiera un tramo más, invisible.
    for (const caso of [
      split(169, 231, 900),
      split(0, 231, 900),
      split(450, 450, 900),
    ]) {
      for (const posicion of segmentBoundaries(gripSegments(caso))) {
        expect(posicion).toBeGreaterThan(0);
        expect(posicion).toBeLessThan(100);
      }
    }
  });
});

describe("buildFightGripView", () => {
  it("arma el bloque entero del combate canónico", () => {
    const view = buildFightGripView(CANONICO);
    expect(view).not.toBeNull();
    if (!view) return;

    expect(view.split.totalSeconds).toBe(900);
    expect(view.totalClock).toBe("15:00");
    expect(view.redLastName).toBe("Sousa");
    expect(view.blueLastName).toBe("Miranda");
    expect(view.segments).toHaveLength(3);
    expect(view.rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  });

  it("el criterio de aceptación duro: los seis números del acta", () => {
    // Si alguna de estas seis cifras cambia, la tira está filtrando algo que
    // no debe. Es el criterio que fija la especificación para 14232.
    const view = buildFightGripView(CANONICO);
    expect(view).not.toBeNull();
    if (!view) return;

    const porAsalto = view.rounds.map((r) => [
      r.split?.redSeconds,
      r.split?.blueSeconds,
    ]);
    expect(porAsalto).toEqual([
      [64, 147],
      [57, 31],
      [48, 53],
    ]);
  });

  it("el titular nombra al que más sujetó y la nota dice que perdió", () => {
    const view = buildFightGripView(CANONICO);
    expect(view?.headline.headline).toBe(
      "Miranda lo tuvo sujeto un minuto más que Sousa",
    );
    expect(view?.headline.note).toContain("aun así perdió");
    expect(view?.headline.grappledLine).toContain("Miranda se llevó el 58 %");
  });

  it("sin acta de agarre no hay bloque", () => {
    // La regla de la casa: un ratio sin denominador es null y NO SE PINTA.
    // Son 152 combates, toda la era 1995-1998.
    expect(
      buildFightGripView({
        ...CANONICO,
        redControlSeconds: null,
        blueControlSeconds: null,
      }),
    ).toBeNull();
  });

  it("con una sola esquina sin acta tampoco: media barra sería mentira", () => {
    expect(
      buildFightGripView({ ...CANONICO, blueControlSeconds: null }),
    ).toBeNull();
  });

  it("sin reloj de fin no hay denominador y no hay bloque", () => {
    // 69 combates de 8.852 tienen end_time a NULL.
    expect(buildFightGripView({ ...CANONICO, endTime: null })).toBeNull();
    expect(buildFightGripView({ ...CANONICO, endRound: null })).toBeNull();
  });

  it("🪤 sin nombre no se publica media frase", () => {
    // fights.fighter_red_name está a NULL en 8.694 de 8.852 filas: si alguien
    // alimenta el bloque con esa columna en vez de con el join, esto salta.
    expect(buildFightGripView({ ...CANONICO, redName: null })).toBeNull();
    expect(buildFightGripView({ ...CANONICO, blueName: "   " })).toBeNull();
  });

  it("un asalto sin acta se queda en la tira, pero sin reparto", () => {
    const view = buildFightGripView({
      ...CANONICO,
      rounds: [
        { round: 1, redControlSeconds: 64, blueControlSeconds: 147 },
        { round: 2, redControlSeconds: null, blueControlSeconds: null },
        { round: 3, redControlSeconds: 48, blueControlSeconds: 53 },
      ],
    });

    expect(view?.rounds).toHaveLength(3);
    expect(view?.rounds[1].split).toBeNull();
    expect(view?.rounds[0].split).not.toBeNull();
  });

  it("si NINGÚN asalto tiene reparto, no hay tira que enseñar", () => {
    // Una tabla de tres filas que solo dicen "sin medir" no informa de nada.
    // El componente no debe pintar el desplegable: ni vacío ni con cero barras.
    const view = buildFightGripView({
      ...CANONICO,
      rounds: [
        { round: 1, redControlSeconds: null, blueControlSeconds: null },
        { round: 2, redControlSeconds: null, blueControlSeconds: null },
      ],
    });

    expect(view).not.toBeNull();
    expect(view?.rounds).toEqual([]);
  });

  it("sin filas de asalto la barra cerrada se sigue pintando", () => {
    const view = buildFightGripView({ ...CANONICO, rounds: [] });
    expect(view?.segments).toHaveLength(3);
    expect(view?.rounds).toEqual([]);
  });

  it("un combate donde nadie sujetó dibuja un solo tramo", () => {
    const view = buildFightGripView({
      ...CANONICO,
      redControlSeconds: 0,
      blueControlSeconds: 0,
      rounds: [{ round: 1, redControlSeconds: 0, blueControlSeconds: 0 }],
      endRound: 1,
      endTime: "5:00",
    });

    expect(view?.segments.map((s) => s.corner)).toEqual(["nobody"]);
    expect(view?.boundaries).toEqual([]);
    expect(view?.headline.headline).toBe(
      "Nadie sujetó a nadie en todo el combate",
    );
    // Sin agarre no hay segundo denominador: la frase entera desaparece.
    expect(view?.headline.grappledLine).toBeNull();
  });

  it("🪤 un combate por disputar no publica desenlace", () => {
    const view = buildFightGripView({
      ...CANONICO,
      winnerId: null,
      redId: null,
      blueId: null,
    });

    expect(view?.headline.note).not.toContain("Ganó");
    expect(view?.headline.note).not.toContain("perdió");
  });
});
