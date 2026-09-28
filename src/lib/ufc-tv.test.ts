import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// unstable_cache necesita el contexto de petición de Next, que aquí no existe
// (environment: "node"). Se sustituye por un paso directo, igual que en
// queries/gyms.test.ts: lo que se prueba aquí es la lógica, no la caché. Los
// TTL se vigilan aparte, leyendo el fuente (ver «guardas de fuente», abajo).
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import fixture from "@/lib/__fixtures__/ufc-tv-2026-09-28.json";
import {
  LIVE_REVALIDATE_SECONDS,
  LIVE_VIDEO_OFF,
  POOL_REVALIDATE_SECONDS,
  buildLoopIds,
  classifyLive,
  fetchFullFightPool,
  fetchUfcLiveNow,
  freshLiveItems,
  getFullFightPool,
  getLivePick,
  getUfcLiveNow,
  isLoopFightTitle,
  isSnapshotFresh,
  liveBucket,
  liveEmbedUrl,
  loopEmbedUrl,
  needsLiveDetection,
  normalizeTitle,
  pickLive,
  planHomeSlot,
  readFixtureMode,
  resolveEventVideo,
  singleFlight,
  toLiveCandidate,
  utcDaySeed,
  withCooldown,
  type LiveCandidate,
  type LoopVideo,
  type UfcChannel,
  type UfcTvEvent,
  type YouTubeVideoItem,
} from "@/lib/ufc-tv";

// ── La fixture: datos REALES medidos el 28-sep-2026 ─────────────────────────
//
// 263 vídeos de los dos canales (UFC y UFC Español) en la forma EXACTA en que
// los devuelve videos.list, y los 12 eventos de la base alrededor de esas
// fechas. Cómo se generó: src/lib/__fixtures__/README.md.
//
// La mayoría de esos vídeos ya NO están en directo (fueron directos o estrenos
// que acabaron). Para probar la clasificación de un acto pasado se «reproduce»
// el vídeo en el momento en que estaba en el aire: `enDirecto` le quita el
// final y le pone la duración P0D de un directo en curso, y `enEstreno` le deja
// su duración real, que es lo que YouTube enseña mientras se emite un estreno.

const MEDIDO = new Date(fixture.measuredAt);
const MIN = 60_000;
const HORA = 60 * MIN;

const CANDIDATOS: LiveCandidate[] = (["ufc", "ufc-es"] as const).flatMap((canal) =>
  (fixture.channels[canal] as YouTubeVideoItem[])
    .map((item) => toLiveCandidate(item, canal))
    .filter((c): c is LiveCandidate => c !== null),
);

function video(id: string): LiveCandidate {
  const encontrado = CANDIDATOS.find((c) => c.videoId === id);
  if (!encontrado) {
    throw new Error(`la fixture no tiene el vídeo ${id}`);
  }
  return encontrado;
}

function evento(id: number): UfcTvEvent {
  const encontrado = fixture.events.find((e) => e.id === id);
  if (!encontrado) {
    throw new Error(`la fixture no tiene el evento ${id}`);
  }
  return encontrado;
}

function inicio(c: LiveCandidate): Date {
  return new Date((c.actualStartTime ?? c.scheduledStartTime) as string);
}

function enDirecto(c: LiveCandidate, cambios: Partial<LiveCandidate> = {}): LiveCandidate {
  return {
    ...c,
    liveBroadcastContent: "live",
    actualEndTime: null,
    duration: "P0D",
    ...cambios,
  };
}

function enEstreno(c: LiveCandidate): LiveCandidate {
  return { ...c, liveBroadcastContent: "live", actualEndTime: null };
}

function programado(c: LiveCandidate, empieza: Date): LiveCandidate {
  return {
    ...c,
    liveBroadcastContent: "upcoming",
    actualStartTime: null,
    actualEndTime: null,
    scheduledStartTime: empieza.toISOString(),
    duration: "P0D",
  };
}

const masTarde = (c: LiveCandidate, ms: number) => new Date(inicio(c).getTime() + ms);

// ── La fixture es la que dice ser ───────────────────────────────────────────

describe("la fixture del 28-sep-2026", () => {
  it("pesa menos de 200 KB y trae los dos canales y los eventos", () => {
    const bytes = readFileSync(
      fileURLToPath(new URL("./__fixtures__/ufc-tv-2026-09-28.json", import.meta.url)),
    ).byteLength;
    expect(bytes).toBeLessThan(200 * 1024);
    expect(CANDIDATOS.filter((c) => c.channel === "ufc").length).toBeGreaterThan(50);
    expect(CANDIDATOS.filter((c) => c.channel === "ufc-es").length).toBeGreaterThan(100);
    expect(fixture.events.length).toBeGreaterThanOrEqual(12);
  });

  it("toLiveCandidate copia los campos del directo tal cual", () => {
    expect(video("z1PhY6ix2XY")).toEqual({
      videoId: "z1PhY6ix2XY",
      title: "GREATEST UFC RISING STARS | UFC 332",
      channel: "ufc",
      liveBroadcastContent: "live",
      scheduledStartTime: "2026-09-28T12:15:00Z",
      actualStartTime: "2026-09-28T12:15:15Z",
      actualEndTime: null,
      duration: "P0D",
      embeddable: true,
      regionRestriction: null,
      ageRestricted: false,
    });
  });

  it("toLiveCandidate descarta lo que no trae id o título", () => {
    expect(toLiveCandidate({ snippet: { title: "x" } }, "ufc")).toBeNull();
    expect(toLiveCandidate({ id: "abcdefghijk" }, "ufc")).toBeNull();
  });
});

// ── normalizeTitle ──────────────────────────────────────────────────────────

describe("normalizeTitle", () => {
  it("quita tildes y mayúsculas, y despega los hashtags de la UFC", () => {
    expect(normalizeTitle("#UFCVegas121: Previa del Evento ¡EN VIVO!")).toBe(
      "ufc vegas121: previa del evento ¡en vivo!",
    );
    expect(normalizeTitle("#CryptoCom #UFC331: Previa")).toBe("cryptocom ufc 331: previa");
    expect(normalizeTitle("#NocheUFC Maratón: Alexa Grasso")).toBe("noche ufc maraton: alexa grasso");
    expect(normalizeTitle("#NocheUFC: Previa del Evento")).toBe("noche ufc: previa del evento");
  });
});

// ── classifyLive: el directo de HOY ─────────────────────────────────────────

describe("classifyLive · el directo que estaba en el aire al medir", () => {
  const UFC_332 = evento(1092); // el próximo evento el 28-sep

  it("«GREATEST UFC RISING STARS | UFC 332» es PELEAS, aunque lleve el número del próximo evento", () => {
    expect(classifyLive(video("z1PhY6ix2XY"), UFC_332, MEDIDO)).toBe("peleas");
  });

  it("y nunca evento, ni aunque se emitiera dentro de la ventana de la velada", () => {
    const dentroDeLaVentana = new Date("2026-10-03T19:00:00Z"); // 1 h antes del primer tramo
    const comoSiFueraElSabado = enDirecto(video("z1PhY6ix2XY"), {
      actualStartTime: "2026-10-03T18:30:00Z",
    });
    expect(classifyLive(comoSiFueraElSabado, UFC_332, dentroDeLaVentana)).toBe("peleas");
  });

  it("las dos ruedas de prensa programadas quedan FUERA", () => {
    expect(classifyLive(video("uXf5Da2QkR8"), UFC_332, MEDIDO)).toBeNull();
    expect(classifyLive(video("AWfWwkQz0yc"), UFC_332, MEDIDO)).toBeNull();
  });

  it("pickLive sobre las 263 subidas reales elige ese directo y ningún evento", () => {
    const pick = pickLive(CANDIDATOS, UFC_332, MEDIDO);
    expect(pick.peleas?.videoId).toBe("z1PhY6ix2XY");
    expect(pick.evento).toBeUndefined();
  });
});

// ── classifyLive: maratones y recopilatorios ────────────────────────────────

