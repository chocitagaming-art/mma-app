import { describe, expect, it } from "vitest";

import { anchoBarra, buildRoundByRound, etiquetaFinal } from "@/lib/round-by-round";
import type { FightRoundStats } from "@/lib/types";

// Datos REALES de la BD, no inventados: son los tres combates con los que el
// plan pide comprobar que los acumulados cuadran con los totales del combate
// (uno a decisión de 3 asaltos, uno de 5 y uno terminado antes del límite).

const ROJO = 101;
const AZUL = 202;

function fila(p: Partial<FightRoundStats> & { fighterId: number; round: number }): FightRoundStats {
  return {
    sigStrikesLanded: 0,
    sigStrikesAttempted: 0,
    takedownsLanded: 0,
    takedownsAttempted: 0,
    submissionAttempts: 0,
    controlTimeSeconds: 0,
    knockdowns: 0,
    ...p,
  };
}

// Combate 12871 — Tuchalov (rojo) vs Ribeiro (azul), decisión unánime a 3
// asaltos. Totales en fight_stats: Tuchalov 35 conectados de 80 y 260 s de
// control; Ribeiro 39 de 118 y 8 s.
const F12871: FightRoundStats[] = [
  fila({ fighterId: AZUL, round: 1, sigStrikesLanded: 18, sigStrikesAttempted: 51 }),
  fila({ fighterId: ROJO, round: 1, sigStrikesLanded: 9, sigStrikesAttempted: 23, takedownsAttempted: 1 }),
  fila({ fighterId: AZUL, round: 2, sigStrikesLanded: 13, sigStrikesAttempted: 50 }),
  fila({
    fighterId: ROJO,
    round: 2,
    sigStrikesLanded: 22,
    sigStrikesAttempted: 45,
    takedownsLanded: 2,
    takedownsAttempted: 7,
    controlTimeSeconds: 44,
  }),
  fila({
    fighterId: AZUL,
    round: 3,
    sigStrikesLanded: 8,
    sigStrikesAttempted: 17,
    takedownsAttempted: 1,
    controlTimeSeconds: 8,
  }),
  fila({
    fighterId: ROJO,
    round: 3,
    sigStrikesLanded: 4,
    sigStrikesAttempted: 12,
    takedownsLanded: 6,
    takedownsAttempted: 6,
    submissionAttempts: 1,
    controlTimeSeconds: 216,
  }),
];

