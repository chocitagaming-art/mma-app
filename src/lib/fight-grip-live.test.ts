import { describe, expect, it } from "vitest";

import f12872 from "@/lib/__fixtures__/grip-live-12872.json";
import f12873 from "@/lib/__fixtures__/grip-live-12873.json";
import f12875 from "@/lib/__fixtures__/grip-live-12875.json";
import f12877 from "@/lib/__fixtures__/grip-live-12877.json";
import f12880 from "@/lib/__fixtures__/grip-live-12880.json";
import f14022 from "@/lib/__fixtures__/grip-live-14022.json";
import f14232 from "@/lib/__fixtures__/grip-live-14232.json";
import f14493 from "@/lib/__fixtures__/grip-live-14493.json";
import { buildLiveGripStats } from "@/lib/fight-grip-live";
import type { FightTimelineSample } from "@/lib/fight-timeline";

// EL ORÁCULO DE ESTE FICHERO ES EL ACTA DE UFCSTATS, que sale de otra tabla
// (`fight_stats_rounds`) y de otra fuente que las muestras del directo. Ningún
// número esperado lo ha calculado el código bajo prueba: son los segundos que
// ufcstats publicó del combate, consultados en Neon el 15-ago-2026.
//
// Por qué importa tanto: la variante B se puede escribir de seis maneras
// distintas que dan el mismo resultado en el combate del maquetado y resultados
// distintos en los otros siete. Un test que recalculara la fórmula bendeciría
// las seis.

type Acta = {
  red: number;
  blue: number;
  // Segundos de agarre por asalto, [rojo, azul], en orden desde el asalto 1.
  rounds: [number, number][];
  samples: FightTimelineSample[];
};

const COMBATES: Record<string, Acta> = {
  // Sousa (rojo) vs Miranda (azul), U-DEC. El combate del maquetado: los tres
  // asaltos tienen su ancla, así que no hay nada que fundir.
  "14232": {
    red: 7245,
    blue: 9109,
    rounds: [
      [64, 147],
      [57, 31],
      [48, 53],
    ],
    samples: f14232 as unknown as FightTimelineSample[],
  },
  // Aliev (rojo) vs Davis (azul). El ancla del asalto 3 es `state:"post"` Y
  // lleva `displayClock:"-"`: filtrar por estado y filtrar por reloj borran la
  // misma fila, así que este combate caza las dos mitades del invariante 3.
  "12872": {
    red: 6254,
    blue: 6958,
    rounds: [
      [269, 18],
      [249, 0],
      [227, 18],
    ],
    samples: f12872 as unknown as FightTimelineSample[],
  },
  // Gibson (rojo) vs Hussein (azul). La `post` final CORRIGE A LA BAJA el
  // control del azul (469 -> 467). Quedarse con el máximo en vez de con la
  // última daría 123 en el tercero, y el acta dice 121.
  "14022": {
    red: 6455,
    blue: 9099,
    rounds: [
      [66, 62],
      [0, 284],
      [10, 121],
    ],
    samples: f14022 as unknown as FightTimelineSample[],
  },
  // Medic (rojo) vs Rodriguez (azul). CONTROL POSITIVO: una sola muestra, del
  // asalto 1, y ese asalto SÍ es medible. Sin este combate, un módulo que
  // devolviera «no medido» para todo pasaría los demás casos.
  "12873": {
    red: 6290,
    blue: 6930,
    rounds: [[4, 0]],
    samples: f12873 as unknown as FightTimelineSample[],
  },
  // Buzukja (rojo) vs Grad (azul). Muestra única del asalto 2: al asalto 1 le
  // falta el ancla. Apuntarle los 264 s al segundo se pasa en +164.
  "12880": {
    red: 7184,
    blue: 6243,
    rounds: [
      [0, 164],
      [0, 100],
    ],
    samples: f12880 as unknown as FightTimelineSample[],
  },
  // Klein (rojo) vs Musayev (azul). Igual que 12880 pero con el error pequeño
  // (+20 s): el tamaño del fallo no es lo que decide si es un fallo.
  "12877": {
    red: 6348,
    blue: 6970,
    rounds: [
      [0, 20],
      [0, 42],
    ],
    samples: f12877 as unknown as FightTimelineSample[],
  },
  // Nikolic (rojo) vs Vologdin (azul). Muestra única del asalto 3, y los DOS
  // lados se pasan (+69 rojo, +66 azul). Además el fighter_id del azul (9021)
  // es MENOR que el del rojo (9103), así que si alguien confunde el orden de
  // `byFighter` con el de las esquinas, aquí se ve.
  "14493": {
    red: 9103,
    blue: 9021,
    rounds: [
      [28, 62],
      [41, 4],
      [176, 5],
    ],
    samples: f14493 as unknown as FightTimelineSample[],
  },
  // Rakic (rojo) vs Tybura (azul). 🪤 EL FALSO NEGATIVO PERFECTO. Muestra única
  // del asalto 3 y acta 0/0 · 0/0 · 191/0: darle el acumulado entero al tercero
  // acierta POR CASUALIDAD, porque los dos primeros asaltos fueron cero. Está
  // aquí para que nadie lo use como prueba de nada — ver el test de abajo.
  "12875": {
    red: 6343,
    blue: 7053,
    rounds: [
      [0, 0],
      [0, 0],
      [191, 0],
    ],
    samples: f12875 as unknown as FightTimelineSample[],
  },
};