describe("classifyLive · maratones y recopilatorios en directo son PELEAS y nunca EVENTO", () => {
  const CASOS: [string, number][] = [
    ["e920mIf3ZpM", 1090], // Crypto.com UFC 331: Free Fight Marathon (el mismo día del 331)
    ["WyAQXKrNDL0", 1090], // Ciryl Gane vs Josh Hokit 🚨 | Full Fight Marathon
    ["qhucudYRwrI", 1091], // GREATEST UFC MOMENTS WITH NO COMMENTARY 🔇
    ["9nXqBaZO-rc", 1088], // The Best of Jean Silva | Full Fight Marathon
    ["dH-mYfF1mkU", 1085], // #NocheUFC Maratón: Alexa Grasso (el día de UFC Paris)
    ["tOlqX0v8BX4", 1085], // #NocheUFC Maratón: Silva vs Delgado
  ];

  for (const [id, eventoId] of CASOS) {
    it(`${id} · ${video(id).title}`, () => {
      const c = enDirecto(video(id));
      expect(classifyLive(c, evento(eventoId), masTarde(c, 20 * MIN))).toBe("peleas");
    });
  }

  it("el Free Fight Marathon del 331 sigue siendo peleas si se emite a 1 h de las preliminares", () => {
    const c = enDirecto(video("e920mIf3ZpM"), { actualStartTime: "2026-09-19T20:00:00Z" });
    expect(classifyLive(c, evento(1090), new Date("2026-09-19T20:30:00Z"))).toBe("peleas");
  });

  // Los casos de arriba no llevan palabra de acto, así que caerían en «peleas»
  // aunque COMPILATION no existiera. Estos SÍ la llevan, dentro de la ventana
  // y con el número del evento: lo único que los separa de la velada es que
  // son un recopilatorio. Títulos sintéticos: en las 1.200 subidas reales no
  // hay ninguno así, y por eso no había red.
  const RECOPILATORIOS_CON_ACTO = [
    "UFC 332 Prelims | Full Fight Marathon",
    "UFC 332: Prelims Fighters' Best Fights",
    "UFC 332 Early Prelims: Most Violent Finishes",
    "#UFC332 Preliminares: Nocauts de la cartelera",
    "#UFC332 Preliminares: Mejores Peleas de Silva",
    "#UFC332 Preliminares: Las Mejores Finalizaciones",
  ];
  for (const title of RECOPILATORIOS_CON_ACTO) {
    it(`«${title}» en la ventana del 332 es peleas, nunca evento`, () => {
      const c = enDirecto(video("z1PhY6ix2XY"), {
        title,
        actualStartTime: "2026-10-03T19:30:00Z",
      });
      expect(classifyLive(c, evento(1092), new Date("2026-10-03T19:45:00Z"))).toBe("peleas");
    });
  }
});

// ── classifyLive: lo que NO son peleas ──────────────────────────────────────

describe("classifyLive · ruedas de prensa, pesajes y otros deportes quedan FUERA", () => {
  const CASOS: [string, string][] = [
    ["RK5LLmmtkB0", "rueda de prensa previa"],
    ["yqHXlPThZ9M", "rueda de prensa posterior"],
    ["UF3vj3ri0jw", "pesaje ceremonial (inglés)"],
    ["8mnBb_j45wg", "morning weigh-in show"],
    ["m4hjml5OeZs", "pesaje ceremonial (español)"],
    ["35QMmEPfbx8", "pesaje de boxeo"],
    ["85f-smHx8AU", "Power Slap, aunque diga «Prelims»"],
    ["fBQaoiItVBc", "UFC BJJ, aunque diga «Prelims»"],
    ["8JyUdivi54w", "«Behind The Scenes», aunque diga «NO COMMENTARY»"],
    ["RTNLFNxzNxc", "conteo regresivo"],
    ["jml-ZFIj2OI", "UFC Conectado (tertulia)"],
    ["qY9YV30VNuE", "Preview Show del jueves"],
  ];

  for (const [id, que] of CASOS) {
    it(`${que} · ${video(id).title}`, () => {
      const c = enDirecto(video(id));
      const cercano = fixture.events.find((e) => {
        const primero = new Date((e.earlyPrelimsTime ?? e.prelimsTime ?? e.startTime) as string);
        return Math.abs(primero.getTime() - inicio(c).getTime()) < 3 * 24 * HORA;
      });
      expect(classifyLive(c, cercano ?? null, masTarde(c, 10 * MIN))).toBeNull();
    });
  }

  it("Zuffa Boxing queda fuera por ser boxeo, no solo por la región", () => {
    // El real está bloqueado en España; se le quita la restricción para que lo
    // que se pruebe sea la palabra y no la geografía.
    const c = enDirecto(video("7f80TdPwfus"), { regionRestriction: null });
    expect(classifyLive(c, evento(1091), masTarde(c, 10 * MIN))).toBeNull();
  });

  // Los casos reales de arriba ya salen null solo por no llevar palabra de
  // pelea, así que se podía vaciar EXCLUDE sin que cayera nada. Cada palabra
  // excluida va aquí CON una palabra de pelea al lado: si alguien la quita de
  // la lista, su título entra en UFC TV y este test se pone rojo.
  const EXCLUIDOS_CON_PALABRA_DE_PELEA = [
    "UFC 332: Pre-Fight Press Conference | Full Fights Preview",
    "#UFC332 Conferencia de Prensa | Maratón",
    "UFC 332 Preliminares | Rueda de prensa",
    "UFC 332 Ceremonial Weigh-In | Full Fights",
    "#UFC332 Pesaje Ceremonial | Maratón",
    "UFC 332 Media Day | Full Fights",
    "#UFC332 Día de Medios | Peleas Completas",
    "UFC 332 Fighter Interviews | Greatest Moments",
    "#UFC332 Entrevistas | Mejores Peleas",
    "UFC Podcast | Greatest Knockouts",
    "UFC 332 Countdown | Full Fights",
    "#UFC332 Conteo Regresivo | Pelea Gratis",
    "UFC 332 Embedded | Full Fight Marathon",
    "UFC 332 Fight Week Vlog | Knockouts",
    "UFC 332 Face-Offs | Full Fights",
    "#UFC332 Careos | Peleas Completas",
    "#UFC332 Cara a Cara | Peleas Completas",
    "UFC 332 Post-Fight Show | Full Fights",
    "UFC 332 Post-Show | Knockouts",
    "Zuffa Boxing 12 | Full Fight Marathon",
    "Zuffa 13: Main Event | Pelea Gratis",
    "Canelo vs Crawford | Boxing Full Fights",
    "#NocheUFC Boxeo | Peleas Completas",
    "Power Slap 22 | Full Fights",
    "UFC BJJ 8 | Full Fights",
    "UFC Fight Pass Grappling | Full Fights",
    "Behind The Scenes | NO COMMENTARY",
    "UFC Knockouts #shorts",
  ];
  for (const title of EXCLUIDOS_CON_PALABRA_DE_PELEA) {
    it(`«${title}» queda FUERA aunque lleve palabra de pelea`, () => {
      const c = enDirecto(video("z1PhY6ix2XY"), { title });
      expect(classifyLive(c, null, MEDIDO)).toBeNull();
      expect(isLoopFightTitle(title)).toBe(false);
    });
  }

  it("el boxeo sin la palabra «boxeo»: el cartel de Garcia vs Benn, medido", () => {
    // El canal de la UFC emitió en directo «Garcia vs Benn: Ceremonial
    // Weigh-In» y UFC Español lo etiqueta #GarciaBenn. Ninguno dice boxeo.
    for (const title of [
      "Garcia vs Benn | FULL FIGHT",
      "#GarciaBenn Pelea Gratis: Opetaia vs Nelson",
    ]) {
      const c = enDirecto(video("z1PhY6ix2XY"), { title });
      expect(classifyLive(c, null, MEDIDO), title).toBeNull();
      expect(isLoopFightTitle(title), title).toBe(false);
    }
  });

  it("unas preliminares SIN la marca UFC no son peleas de UFC TV (son de otro deporte o no se sabe)", () => {
    const c = enDirecto(video("z1PhY6ix2XY"), { title: "Garcia vs Benn | Prelims" });
    expect(classifyLive(c, null, MEDIDO)).toBeNull();
    const otroCartel = enDirecto(video("z1PhY6ix2XY"), { title: "Ramos vs Diaz | Prelims" });
    expect(classifyLive(otroCartel, null, MEDIDO)).toBeNull();
  });

  it("con la marca UFC, una previa que no es del próximo evento SÍ va a UFC TV", () => {
    const c = enDirecto(video("yLuMxIVAIaI"), { actualStartTime: "2026-09-24T20:00:00Z" });
    expect(classifyLive(c, evento(1091), new Date("2026-09-24T20:10:00Z"))).toBe("peleas");
  });
});

