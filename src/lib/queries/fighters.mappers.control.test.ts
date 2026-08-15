import { describe, expect, it } from "vitest";

import { controlTileNote, computeControlShare } from "@/lib/queries/fighters.mappers";

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

describe("controlTileNote · la tercera línea del tile «T. control»", () => {
  it("con la muestra completa publica la cuota", () => {
    expect(controlTileNote(0.41, 5123, 18, 18)).toEqual({ kind: "share", percent: 41 });
  });

  it("con la suma PARCIAL avisa del alcance en vez de callarse", () => {
    // David Abbott (8793): 3 actas con control de 18. Publicaba «T. control
    // 2:03» a secas, que es la suma de esas 3 con rótulo de total de carrera.
    // No se veía porque el guard de computeControlShare ya tapaba la cuota en
    // esos mismos casos: lo que ocultaba el error era el arreglo de OTRO error.
    expect(controlTileNote(null, 123, 3, 18)).toEqual({ kind: "scope", of: 3, total: 18 });
  });

  it("🪤 NUNCA las dos líneas a la vez, y no por casualidad de los datos", () => {
    // Entrada SINTÉTICA que hoy no existe en ninguna de las 2.859 fichas: cuota
    // publicable Y cobertura parcial al mismo tiempo. Por eso un test de altura
    // del tile pasaría en verde — el escenario que rompe la rejilla de 2x2 no
    // está en la base todavía. Aquí la exclusión es estructural: la función
    // devuelve UNA cosa, así que no puede pasar aunque los datos cambien.
    const nota = controlTileNote(0.41, 123, 3, 18);
    expect(nota).toEqual({ kind: "share", percent: 41 });
  });

  it("🪤 los dos que suman EXACTAMENTE 0 también reciben su aviso", () => {
    // Dan Severn y Royce Gracie: control 0 con actas que sí traen el dato. Un
    // guard escrito `if (controlSeconds)` los deja sin aviso justo a los dos
    // peores casos del lote, y cualquier fixture con un valor distinto de cero
    // seguiría verde. Este es el par que separa las dos implementaciones.
    expect(controlTileNote(null, 0, 1, 10)).toEqual({ kind: "scope", of: 1, total: 10 });
  });

  it("CONTROL NEGATIVO: sin dato ninguno, ni cuota ni aviso", () => {
    // Los 102: ninguna acta trae control, así que no hay suma que matizar. El
    // tile ya imprime «—» arriba y una segunda línea sería ruido.
    expect(controlTileNote(null, null, 0, 12)).toBeNull();
    // Y con cobertura completa pero sin cuota publicable, tampoco: no hay nada
    // que avisar.
    expect(controlTileNote(null, 480, 12, 12)).toBeNull();
  });
});