// La suma del acta de un rango de asaltos, [rojo, azul]. Es lo que una fila
// fundida tiene que valer: si la fila dice cubrir los asaltos 1 y 2, sus
// segundos son los del 1 más los del 2, no los del 2 solos.
function actaDe(acta: Acta, asaltos: number[]): [number, number] {
  let red = 0;
  let blue = 0;
  for (const asalto of asaltos) {
    red += acta.rounds[asalto - 1][0];
    blue += acta.rounds[asalto - 1][1];
  }
  return [red, blue];
}

describe("buildLiveGripStats — contra el acta de ufcstats", () => {
  for (const [fightId, acta] of Object.entries(COMBATES)) {
    it(`${fightId}: cada fila vale lo que dice el acta de los asaltos que cubre`, () => {
      const stats = buildLiveGripStats(acta.samples, acta.red, acta.blue);

      expect(stats.rounds.length).toBeGreaterThan(0);

      for (const fila of stats.rounds) {
        const cubre = fila.covers ?? [fila.round];
        const [red, blue] = actaDe(acta, cubre);
        const ctx = `${fightId} asaltos ${cubre.join("-")}`;
        expect(fila.redControlSeconds, `${ctx} rojo`).toBe(red);
        expect(fila.blueControlSeconds, `${ctx} azul`).toBe(blue);
      }
    });

    it(`${fightId}: la tira cubre los asaltos peleados sin huecos ni solapes`, () => {
      const stats = buildLiveGripStats(acta.samples, acta.red, acta.blue);

      const cubiertos = stats.rounds.flatMap((f) => f.covers ?? [f.round]);
      // Todos los combates de las fixtures están terminados, así que la tira
      // tiene que llegar hasta el último asalto del acta. Si un día entra un
      // combate en curso aquí, este test lo caza.
      expect(cubiertos).toEqual(
        Array.from({ length: acta.rounds.length }, (_, i) => i + 1),
      );
    });

    it(`${fightId}: el total publicado es el del acta entera`, () => {
      const stats = buildLiveGripStats(acta.samples, acta.red, acta.blue);
      const [red, blue] = actaDe(
        acta,
        acta.rounds.map((_, i) => i + 1),
      );
      expect(stats.redControlSeconds).toBe(red);
      expect(stats.blueControlSeconds).toBe(blue);
    });
  }
});