// ── classifyLive: los actos de la velada ────────────────────────────────────

describe("classifyLive · la previa en directo del evento es EVENTO dentro de su ventana", () => {
  const PREVIAS: [string, number][] = [
    ["yLuMxIVAIaI", 1091], // #UFCVegas121: Previa del Evento ¡EN VIVO!
    ["qtK4PPNx4YA", 1090], // #CryptoCom #UFC331: Previa del Evento ¡EN VIVO!
    ["IFxE1pcOh1g", 1088], // #NocheUFC: Previa del Evento ¡EN VIVO!
    ["O1EiI0IXGkg", 1085], // UFC Paris | Previa del Evento ¡EN VIVO!
    ["qM-h-OudTqM", 1064], // UFC 330 | Previa del Evento ¡EN VIVO!
    ["5SnFY40sXO0", 1087], // UFC Vegas 120 | Previa del Evento ¡EN VIVO!
    ["IdQp0CQArFo", 1063], // UFC Belgrade | Previa del Evento ¡EN VIVO!
  ];

  for (const [id, eventoId] of PREVIAS) {
    it(`${video(id).title} → evento ${eventoId}`, () => {
      const c = enDirecto(video(id));
      expect(classifyLive(c, evento(eventoId), masTarde(c, 15 * MIN))).toBe("evento");
    });
  }

  it("un pre-show en inglés con el número pegado también casa", () => {
    const c = enDirecto(video("yLuMxIVAIaI"), {
      channel: "ufc",
      title: "🔴 #UFC332: Pre-Show + Early Prelims",
      actualStartTime: "2026-10-03T19:30:00Z",
    });
    expect(classifyLive(c, evento(1092), new Date("2026-10-03T19:45:00Z"))).toBe("evento");
  });

  it("casa por la ciudad aunque el título no lleve número ni apellidos", () => {
    const c = enDirecto(video("yLuMxIVAIaI"), {
      title: "UFC Salt Lake City | Previa del Evento ¡EN VIVO!",
      actualStartTime: "2026-10-03T19:00:00Z",
    });
    expect(classifyLive(c, evento(1092), new Date("2026-10-03T19:10:00Z"))).toBe("evento");
  });

  it("fuera de la ventana NO es evento (la misma previa, dos días antes)", () => {
    const c = enDirecto(video("yLuMxIVAIaI"), { actualStartTime: "2026-09-24T20:00:00Z" });
    expect(classifyLive(c, evento(1091), new Date("2026-09-24T20:10:00Z"))).not.toBe("evento");
  });

  it("fuera de la ventana de OTRO evento tampoco (la previa de Vegas 121 contra el 332)", () => {
    const c = enDirecto(video("yLuMxIVAIaI"));
    expect(classifyLive(c, evento(1092), masTarde(c, 15 * MIN))).not.toBe("evento");
  });

  // 🪤 El de arriba lo para la VENTANA (una semana de diferencia), no el casado:
  // se podía borrar matchesEvent entero sin que cayera nada. Estos van DENTRO
  // de la ventana del evento, y lo único que los separa es el título.
  it("contra OTRO evento no casa, aunque sea la misma noche y dentro de su ventana", () => {
    // La previa de UFC Paris emitida en plena ventana de Vegas 121.
    const c = enDirecto(video("O1EiI0IXGkg"), { actualStartTime: "2026-09-26T20:00:00Z" });
    expect(classifyLive(c, evento(1091), new Date("2026-09-26T20:15:00Z"))).not.toBe("evento");
  });

  it("una palabra de sede genérica («Arena») no casa con otro recinto", () => {
    // UFC Paris es en el «Accor Arena»: «arena» está en LOCATION_STOPWORDS.
    const c = enDirecto(video("O1EiI0IXGkg"), {
      title: "UFC Abu Dhabi: Etihad Arena | Previa del Evento ¡EN VIVO!",
    });
    expect(classifyLive(c, evento(1085), masTarde(c, 15 * MIN))).not.toBe("evento");
  });

  it("un apellido del estelar solo casa como palabra entera («Dasilva» no es «Silva»)", () => {
    // Noche UFC: Silva vs. Delgado, en su ventana.
    const c = enDirecto(video("IFxE1pcOh1g"), {
      title: "UFC Fight Night: Dasilva vs Smith | Prelims",
      actualStartTime: "2026-09-12T18:00:00Z",
    });
    expect(classifyLive(c, evento(1088), new Date("2026-09-12T18:15:00Z"))).not.toBe("evento");
  });

  it("sin la marca UFC no es la velada, aunque case por los apellidos del estelar", () => {
    const c = enDirecto(video("yLuMxIVAIaI"), {
      title: "Silva vs Wang | Prelims",
      actualStartTime: "2026-10-03T19:30:00Z",
    });
    expect(classifyLive(c, evento(1092), new Date("2026-10-03T19:45:00Z"))).not.toBe("evento");
  });

  it("la retransmisión del canal inglés, «<evento> | <fecha>», es la velada si se ve en España", () => {
    // Los dos directos de velada reales del canal inglés, sin la restricción de
    // región que tenían: sin palabra de acto, antes se tiraban.
    const uc331 = enDirecto(video("yspd_ZxYZQM"), { regionRestriction: null });
    expect(classifyLive(uc331, evento(1090), masTarde(uc331, 30 * MIN))).toBe("evento");
    const uc330 = enDirecto(video("oyva13Tm2Ec"), { regionRestriction: null });
    expect(classifyLive(uc330, evento(1064), masTarde(uc330, 30 * MIN))).toBe("evento");
  });

  it("sin evento (no hay próximo) una previa nunca es evento", () => {
    const c = enDirecto(video("yLuMxIVAIaI"));
    expect(classifyLive(c, null, masTarde(c, 15 * MIN))).not.toBe("evento");
  });

  it("el pesaje ceremonial del propio evento, en su ventana, NO es evento", () => {
    const c = enDirecto(video("UF3vj3ri0jw"), { actualStartTime: "2026-09-19T18:00:00Z" });
    expect(classifyLive(c, evento(1090), new Date("2026-09-19T18:10:00Z"))).toBeNull();
  });

  it("programado: evento si empieza en menos de 60 min, y nada si falta más", () => {
    const previa = video("yLuMxIVAIaI");
    const empieza = new Date("2026-09-26T20:00:00Z");
    const c = programado(previa, empieza);
    expect(classifyLive(c, evento(1091), new Date(empieza.getTime() - 45 * MIN))).toBe("evento");
    expect(classifyLive(c, evento(1091), new Date(empieza.getTime() - 90 * MIN))).toBeNull();
  });

  it("programado de PELEAS nunca: no hay nada que ver todavía", () => {
    const c = programado(video("z1PhY6ix2XY"), new Date(MEDIDO.getTime() + 10 * MIN));
    expect(classifyLive(c, evento(1092), MEDIDO)).toBeNull();
  });
});

// ── classifyLive: jugable y en el aire ──────────────────────────────────────