describe("buildRoundByRound", () => {
  it("sin filas no hay nada que pintar", () => {
    expect(buildRoundByRound([], ROJO, AZUL)).toBeNull();
  });

  it("agrupa por asalto y ordena, aunque las filas lleguen desordenadas", () => {
    const datos = buildRoundByRound(F12871, ROJO, AZUL)!;
    expect(datos.rounds.map((r) => r.round)).toEqual([1, 2, 3]);
    expect(datos.rounds[0].red?.sigStrikesLanded).toBe(9);
    expect(datos.rounds[0].blue?.sigStrikesLanded).toBe(18);
  });

  it("los acumulados cuadran con los totales del combate (12871, decisión a 3)", () => {
    const { totals } = buildRoundByRound(F12871, ROJO, AZUL)!;
    // Tuchalov, rojo
    expect(totals.red.sigStrikesLanded).toBe(35);
    expect(totals.red.sigStrikesAttempted).toBe(80);
    expect(totals.red.takedownsLanded).toBe(8);
    expect(totals.red.controlTimeSeconds).toBe(260);
    expect(totals.red.submissionAttempts).toBe(1);
    // Ribeiro, azul
    expect(totals.blue.sigStrikesLanded).toBe(39);
    expect(totals.blue.sigStrikesAttempted).toBe(118);
    expect(totals.blue.takedownsLanded).toBe(0);
    expect(totals.blue.controlTimeSeconds).toBe(8);
  });

  it("los acumulados cuadran en un combate de 5 asaltos (3215, Makhachev-JDM)", () => {
    const f3215: FightRoundStats[] = [
      fila({ fighterId: ROJO, round: 1, sigStrikesLanded: 3, sigStrikesAttempted: 8, takedownsLanded: 1, takedownsAttempted: 1, controlTimeSeconds: 232 }),
      fila({ fighterId: AZUL, round: 1, sigStrikesLanded: 4, sigStrikesAttempted: 18 }),
      fila({ fighterId: ROJO, round: 2, sigStrikesLanded: 9, sigStrikesAttempted: 17, controlTimeSeconds: 245 }),
      fila({ fighterId: AZUL, round: 2, sigStrikesLanded: 3, sigStrikesAttempted: 6, takedownsAttempted: 1 }),
      fila({ fighterId: ROJO, round: 3, sigStrikesLanded: 11, sigStrikesAttempted: 18, takedownsLanded: 1, takedownsAttempted: 1, controlTimeSeconds: 186 }),
      fila({ fighterId: AZUL, round: 3, sigStrikesLanded: 9, sigStrikesAttempted: 20 }),
      fila({ fighterId: ROJO, round: 4, sigStrikesLanded: 7, sigStrikesAttempted: 12, takedownsLanded: 1, takedownsAttempted: 1, controlTimeSeconds: 204 }),
      fila({ fighterId: AZUL, round: 4, sigStrikesLanded: 1, sigStrikesAttempted: 11 }),
      fila({ fighterId: ROJO, round: 5, sigStrikesLanded: 0, sigStrikesAttempted: 2, takedownsLanded: 1, takedownsAttempted: 1, controlTimeSeconds: 283 }),
      fila({ fighterId: AZUL, round: 5, sigStrikesLanded: 1, sigStrikesAttempted: 6 }),
    ];
    const datos = buildRoundByRound(f3215, ROJO, AZUL)!;

    expect(datos.rounds).toHaveLength(5);
    expect(datos.totals.red.sigStrikesLanded).toBe(30);
    expect(datos.totals.red.sigStrikesAttempted).toBe(57);
    expect(datos.totals.red.controlTimeSeconds).toBe(1150);
    expect(datos.totals.blue.sigStrikesLanded).toBe(18);
    expect(datos.totals.blue.sigStrikesAttempted).toBe(61);
    // JDM no controló ni un segundo en 25 minutos: un cero legítimo.
    expect(datos.totals.blue.controlTimeSeconds).toBe(0);
  });

  it("un combate terminado antes solo trae los asaltos disputados (13616, KO en el 2)", () => {
    const f13616: FightRoundStats[] = [
      fila({ fighterId: AZUL, round: 1, sigStrikesLanded: 29, sigStrikesAttempted: 75 }),
      fila({ fighterId: ROJO, round: 1, sigStrikesLanded: 10, sigStrikesAttempted: 52 }),
      fila({ fighterId: AZUL, round: 2, sigStrikesLanded: 35, sigStrikesAttempted: 57, controlTimeSeconds: 8, knockdowns: 2 }),
      fila({ fighterId: ROJO, round: 2, sigStrikesLanded: 4, sigStrikesAttempted: 34 }),
    ];
    const datos = buildRoundByRound(f13616, ROJO, AZUL)!;

    expect(datos.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(datos.totals.blue.sigStrikesLanded).toBe(64);
    expect(datos.totals.blue.knockdowns).toBe(2);
    expect(datos.totals.red.sigStrikesLanded).toBe(14);
  });

  it("descarta filas huérfanas en vez de pintar un tercer luchador", () => {
    const conIntruso = [...F12871, fila({ fighterId: 999, round: 1, sigStrikesLanded: 100 })];
    const datos = buildRoundByRound(conIntruso, ROJO, AZUL)!;

    expect(datos.totals.red.sigStrikesLanded + datos.totals.blue.sigStrikesLanded).toBe(74);
    // Y el intruso tampoco puede colarse en la escala de las barras.
    expect(datos.maxSigLanded).toBe(22);
  });

  it("una esquina sin fila en un asalto queda a null, no rompe", () => {
    const soloRojo = [fila({ fighterId: ROJO, round: 1, sigStrikesLanded: 5 })];
    const datos = buildRoundByRound(soloRojo, ROJO, AZUL)!;

    expect(datos.rounds[0].red?.sigStrikesLanded).toBe(5);
    expect(datos.rounds[0].blue).toBeNull();
  });

  it("la escala de las barras es el mejor asalto del combate", () => {
    expect(buildRoundByRound(F12871, ROJO, AZUL)!.maxSigLanded).toBe(22);
  });

  it("la columna de sumisiones solo se enciende si alguien lo intentó", () => {
    expect(buildRoundByRound(F12871, ROJO, AZUL)!.hasSubmissionAttempts).toBe(true);

    const sinIntentos = F12871.map((f) => ({ ...f, submissionAttempts: 0 }));
    expect(buildRoundByRound(sinIntentos, ROJO, AZUL)!.hasSubmissionAttempts).toBe(false);
  });

  it("sin ids de esquina no se puede repartir nada", () => {
    expect(buildRoundByRound(F12871, null, null)).toBeNull();
  });
});

describe("anchoBarra", () => {
  it("es proporcional al mejor asalto", () => {
    expect(anchoBarra(11, 22)).toBe(50);
    expect(anchoBarra(22, 22)).toBe(100);
  });

  it("un asalto sin golpes conectados no pinta barra", () => {
    // 969 asaltos reales terminan con cero golpes significativos.
    expect(anchoBarra(0, 22)).toBe(0);
    expect(anchoBarra(null, 22)).toBe(0);
  });

  it("nunca divide por cero ni se pasa de 100", () => {
    expect(anchoBarra(5, 0)).toBe(0);
    expect(anchoBarra(30, 22)).toBe(100);
  });
});

describe("etiquetaFinal", () => {
  it("marca el asalto donde acabó el combate", () => {
    expect(etiquetaFinal("KO/TKO - Punches", 2, "3:06", 2)).toBe("Final · 3:06");
  });

  it("no marca los demás asaltos", () => {
    expect(etiquetaFinal("KO/TKO - Punches", 2, "3:06", 1)).toBeNull();
  });

  // Este caso salió de mirar la página, no de imaginarlo: /fights/12871 marcaba
  // "Final · 5:00" en el asalto 3 de un combate que fue a las tarjetas. El
  // método en la BD es "U-DEC", que no contiene la palabra "decision".
  it("en una decisión no hay final que marcar: se llegó al límite", () => {
    expect(etiquetaFinal("U-DEC", 3, "5:00", 3)).toBeNull();
    expect(etiquetaFinal("S-DEC", 5, "5:00", 5)).toBeNull();
    expect(etiquetaFinal("M-DEC", 3, "5:00", 3)).toBeNull();
    expect(etiquetaFinal("Decision - Unanimous", 3, "5:00", 3)).toBeNull();
    expect(etiquetaFinal("Decisión unánime", 5, "5:00", 5)).toBeNull();
  });

  it("los finales de verdad sí se marcan, con todos sus formatos", () => {
    expect(etiquetaFinal("KO/TKO - Punches", 2, "3:06", 2)).toBe("Final · 3:06");
    expect(etiquetaFinal("SUB - Rear Naked Choke", 1, "4:21", 1)).toBe("Final · 4:21");
    expect(etiquetaFinal("DQ", 2, "1:30", 2)).toBe("Final · 1:30");
  });

  it("sin resultado todavía, tampoco", () => {
    expect(etiquetaFinal(null, null, null, 1)).toBeNull();
  });

  it("sin hora, marca el final igual", () => {
    expect(etiquetaFinal("Submission", 1, null, 1)).toBe("Final");
  });
});