describe("🪤 los controles negativos, saboteando por donde el test NO mira", () => {
  // Un control negativo que pasa no demuestra nada si sabotea por la misma vía
  // que el test ya vigila. Estos tres rompen la entrada de tres maneras
  // distintas y exigen que el resultado DEJE de cuadrar con el acta.

  it("filtrar las muestras 'post' rompe el resultado (invariante 3, mitad estado)", () => {
    // 46 de las 82 anclas de la base son `post`. Quitarlas es el filtro «por
    // limpieza» más natural del mundo y se lleva por delante más de la mitad.
    const acta = COMBATES["12872"];
    const saboteadas = acta.samples.filter((s) => s.state !== "post");
    const stats = buildLiveGripStats(saboteadas, acta.red, acta.blue);
    const tercero = stats.rounds.find((f) => f.round === 3);
    // El acta dice 227/18 en el tercero; sin la `post` sale 226/17.
    expect(tercero?.redControlSeconds).not.toBe(227);
  });

  it("filtrar las muestras sin reloj rompe el resultado (invariante 3, mitad reloj)", () => {
    // 35 de las 82 anclas son `STATUS_END_OF_ROUND`, y ahí el reloj vale "-".
    const acta = COMBATES["12872"];
    const saboteadas = acta.samples.filter((s) => s.displayClock !== "-");
    const stats = buildLiveGripStats(saboteadas, acta.red, acta.blue);
    const segundo = stats.rounds.find((f) => f.round === 2);
    // El acta dice 249 en el segundo; filtrando por reloj salen 222.
    expect(segundo?.redControlSeconds).not.toBe(249);
  });

  it("quedarse con la PRIMERA muestra de cada asalto rompe el resultado", () => {
    // El invariante 3 no dice nada de esto, y sin embargo es la otra manera
    // fácil de equivocarse: «la muestra del asalto» no es cualquiera.
    const acta = COMBATES["14232"];
    const vistos = new Set<number>();
    const saboteadas = acta.samples.filter((s) => {
      if (vistos.has(s.period)) return false;
      vistos.add(s.period);
      return true;
    });
    const stats = buildLiveGripStats(saboteadas, acta.red, acta.blue);
    expect(stats.rounds.map((f) => f.redControlSeconds)).not.toEqual([
      64, 57, 48,
    ]);
  });

  it("confundir las esquinas rompe el resultado", () => {
    // En 14493 el fighter_id del azul es MENOR que el del rojo. Si alguien
    // toma «el primero de byFighter» por el rojo, este combate lo delata.
    const acta = COMBATES["14493"];
    const alReves = buildLiveGripStats(acta.samples, acta.blue, acta.red);
    expect(alReves.redControlSeconds).not.toBe(245);
    expect(alReves.redControlSeconds).toBe(71);
  });
});

describe("🪤 12875, el falso negativo perfecto", () => {
  it("acierta el acta CON el fundido y también SIN él: no prueba nada por sí solo", () => {
    const acta = COMBATES["12875"];
    const stats = buildLiveGripStats(acta.samples, acta.red, acta.blue);

    // Lo que publica: una sola fila que cubre los tres asaltos.
    expect(stats.rounds).toHaveLength(1);
    expect(stats.rounds[0].covers).toEqual([1, 2, 3]);
    expect(stats.rounds[0].redControlSeconds).toBe(191);

    // Y aquí está la trampa, escrita para que nadie la pise otra vez: el acta
    // del tercer asalto SUELTO vale exactamente lo mismo que la suma de los
    // tres, porque los dos primeros fueron cero. La regla equivocada —darle el
    // acumulado entero al asalto de la muestra— da el mismo 191.
    const [soloElTercero] = actaDe(acta, [3]);
    const [losTres] = actaDe(acta, [1, 2, 3]);
    expect(soloElTercero).toBe(losTres);

    // Los que SÍ distinguen las dos reglas son estos tres, y por eso están en
    // las fixtures: en ellos el acumulado entero se pasa del acta del asalto.
    for (const [fightId, asalto, exceso] of [
      ["12880", 2, 164],
      ["14493", 3, 135],
      ["12877", 2, 20],
    ] as const) {
      const otro = COMBATES[fightId];
      const [redSuelto, blueSuelto] = actaDe(otro, [asalto]);
      const todos = otro.rounds.map((_, i) => i + 1);
      const [redTodos, blueTodos] = actaDe(otro, todos);
      expect(
        redTodos - redSuelto + (blueTodos - blueSuelto),
        `${fightId} tiene que distinguir las dos reglas`,
      ).toBe(exceso);
    }
  });
});