describe("classifyLive · solo lo que se puede ver en España y sigue en el aire", () => {
  const hoy = video("z1PhY6ix2XY");

  it("bloqueado en España → null (la cartelera estelar del 331, real)", () => {
    const c = enDirecto(video("yspd_ZxYZQM"));
    expect(classifyLive(c, evento(1090), masTarde(c, 10 * MIN))).toBeNull();
  });

  it("solo permitido fuera de España → null", () => {
    const c = enDirecto(hoy, { regionRestriction: { allowed: ["MX", "AR"] } });
    expect(classifyLive(c, null, MEDIDO)).toBeNull();
  });

  it("no embebible → null", () => {
    expect(classifyLive(enDirecto(hoy, { embeddable: false }), null, MEDIDO)).toBeNull();
  });

  it("con restricción de edad → null", () => {
    expect(classifyLive(enDirecto(hoy, { ageRestricted: true }), null, MEDIDO)).toBeNull();
  });

  it("con actualEndTime → null (ya acabó, aunque diga 'live')", () => {
    const c = enDirecto(hoy, { actualEndTime: "2026-09-28T19:00:00Z" });
    expect(classifyLive(c, null, MEDIDO)).toBeNull();
  });

  it("el vídeo tal cual quedó grabado (lbc 'none') → null", () => {
    expect(classifyLive(video("e920mIf3ZpM"), evento(1090), MEDIDO)).toBeNull();
  });

  it("estreno de pelea de más de 2 min → peleas (Pelea Gratis de UFC Español)", () => {
    const c = enEstreno(video("wqKDXVHkSvk")); // 16:50
    expect(classifyLive(c, null, masTarde(c, 5 * MIN))).toBe("peleas");
  });

  it("estreno corto → null, aunque el título sea de pelea", () => {
    const c = enEstreno(video("wqKDXVHkSvk"));
    expect(classifyLive({ ...c, duration: "PT1M40S" }, null, masTarde(c, MIN))).toBeNull();
  });

  it("estreno largo que NO es de pelea → null (Embedded, entrevista…)", () => {
    const c = enEstreno(video("ycoYjEDRLgM")); // Embedded Español: Episodio 4, 8:39
    expect(classifyLive(c, null, masTarde(c, MIN))).toBeNull();
  });

  it("«Pelea» suelta en un reportaje NO es una pelea", () => {
    // Medido: UFC Español usa «pelea» en títulos de reportaje. Contar la palabra
    // suelta metería estos tres en UFC TV como si fueran combates.
    for (const title of [
      "#NocheUFC Waldo Cortes Acosta Pelea Ante Su Gente 🌵",
      "#UFCVegas116 Victor Valenzuela Mucho Más Que Una Pelea 🇨🇱",
      "#UFCSeattle Ignacio Bahamondes No Sabe Dar Peleas Aburridas 🇨🇱",
    ]) {
      const c = enEstreno({ ...video("wqKDXVHkSvk"), title });
      expect(classifyLive(c, null, masTarde(c, MIN)), title).toBeNull();
    }
  });
});

// ── pickLive: precedencia ───────────────────────────────────────────────────

describe("pickLive · precedencia", () => {
  const ahora = new Date("2026-09-26T20:20:00Z");
  const vegas121 = evento(1091);
  const previaEs = enDirecto(video("yLuMxIVAIaI"));
  const previaEn = enDirecto(video("yLuMxIVAIaI"), {
    videoId: "AAAAAAAAAAA",
    channel: "ufc",
    title: "UFC Vegas 121: Pre-Show + Early Prelims",
  });
  const maratonEn = enDirecto(video("qhucudYRwrI"), { actualStartTime: "2026-09-26T19:00:00Z" });
  const maratonEs = enDirecto(video("dH-mYfF1mkU"), { actualStartTime: "2026-09-26T19:30:00Z" });
  const estrenoEs = { ...enEstreno(video("wqKDXVHkSvk")), actualStartTime: "2026-09-26T20:10:00Z" };

  it("evento: el español antes que el inglés, venga en el orden que venga", () => {
    expect(pickLive([previaEn, previaEs], vegas121, ahora).evento?.videoId).toBe("yLuMxIVAIaI");
    expect(pickLive([previaEs, previaEn], vegas121, ahora).evento?.videoId).toBe("yLuMxIVAIaI");
  });

  it("evento: lo que ya está en el aire gana a lo programado, aunque lo programado sea en español", () => {
    // Una previa en español programada es una cuenta atrás en el reproductor;
    // unas preliminares en inglés ya en el aire son la velada.
    const previaEsProgramada = programado(video("yLuMxIVAIaI"), new Date("2026-09-26T20:40:00Z"));
    expect(pickLive([previaEsProgramada, previaEn], vegas121, ahora).evento?.videoId).toBe(
      "AAAAAAAAAAA",
    );
  });

  it("evento: del mismo canal, el que está en el aire antes que el programado", () => {
    const otraProgramada = programado(
      { ...video("yLuMxIVAIaI"), videoId: "BBBBBBBBBBB" },
      new Date("2026-09-26T20:40:00Z"),
    );
    expect(pickLive([otraProgramada, previaEs], vegas121, ahora).evento?.videoId).toBe(
      "yLuMxIVAIaI",
    );
  });

  it("peleas: el español antes que el inglés", () => {
    expect(pickLive([maratonEn, maratonEs], vegas121, ahora).peleas?.videoId).toBe("dH-mYfF1mkU");
  });

  it("peleas: un directo de verdad antes que un estreno, aunque el estreno sea en español", () => {
    expect(pickLive([estrenoEs, maratonEn], vegas121, ahora).peleas?.videoId).toBe("qhucudYRwrI");
  });

  it("devuelve las dos cosas por separado: quién pinta qué lo decide el llamador", () => {
    const pick = pickLive([maratonEn, previaEs], vegas121, ahora);
    expect(pick.evento?.videoId).toBe("yLuMxIVAIaI");
    expect(pick.peleas?.videoId).toBe("qhucudYRwrI");
  });

  it("sin candidatos, nada", () => {
    expect(pickLive([], vegas121, ahora)).toEqual({});
  });
});

// ── El bucle ────────────────────────────────────────────────────────────────

describe("isLoopFightTitle", () => {
  it("full fight y pelea gratis SÍ", () => {
    expect(isLoopFightTitle("Payton Talbott vs Henry Cejudo | FULL FIGHT | UFC 332")).toBe(true);
    expect(isLoopFightTitle("King Green vs Daniel Zellhuber | Full Fight")).toBe(true);
    expect(isLoopFightTitle("#NocheUFC Pelea Gratis: Delgado vs. Juárez")).toBe(true);
    expect(isLoopFightTitle("#UFCVegas116 Victor Valenzuela Pelea Gratis")).toBe(true);
  });

  it("maratones y eventos completos NO", () => {
    expect(isLoopFightTitle("Ciryl Gane vs Josh Hokit 🚨 | Full Fight Marathon")).toBe(false);
    expect(isLoopFightTitle("Crypto.com UFC 331: Free Fight Marathon")).toBe(false);
    expect(isLoopFightTitle("#NocheUFC Maratón: Alexa Grasso")).toBe(false);
    expect(isLoopFightTitle("#NocheUFC Evento Completo: Lopes vs. Silva")).toBe(false);
  });

  it("lo que no es un combate, tampoco", () => {
    expect(isLoopFightTitle("UFC 332 Embedded: Vlog Series - Episode 1")).toBe(false);
    expect(isLoopFightTitle("🔴 UFC 332: Post-Fight Press Conference")).toBe(false);
    expect(isLoopFightTitle("Zuffa Boxing 12: Main Event | FULL FIGHT")).toBe(false);
  });

  it("en la fixture salen las ~92 peleas medidas y ningún maratón", () => {
    const enBucle = CANDIDATOS.filter((c) => isLoopFightTitle(c.title));
    expect(enBucle.length).toBeGreaterThanOrEqual(90);
    expect(enBucle.some((c) => /marat|evento completo/i.test(c.title))).toBe(false);
  });
});

describe("buildLoopIds", () => {
  const POOL: LoopVideo[] = CANDIDATOS.filter((c) => isLoopFightTitle(c.title)).map((c) => ({
    videoId: c.videoId,
    title: c.title,
    channel: c.channel,
  }));

  it("es determinista: la misma semilla da el mismo orden", () => {
    expect(buildLoopIds(POOL, "2026-09-28")).toEqual(buildLoopIds(POOL, "2026-09-28"));
  });

  it("cambia de un día a otro", () => {
    expect(buildLoopIds(POOL, "2026-09-28")).not.toEqual(buildLoopIds(POOL, "2026-09-29"));
  });

  it("baraja de verdad: no devuelve el orden de entrada", () => {
    const ids = buildLoopIds(POOL, "2026-09-28");
    expect(ids).not.toEqual(POOL.slice(0, ids.length).map((v) => v.videoId));
  });

  it("como mucho 50, sin duplicados y todos del pool", () => {
    const repetido = [...POOL, ...POOL];
    const ids = buildLoopIds(repetido, "2026-09-28");
    expect(ids.length).toBe(50);
    expect(new Set(ids).size).toBe(ids.length);
    const validos = new Set(POOL.map((v) => v.videoId));
    expect(ids.every((id) => validos.has(id))).toBe(true);
  });

  it("una subida nueva a media jornada NO reordena el día: solo se intercala", () => {
    // El pool se refresca cada 6 h. Con el Fisher-Yates de antes, UN vídeo
    // más cambiaba el orden entero (medido: 0 de 50 posiciones iguales).
    const hoy = buildLoopIds(POOL, "2026-09-28");
    const nueva: LoopVideo = {
      videoId: "ZZZZZZZZZZZ",
      title: "Nueva Subida vs Otra | FULL FIGHT",
      channel: "ufc",
    };
    const conLaNueva = buildLoopIds([nueva, ...POOL], "2026-09-28");
    const sinLaNueva = conLaNueva.filter((id) => id !== nueva.videoId);
    // Los que siguen dentro del tope de 50 guardan su orden relativo.
    expect(sinLaNueva).toEqual(hoy.slice(0, sinLaNueva.length));
  });

  it("el mismo combate subido dos veces (ids distintos, mismo título) suena una sola vez", () => {
    // Medido: UFC Español subió dos veces «#UFC329 Pelea Gratis: Pimblett vs.
    // Chandler» (5xCjIqZnqzs y Bi2FvBeHuSg, los dos de 15:56).
    const dos: LoopVideo[] = [
      { videoId: "5xCjIqZnqzs", title: "#UFC329 Pelea Gratis: Pimblett vs. Chandler", channel: "ufc-es" },
      { videoId: "Bi2FvBeHuSg", title: "#UFC329 Pelea Gratis: Pimblett vs. Chandler", channel: "ufc-es" },
    ];
    expect(buildLoopIds([...dos, ...POOL.slice(0, 3)], "x")).toHaveLength(4);
  });

  it("con pocos vídeos devuelve todos, y con ninguno nada", () => {
    expect(buildLoopIds(POOL.slice(0, 3), "x").sort()).toEqual(
      POOL.slice(0, 3).map((v) => v.videoId).sort(),
    );
    expect(buildLoopIds([], "x")).toEqual([]);
  });

  it("utcDaySeed es la fecha UTC, no la de Madrid", () => {
    expect(utcDaySeed(new Date("2026-09-28T23:30:00Z"))).toBe("2026-09-28");
    expect(utcDaySeed(new Date("2026-09-29T00:30:00+02:00"))).toBe("2026-09-28");
  });
});

// ── Las URLs del reproductor ────────────────────────────────────────────────

describe("liveEmbedUrl / loopEmbedUrl", () => {
  it("directo: arranca solo, mudo y en línea", () => {
    expect(liveEmbedUrl("z1PhY6ix2XY")).toBe(
      "https://www.youtube-nocookie.com/embed/z1PhY6ix2XY?autoplay=1&mute=1&playsinline=1",
    );
  });

  it("bucle: el primero va en la ruta Y TAMBIÉN el primero de playlist", () => {
    // Sin él en la lista, con loop=1 YouTube se lo salta y arranca por el
    // segundo: medido en el navegador el 28-sep-2026 (ver loopEmbedUrl).
    const url = loopEmbedUrl(["4jCfhpKS4Wg", "eolk1_qxI28", "a4Q81kbvOXk"]);
    expect(url).toBe(
      "https://www.youtube-nocookie.com/embed/4jCfhpKS4Wg" +
        "?playlist=4jCfhpKS4Wg,eolk1_qxI28,a4Q81kbvOXk&loop=1&autoplay=1&mute=1&playsinline=1",
    );
  });

  it("bucle de un solo vídeo: playlist = el mismo id (lo que pide la doc para repetirlo)", () => {
    expect(loopEmbedUrl(["4jCfhpKS4Wg"])).toBe(
      "https://www.youtube-nocookie.com/embed/4jCfhpKS4Wg" +
        "?playlist=4jCfhpKS4Wg&loop=1&autoplay=1&mute=1&playsinline=1",
    );
  });

  it("la versión quieta (prefers-reduced-motion): ni autoplay ni mute, solo playsinline", () => {
    expect(liveEmbedUrl("z1PhY6ix2XY", { autoplay: false })).toBe(
      "https://www.youtube-nocookie.com/embed/z1PhY6ix2XY?playsinline=1",
    );
    expect(loopEmbedUrl(["4jCfhpKS4Wg", "eolk1_qxI28"], { autoplay: false })).toBe(
      "https://www.youtube-nocookie.com/embed/4jCfhpKS4Wg?playlist=4jCfhpKS4Wg,eolk1_qxI28&loop=1&playsinline=1",
    );
    expect(liveEmbedUrl(LIVE_VIDEO_OFF, { autoplay: false })).toBeNull();
  });

  it("'off' ni ningún id que no sea de YouTube llega nunca a un iframe", () => {
    expect(liveEmbedUrl(LIVE_VIDEO_OFF)).toBeNull();
    expect(liveEmbedUrl("")).toBeNull();
    expect(liveEmbedUrl("abc?autoplay=0")).toBeNull();
    expect(loopEmbedUrl([])).toBeNull();
    expect(loopEmbedUrl([LIVE_VIDEO_OFF])).toBeNull();
    expect(loopEmbedUrl([LIVE_VIDEO_OFF, "4jCfhpKS4Wg"])).toBe(
      "https://www.youtube-nocookie.com/embed/4jCfhpKS4Wg" +
        "?playlist=4jCfhpKS4Wg&loop=1&autoplay=1&mute=1&playsinline=1",
    );
  });
});

// ── resolveEventVideo: la columna manda ─────────────────────────────────────

describe("resolveEventVideo", () => {
  const detectado = video("yLuMxIVAIaI");

  it("el id escrito a mano gana al detectado (y no se inventa de qué canal es)", () => {
    expect(resolveEventVideo("qM-h-OudTqM", "UFC 330 | Previa", detectado)).toEqual({
      videoId: "qM-h-OudTqM",
      title: "UFC 330 | Previa",
      channel: null,
    });
  });

  it("a mano sin título: se respeta igual (el embed ya decide no pintarse)", () => {
    expect(resolveEventVideo("qM-h-OudTqM", null, detectado)).toEqual({
      videoId: "qM-h-OudTqM",
      title: null,
      channel: null,
    });
  });

  it("'off' apaga, haya lo que haya detectado", () => {
    expect(resolveEventVideo(LIVE_VIDEO_OFF, "lo que sea", detectado)).toBe("off");
    expect(resolveEventVideo(LIVE_VIDEO_OFF, null, null)).toBe("off");
  });

  it("'OFF', ' off ' o una URL escritos a mano con SQL también apagan: nunca llegan a un iframe", () => {
    for (const aMano of ["OFF", "Off", " off ", "https://youtu.be/qM-h-OudTqM", "no-vale"]) {
      expect(resolveEventVideo(aMano, "con título", detectado), aMano).toBe("off");
    }
  });

  it("sin nada a mano, el detectado con su título real y su canal", () => {
    expect(resolveEventVideo(null, null, detectado)).toEqual({
      videoId: "yLuMxIVAIaI",
      title: "#UFCVegas121: Previa del Evento ¡EN VIVO!",
      channel: "ufc-es",
    });
    // Una celda con espacios no es «escrita a mano»: no puede tapar la detección.
    expect(resolveEventVideo("  ", null, detectado)).toEqual({
      videoId: "yLuMxIVAIaI",
      title: "#UFCVegas121: Previa del Evento ¡EN VIVO!",
      channel: "ufc-es",
    });
  });

  it("needsLiveDetection: con cualquier cosa escrita a mano no se pregunta a YouTube", () => {
    expect(needsLiveDetection(null)).toBe(true);
    expect(needsLiveDetection(undefined)).toBe(true);
    expect(needsLiveDetection("  ")).toBe(true);
    expect(needsLiveDetection("qM-h-OudTqM")).toBe(false);
    expect(needsLiveDetection(LIVE_VIDEO_OFF)).toBe(false);
  });

  it("sin nada de nada, null", () => {
    expect(resolveEventVideo(null, null, null)).toBeNull();
    expect(resolveEventVideo(null, null, undefined)).toBeNull();
  });

  it("no repite un vídeo que la página ya enseña (careo o pesaje)", () => {
    expect(resolveEventVideo(null, null, detectado, [null, "yLuMxIVAIaI"])).toBeNull();
    expect(resolveEventVideo(null, null, detectado, ["otroIdAAAAA", null])).not.toBeNull();
  });
});