describe("los casos que la base todavía no ha producido", () => {
  // Ninguno de los dos ocurre hoy: 0 de 697 muestras vuelven atrás y los 46
  // combates acaban en STATUS_FINAL. Se fabrican a partir de una serie real
  // porque «cero filas hoy» no es «no puede pasar», y cuando pase no habrá
  // nadie mirando.

  it("el asalto que se está peleando ahora mismo no se publica", () => {
    const acta = COMBATES["14232"];
    // La serie real cortada justo antes del final del segundo asalto: la
    // última muestra es del asalto 2 y está en curso.
    const hasta = acta.samples.findIndex(
      (s) => s.period === 2 && s.statusName === "STATUS_END_OF_ROUND",
    );
    expect(hasta).toBeGreaterThan(0);
    const enDirecto = acta.samples.slice(0, hasta);
    expect(enDirecto[enDirecto.length - 1].period).toBe(2);
    expect(enDirecto[enDirecto.length - 1].statusName).toBe(
      "STATUS_IN_PROGRESS_2",
    );

    const stats = buildLiveGripStats(enDirecto, acta.red, acta.blue);

    // Solo sale el primero, que sí terminó. Y sale con el número del acta.
    expect(stats.rounds.map((f) => f.round)).toEqual([1]);
    expect(stats.rounds[0].redControlSeconds).toBe(64);
    expect(stats.rounds[0].blueControlSeconds).toBe(147);

    // Pero el acumulado del combate SÍ incluye lo que lleva del segundo: eso
    // es cierto en cualquier instante, y es lo que se publica arriba.
    expect(stats.redControlSeconds).toBeGreaterThan(64);
  });

  it("una muestra que vuelve a un asalto anterior se ignora", () => {
    const acta = COMBATES["14232"];
    // Se reinyecta una muestra vieja del asalto 1 DESPUÉS del final: es lo que
    // haría un scoreboard que se desincroniza.
    const vieja = acta.samples[0];
    const conRetroceso = [...acta.samples, vieja];

    const stats = buildLiveGripStats(conRetroceso, acta.red, acta.blue);

    // El resultado no se mueve ni un segundo.
    expect(stats.rounds.map((f) => f.redControlSeconds)).toEqual([64, 57, 48]);
    expect(stats.rounds.map((f) => f.blueControlSeconds)).toEqual([
      147, 31, 53,
    ]);
  });

  it("🪤 un acumulado que BAJA se marca no medido, no se convierte en cero", () => {
    // Este test existe porque el barrido de sabotaje lo pidió: quitar la guarda
    // de la resta negativa dejaba los 32 tests en VERDE. Entre anclas el
    // acumulado no ha bajado nunca (0 casos de 82) y por eso ninguna fixture lo
    // contiene; entre muestras consecutivas sí baja, 60 de 651 pares y hasta
    // −77 s, así que solo hace falta que una de esas correcciones caiga en un
    // cambio de asalto.
    //
    // Con `Math.max(0, …)` el asalto se publicaría como «no sujetó a nadie»,
    // que es una afirmación sobre un dato roto. Es el mismo `?? 0` de siempre.
    const acta = COMBATES["14232"];
    const roja = String(acta.red);

    // La serie real, con el control del rojo hundido en todo el asalto 2 por
    // debajo de lo que ya llevaba al acabar el 1 (64 s).
    const conBajada = acta.samples.map((s) =>
      s.period === 2
        ? {
            ...s,
            byFighter: {
              ...s.byFighter,
              [roja]: { ...s.byFighter[roja], ctrl: 50 },
            },
          }
        : s,
    );

    const stats = buildLiveGripStats(conBajada, acta.red, acta.blue);
    const segundo = stats.rounds.find((f) => f.round === 2);

    expect(segundo).toBeDefined();
    expect(segundo?.redControlSeconds).toBeNull();
    expect(segundo?.redControlSeconds).not.toBe(0);
    // Y el asalto siguiente, que no tiene nada roto, se sigue publicando: el
    // acumulado final del rojo es la suma del acta (64+57+48 = 169), así que
    // restándole el 50 falso salen 119. No es el número del acta —no puede
    // serlo, la serie está saboteada— pero el asalto SE PUBLICA: un dato roto
    // no contamina a los de al lado.
    const acumuladoFinal = acta.rounds.reduce((total, [rojo]) => total + rojo, 0);
    expect(acumuladoFinal).toBe(169);
    expect(stats.rounds.find((f) => f.round === 3)?.redControlSeconds).toBe(
      acumuladoFinal - 50,
    );
  });

  it("sin las dos esquinas no se afirma nada", () => {
    const acta = COMBATES["14232"];
    expect(buildLiveGripStats(acta.samples, null, acta.blue).rounds).toEqual([]);
    expect(buildLiveGripStats(acta.samples, acta.red, null).rounds).toEqual([]);
    expect(buildLiveGripStats([], acta.red, acta.blue)).toEqual({
      redControlSeconds: null,
      blueControlSeconds: null,
      rounds: [],
    });
  });
});