// ── planHomeSlot: qué pinta el hueco de la portada ──────────────────────────

describe("planHomeSlot · como mucho UNA cosa, y en este orden", () => {
  const previa = enDirecto(video("yLuMxIVAIaI"));
  const maraton = enDirecto(video("qhucudYRwrI"));
  const ambos = { evento: previa, peleas: maraton };

  it("'off' → nada, con el motivo (lo lee el e2e), aunque haya de todo en el aire", () => {
    expect(planHomeSlot(LIVE_VIDEO_OFF, null, ambos)).toEqual({ kind: "nada", reason: "off" });
  });

  it("id a mano con título → el bloque del evento con ESE vídeo, no el detectado", () => {
    expect(planHomeSlot("qM-h-OudTqM", "UFC 330 | Previa", ambos)).toEqual({
      kind: "evento",
      video: { videoId: "qM-h-OudTqM", title: "UFC 330 | Previa", channel: null },
    });
  });

  it("id a mano SIN título → nada, con su motivo: ni el embed ni UFC TV", () => {
    expect(planHomeSlot("qM-h-OudTqM", null, ambos)).toEqual({
      kind: "nada",
      reason: "manual-sin-titulo",
    });
  });

  it("el acto detectado gana a las peleas", () => {
    expect(planHomeSlot(null, null, ambos)).toEqual({
      kind: "evento",
      video: { videoId: previa.videoId, title: previa.title, channel: "ufc-es" },
    });
  });

  it("sin acto, las peleas en directo; sin nada, el bucle", () => {
    expect(planHomeSlot(null, null, { peleas: maraton })).toEqual({
      kind: "peleas",
      video: maraton,
    });
    expect(planHomeSlot(null, null, {})).toEqual({ kind: "bucle" });
  });
});

// ── Frescura de la foto de directos ─────────────────────────────────────────

describe("guarda de frescura", () => {
  const snapshot = { fetchedAt: "2026-09-28T19:20:00.000Z", items: [video("z1PhY6ix2XY")] };

  it("una foto de hace menos de 2×120 s vale", () => {
    const ahora = new Date("2026-09-28T19:23:00Z");
    expect(isSnapshotFresh(snapshot.fetchedAt, ahora)).toBe(true);
    expect(freshLiveItems(snapshot, ahora)).toHaveLength(1);
  });

  it("una foto vieja (unstable_cache la sirve caducada mientras revalida) = sin directo", () => {
    const ahora = new Date("2026-09-28T19:40:00Z");
    expect(isSnapshotFresh(snapshot.fetchedAt, ahora)).toBe(false);
    expect(freshLiveItems(snapshot, ahora)).toEqual([]);
  });

  it("una fecha ilegible tampoco vale", () => {
    expect(isSnapshotFresh("no-es-una-fecha", MEDIDO)).toBe(false);
  });
});

// ── La red: nunca lanza hacia la página, y gasta lo presupuestado ───────────

// Respuestas de la API construidas a partir de la fixture, en la forma real.
function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const UPLOADS: Record<string, UfcChannel> = {
  UUvgfXK4nTYKudb0rFR6noLA: "ufc",
  UUYXJFtx4SUkrb2p_8mhLPzQ: "ufc-es",
};

type OpcionesApiFalsa = {
  paginas?: number;
  fallaEn?: RegExp;
  // Páginas SIN FIN: recicla la fixture y siempre hay nextPageToken. Así es
  // POOL_PAGES quien para la paginación, y no que la fixture se acabe.
  sinFin?: boolean;
  // Sustituye la lista de subidas de un canal (orden incluido) y, con ella,
  // lo que devuelve videos.list para esos ids.
  canales?: Partial<Record<UfcChannel, YouTubeVideoItem[]>>;
};

function apiFalsa({ paginas = 1, fallaEn, sinFin = false, canales = {} }: OpcionesApiFalsa = {}) {
  const urls: string[] = [];
  const lista = (canal: UfcChannel) =>
    canales[canal] ?? (fixture.channels[canal] as YouTubeVideoItem[]);
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    // Como el fetch de verdad: con la señal abortada, ni contesta.
    if (init?.signal?.aborted) {
      throw init.signal.reason;
    }
    if (fallaEn?.test(url)) {
      return respuesta({ error: { code: 403 } }, 403);
    }
    const u = new URL(url);
    if (u.pathname.endsWith("/playlistItems")) {
      const canal = UPLOADS[u.searchParams.get("playlistId") ?? ""];
      const max = Number(u.searchParams.get("maxResults"));
      const pagina = Number(u.searchParams.get("pageToken") ?? "0");
      const todos = lista(canal);
      const trozo = sinFin
        ? Array.from({ length: max }, (_, i) => todos[(pagina * max + i) % todos.length])
        : todos.slice(pagina * max, (pagina + 1) * max);
      return respuesta({
        items: trozo.map((v) => ({
          snippet: { title: v.snippet?.title, resourceId: { videoId: v.id } },
        })),
        nextPageToken: sinFin || pagina + 1 < paginas ? String(pagina + 1) : undefined,
      });
    }
    if (u.pathname.endsWith("/videos")) {
      const ids = new Set((u.searchParams.get("id") ?? "").split(","));
      const todos = [...lista("ufc"), ...lista("ufc-es")];
      return respuesta({ items: todos.filter((v) => v.id && ids.has(v.id)) });
    }
    return respuesta({}, 404);
  });
  return { fetchImpl, urls };
}

describe("fetchUfcLiveNow", () => {
  it("con la API sana: 4 llamadas (playlistItems de 50 + 25 y dos videos.list) y solo live/upcoming", async () => {
    const { fetchImpl, urls } = apiFalsa();
    const snap = await fetchUfcLiveNow({ fetchImpl, apiKey: "k", now: () => MEDIDO });
    expect(urls).toHaveLength(4);
    const listas = urls.filter((u) => u.includes("/playlistItems"));
    expect(listas).toHaveLength(2);
    expect(listas.find((u) => u.includes("UUvgfXK4nTYKudb0rFR6noLA"))).toContain("maxResults=50");
    expect(listas.find((u) => u.includes("UUYXJFtx4SUkrb2p_8mhLPzQ"))).toContain("maxResults=25");
    // Ninguna llamada a videos.list con más de 50 ids (el tope de la API).
    for (const u of urls.filter((x) => x.includes("/videos?"))) {
      expect(new URL(u).searchParams.get("id")?.split(",").length).toBeLessThanOrEqual(50);
    }
    expect(snap.fetchedAt).toBe(MEDIDO.toISOString());
    expect(snap.items.map((c) => c.videoId).sort()).toEqual(
      ["AWfWwkQz0yc", "uXf5Da2QkR8", "z1PhY6ix2XY"].sort(),
    );
  });

  it("ve un directo del canal inglés aunque 40 subidas lo hayan empujado hacia abajo", async () => {
    // Noche de velada: el canal inglés sube clips sin parar mientras emite
    // (28 durante la cartelera estelar del 331). Con 25 se salía de la ventana.
    const ingles = fixture.channels.ufc as YouTubeVideoItem[];
    const directo = ingles.find((v) => v.id === "z1PhY6ix2XY") as YouTubeVideoItem;
    const resto = ingles.filter((v) => v.id !== "z1PhY6ix2XY");
    const empujado = [...resto.slice(0, 40), directo, ...resto.slice(40)];
    const { fetchImpl } = apiFalsa({ canales: { ufc: empujado } });
    const snap = await fetchUfcLiveNow({ fetchImpl, apiKey: "k", now: () => MEDIDO });
    expect(snap.items.map((c) => c.videoId)).toContain("z1PhY6ix2XY");
  });

  it("sin clave no llama a nadie", async () => {
    const { fetchImpl } = apiFalsa();
    const snap = await fetchUfcLiveNow({ fetchImpl, apiKey: undefined });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });

  it("si fetch lanza → [] sin lanzar", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(fetchUfcLiveNow({ fetchImpl, apiKey: "k" })).resolves.toMatchObject({ items: [] });
  });

  it("si la API responde 403 (cuota) → [] sin lanzar", async () => {
    const { fetchImpl } = apiFalsa({ fallaEn: /videos\?/ });
    await expect(fetchUfcLiveNow({ fetchImpl, apiKey: "k" })).resolves.toMatchObject({ items: [] });
  });

  it("si YouTube no contesta, corta por timeout → [] sin lanzar", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const t0 = Date.now();
    const snap = await fetchUfcLiveNow({ fetchImpl, apiKey: "k", timeoutMs: 30 });
    expect(snap.items).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});

describe("fetchFullFightPool", () => {
  it("pagina los dos canales y se queda solo con peleas completas jugables", async () => {
    const { fetchImpl, urls } = apiFalsa({ paginas: 3 });
    const pool = await fetchFullFightPool({ fetchImpl, apiKey: "k", now: () => MEDIDO });
    expect(urls.some((u) => u.includes("pageToken=2"))).toBe(true);
    expect(pool.videos.length).toBeGreaterThan(0);
    expect(pool.videos.every((v) => isLoopFightTitle(v.title))).toBe(true);
    expect(new Set(pool.videos.map((v) => v.channel))).toEqual(new Set(["ufc", "ufc-es"]));
    // Ni maratones, ni el directo de hoy.
    expect(pool.videos.some((v) => v.videoId === "z1PhY6ix2XY")).toBe(false);
  });

  it("gasta ~20 unidades por refresco: EXACTAMENTE 12 + 6 páginas de 50", async () => {
    // 🪤 Con la fixture tal cual, la paginación se cortaba sola en 3 + 5
    // páginas (se acaban los vídeos) y se podía subir POOL_PAGES a 100 sin que
    // cayera nada. Con páginas sin fin, el tope es lo único que la para.
    const { fetchImpl, urls } = apiFalsa({ sinFin: true });
    await fetchFullFightPool({ fetchImpl, apiKey: "k" });
    const listas = urls.filter((u) => u.includes("/playlistItems"));
    expect(listas.filter((u) => u.includes("UUvgfXK4nTYKudb0rFR6noLA"))).toHaveLength(12);
    expect(listas.filter((u) => u.includes("UUYXJFtx4SUkrb2p_8mhLPzQ"))).toHaveLength(6);
    expect(listas.every((u) => u.includes("maxResults=50"))).toBe(true);
    expect(urls.length).toBeLessThanOrEqual(24);
  });

  it("si falla la PRIMERA página, LANZA (para no cachear un bucle vacío 6 h)", async () => {
    const { fetchImpl } = apiFalsa({ fallaEn: /playlistItems.*UUYXJFtx4SUkrb2p_8mhLPzQ(?!.*pageToken)/ });
    await expect(fetchFullFightPool({ fetchImpl, apiKey: "k" })).rejects.toThrow();
  });

  it("y aborta el OTRO canal: no sigue pagando páginas para un resultado que se tira", async () => {
    const { fetchImpl, urls } = apiFalsa({
      sinFin: true,
      fallaEn: /playlistItems.*UUYXJFtx4SUkrb2p_8mhLPzQ(?!.*pageToken)/,
    });
    await expect(fetchFullFightPool({ fetchImpl, apiKey: "k" })).rejects.toThrow();
    // El rechazo llega en cuanto cae el primer canal; lo que se quiere ver es
    // lo que el OTRO sigue gastando después, en segundo plano. Se le da tiempo.
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Sin el aborto, el canal inglés seguía hasta sus 12 páginas (13 llamadas).
    expect(urls.filter((u) => u.includes("/playlistItems")).length).toBeLessThanOrEqual(4);
  });

  it("solo entran peleas que se ven en España, embebibles, sin edad, terminadas y de más de 2 min", async () => {
    // Cinco peleas completas reales de UFC Español, cada una con UNA cosa que
    // la deja fuera. Sin estos filtros el bucle metería un marco que no se ve.
    const retoques: [string, (v: YouTubeVideoItem) => YouTubeVideoItem][] = [
      ["X7k1eTCC3_w", (v) => ({ ...v, contentDetails: { ...v.contentDetails, regionRestriction: { blocked: ["ES"] } } })],
      ["n3TSfUrKZ0E", (v) => ({ ...v, status: { ...v.status, embeddable: false } })],
      ["eolk1_qxI28", (v) => ({ ...v, contentDetails: { ...v.contentDetails, duration: "PT1M30S" } })],
      ["NcCPNVPx3O4", (v) => ({ ...v, snippet: { ...v.snippet, liveBroadcastContent: "upcoming" } })],
      ["jS_WDU48zaM", (v) => ({ ...v, contentDetails: { ...v.contentDetails, contentRating: { ytRating: "ytAgeRestricted" } } })],
    ];
    let es = fixture.channels["ufc-es"] as YouTubeVideoItem[];
    for (const [id, cambio] of retoques) {
      expect(es.some((v) => v.id === id), `la fixture ya no trae ${id}`).toBe(true);
      es = es.map((v) => (v.id === id ? cambio(v) : v));
    }
    const { fetchImpl } = apiFalsa({ paginas: 6, canales: { "ufc-es": es } });
    const pool = await fetchFullFightPool({ fetchImpl, apiKey: "k" });
    const dentro = new Set(pool.videos.map((v) => v.videoId));
    for (const [id] of retoques) {
      expect(dentro.has(id), `${id} no debería estar en el bucle`).toBe(false);
    }
    // Y el resto de UFC Español sigue dentro: el filtro no tira de más.
    expect(pool.videos.filter((v) => v.channel === "ufc-es").length).toBeGreaterThan(10);
  });

  it("si TODO queda filtrado, LANZA en vez de cachear un bucle vacío 6 h", async () => {
    const sinEspaña = (canal: UfcChannel) =>
      (fixture.channels[canal] as YouTubeVideoItem[]).map((v) => ({
        ...v,
        contentDetails: { ...v.contentDetails, regionRestriction: { blocked: ["ES"] } },
      }));
    const { fetchImpl } = apiFalsa({
      paginas: 6,
      canales: { ufc: sinEspaña("ufc"), "ufc-es": sinEspaña("ufc-es") },
    });
    await expect(fetchFullFightPool({ fetchImpl, apiKey: "k" })).rejects.toThrow(/vac/);
  });

  it("si falla una página POSTERIOR, devuelve lo que ya tenía", async () => {
    const { fetchImpl } = apiFalsa({ paginas: 3, fallaEn: /pageToken=1/ });
    const pool = await fetchFullFightPool({ fetchImpl, apiKey: "k" });
    expect(pool.videos.length).toBeGreaterThan(0);
  });

  it("sin clave, lanza (no hay bucle que cachear)", async () => {
    const { fetchImpl } = apiFalsa();
    await expect(fetchFullFightPool({ fetchImpl, apiKey: undefined })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ── Modo fixture (e2e determinista) ─────────────────────────────────────────

describe("UFC_TV_FIXTURE", () => {
  const original = process.env.UFC_TV_FIXTURE;
  const redReal = vi.fn(async () => {
    throw new Error("el modo fixture NO debe tocar la red");
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", redReal);
    redReal.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original === undefined) {
      delete process.env.UFC_TV_FIXTURE;
    } else {
      process.env.UFC_TV_FIXTURE = original;
    }
  });

  it("solo acepta los cuatro valores conocidos", () => {
    expect(readFixtureMode({ UFC_TV_FIXTURE: "loop" })).toBe("loop");
    expect(readFixtureMode({ UFC_TV_FIXTURE: "evento" })).toBe("evento");
    expect(readFixtureMode({ UFC_TV_FIXTURE: "LOOP" })).toBeNull();
    expect(readFixtureMode({})).toBeNull();
  });

  it("'loop': sin directo y con bucle, sin tocar la red", async () => {
    process.env.UFC_TV_FIXTURE = "loop";
    const live = await getUfcLiveNow();
    const pool = await getFullFightPool();
    expect(live.items).toEqual([]);
    expect(isSnapshotFresh(live.fetchedAt, new Date())).toBe(true);
    expect(pool.videos.length).toBeGreaterThanOrEqual(4);
    expect(buildLoopIds(pool.videos, "2026-09-28").length).toBe(pool.videos.length);
    expect(redReal).not.toHaveBeenCalled();
  });

  it("'live': el directo de peleas del 28-sep, que se clasifica como peleas", async () => {
    process.env.UFC_TV_FIXTURE = "live";
    const live = await getUfcLiveNow();
    const ahora = new Date();
    expect(pickLive(freshLiveItems(live, ahora), null, ahora).peleas?.videoId).toBe("z1PhY6ix2XY");
    expect(redReal).not.toHaveBeenCalled();
  });

  it("'off': ni directo ni bucle", async () => {
    process.env.UFC_TV_FIXTURE = "off";
    expect((await getUfcLiveNow()).items).toEqual([]);
    expect((await getFullFightPool()).videos).toEqual([]);
    expect(redReal).not.toHaveBeenCalled();
  });

  it("getLivePick aplica la guarda de frescura: una foto de hace 10 min no es «en directo»", async () => {
    // La foto enlatada lleva fetchedAt = ahora. Leída como si fueran 10 min
    // después, es una foto vieja: sin la guarda, getLivePick rotularía «EN
    // DIRECTO» un directo que puede haber acabado.
    process.env.UFC_TV_FIXTURE = "live";
    expect((await getLivePick(null)).peleas?.videoId).toBe("z1PhY6ix2XY");
    expect(await getLivePick(null, new Date(Date.now() + 10 * MIN))).toEqual({});
  });

  it("sin fixture y con la red caída, getUfcLiveNow tampoco lanza", async () => {
    delete process.env.UFC_TV_FIXTURE;
    const clave = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "k";
    try {
      await expect(getUfcLiveNow()).resolves.toMatchObject({ items: [] });
    } finally {
      if (clave === undefined) {
        delete process.env.YOUTUBE_API_KEY;
      } else {
        process.env.YOUTUBE_API_KEY = clave;
      }
    }
  });
});

// ── Agrupar y frenar los refrescos ──────────────────────────────────────────

describe("singleFlight · las llamadas simultáneas comparten UNA petición", () => {
  it("mientras hay una en vuelo no se lanza otra; al acabar, sí", async () => {
    let soltar: (v: number) => void = () => {};
    const fn = vi.fn(() => new Promise<number>((resolve) => (soltar = resolve)));
    const compartida = singleFlight(fn);
    const a = compartida();
    const b = compartida();
    expect(fn).toHaveBeenCalledTimes(1);
    soltar(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    void compartida();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("si falla, las dos la ven fallar y la siguiente vuelve a intentarlo", async () => {
    const fn = vi.fn(async () => {
      throw new Error("403");
    });
    const compartida = singleFlight(fn);
    await expect(Promise.all([compartida(), compartida()])).rejects.toThrow("403");
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(compartida()).rejects.toThrow("403");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("withCooldown · tras un fallo, no se reintenta hasta que pasa la pausa", () => {
  it("falla sin llamar durante la pausa, y pasada la pausa vuelve a intentarlo", async () => {
    let reloj = 0;
    const fn = vi.fn(async () => {
      throw new Error("bucle vacío");
    });
    const frenada = withCooldown(fn, 30 * MIN, () => reloj);
    await expect(frenada()).rejects.toThrow("bucle vacío");
    reloj += 29 * MIN;
    await expect(frenada()).rejects.toThrow(/pausa/);
    expect(fn).toHaveBeenCalledTimes(1);
    reloj += 2 * MIN;
    await expect(frenada()).rejects.toThrow("bucle vacío");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("si sale bien, no frena nada", async () => {
    const fn = vi.fn(async () => 1);
    const frenada = withCooldown(fn, 30 * MIN, () => 0);
    await frenada();
    await frenada();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("getFullFightPool · con YouTube fallando, la portada no quema la cuota", () => {
  // Un módulo NUEVO en cada test: el cortacircuitos y el último bucle bueno
  // viven en el módulo (son por instancia del servidor, a propósito).
  const original = { fixture: process.env.UFC_TV_FIXTURE, clave: process.env.YOUTUBE_API_KEY };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.UFC_TV_FIXTURE;
    process.env.YOUTUBE_API_KEY = "k";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [nombre, valor] of [
      ["UFC_TV_FIXTURE", original.fixture],
      ["YOUTUBE_API_KEY", original.clave],
    ] as const) {
      if (valor === undefined) {
        delete process.env[nombre];
      } else {
        process.env[nombre] = valor;
      }
    }
  });

  it("un fallo persistente se paga UNA vez: la visita siguiente no vuelve a llamar", async () => {
    const { fetchImpl, urls } = apiFalsa({ fallaEn: /playlistItems/ });
    vi.stubGlobal("fetch", fetchImpl);
    const fresco = await import("@/lib/ufc-tv");
    await expect(fresco.getFullFightPool()).rejects.toThrow();
    const tras1 = urls.length;
    expect(tras1).toBeGreaterThan(0);
    await expect(fresco.getFullFightPool()).rejects.toThrow();
    await expect(fresco.getFullFightPool()).rejects.toThrow();
    expect(urls.length, "cada visita volvía a pagar el refresco entero").toBe(tras1);
  });

  it("si el refresco falla, sirve el último bucle bueno de la instancia", async () => {
    const sana = apiFalsa({ paginas: 6 });
    let caida = false;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      caida ? Promise.resolve(respuesta({}, 403)) : sana.fetchImpl(url, init),
    );
    const fresco = await import("@/lib/ufc-tv");
    const bueno = await fresco.getFullFightPool();
    expect(bueno.videos.length).toBeGreaterThan(0);
    caida = true;
    await expect(fresco.getFullFightPool()).resolves.toEqual(bueno);
  });
});

describe("liveBucket · el tramo de 120 s que va en la clave de la caché de directos", () => {
  it("es el mismo dentro del tramo y cambia al pasar al siguiente", () => {
    const inicio = new Date(Math.floor(MEDIDO.getTime() / 120_000) * 120_000);
    expect(liveBucket(new Date(inicio.getTime() + 119_000))).toBe(liveBucket(inicio));
    expect(liveBucket(new Date(inicio.getTime() + 120_000))).toBe(liveBucket(inicio) + 1);
  });
});

// ── Guardas de fuente ───────────────────────────────────────────────────────

describe("guardas de fuente de ufc-tv.ts", () => {
  const fuente = readFileSync(fileURLToPath(new URL("./ufc-tv.ts", import.meta.url)), "utf8");

  it("NUNCA usa search.list (100 unidades por llamada)", () => {
    expect(fuente).not.toContain("youtube/v3/search");
  });

  it("los TTL no bajan de lo presupuestado", () => {
    expect(LIVE_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(90);
    expect(POOL_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(3600);
  });

  it("y son ESOS los que usa unstable_cache, no un número escrito a mano", () => {
    const usados = [...fuente.matchAll(/revalidate:\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(usados.sort()).toEqual(["LIVE_REVALIDATE_SECONDS", "POOL_REVALIDATE_SECONDS"]);
  });

  it("la caché de directos se lee con el TRAMO en la clave (si no, sirve fotos caducadas)", () => {
    // Aquí unstable_cache es un paso directo, así que la clave no se puede
    // observar: se exige en el fuente. Sin el tramo, con poco tráfico nadie
    // veía nunca el directo (la foto llegaba siempre caducada y la guarda la
    // tiraba).
    expect(fuente).toMatch(/getUfcLiveNowCached\(liveBucket\(new Date\(\)\)\)/);
  });

  it("los dos refrescos pasan por singleFlight, y el del bucle además por withCooldown", () => {
    expect(fuente).toMatch(/singleFlight\(\(\) => fetchUfcLiveNow\(\)\)/);
    expect(fuente).toMatch(/withCooldown\(\s*singleFlight\(\(\) => fetchFullFightPool\(\)\)/);
  });
});
