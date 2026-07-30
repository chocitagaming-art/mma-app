import { describe, expect, it } from "vitest";

import {
  claveDiaLogico,
  formatMadridDate,
  formatMadridTime,
  resolveUfcToday,
  type UfcTodayEvent,
} from "@/lib/ufc-today";

// AVISO PARA QUIEN TOQUE ESTE FICHERO: estos tests NO deben depender del huso
// del proceso. El megatest corre siempre en Europe/Madrid y el CI en UTC, así
// que un aserto que solo sea cierto en uno de los dos pasa en el portátil y
// tumba el CI (ya pasó el 28-jul con la fecha de nacimiento). Todo lo de abajo
// se verificó bajo `TZ=UTC` y bajo `TZ=Europe/Madrid`.
//
// Todas las horas de los datos van en UTC porque así las entrega Postgres; los
// comentarios dan su equivalencia peninsular, que es lo que ve el usuario.

// Evento 1063, el real del sábado 1-ago: prelims 14:00Z (16:00 en Madrid),
// estelar 17:00Z (19:00 en Madrid).
const EVENTO_1063: UfcTodayEvent = {
  eventDate: "2026-08-01",
  prelimsTime: "2026-08-01 14:00:00+00",
  startTime: "2026-08-01 17:00:00+00",
  earlyPrelimsTime: null,
};

// Evento 1087, el real del 8-ago y el caso que rompe la intuición: event_date
// dice 8-ago, pero empieza a las 00:00Z del 9 — o sea, las 02:00 de la
// madrugada del DOMINGO en Madrid. Para un español es "la velada del sábado".
const EVENTO_1087: UfcTodayEvent = {
  eventDate: "2026-08-08",
  prelimsTime: null,
  startTime: "2026-08-09 00:00:00+00",
  earlyPrelimsTime: null,
};

describe("resolveUfcToday", () => {
  it("sin evento, la respuesta es no", () => {
    const r = resolveUfcToday(null, new Date("2026-07-30T10:00:00Z"));
    expect(r.verdict).toBe("no");
    expect(r.daysUntil).toBeNull();
  });

  it("el mismo día y a hora normal responde que sí", () => {
    // Sábado 1-ago, 11:00 en Madrid. Los prelims son a las 16:00.
    const r = resolveUfcToday(EVENTO_1063, new Date("2026-08-01T09:00:00Z"));
    expect(r.verdict).toBe("hoy");
    expect(r.daysUntil).toBe(0);
  });

  it("una velada de madrugada cuenta como la noche del día anterior", () => {
    // Sábado 8-ago, 20:00 en Madrid. El primer combate es a las 02:00 del
    // domingo: por calendario es "mañana", pero quien pregunta un sábado por la
    // tarde quiere oír que sí.
    const r = resolveUfcToday(EVENTO_1087, new Date("2026-08-08T18:00:00Z"));
    expect(r.verdict).toBe("esta-madrugada");
    expect(r.daysUntil).toBe(0);
  });

  it("de madrugada, con el evento ya empezado, responde en directo", () => {
    // Domingo 9-ago, 03:00 en Madrid: está ocurriendo.
    const r = resolveUfcToday(EVENTO_1087, new Date("2026-08-09T01:00:00Z"));
    expect(r.verdict).toBe("en-directo");
  });

  it("con el estelar ya caído no dice en directo, pero sigue siendo hoy", () => {
    const r = resolveUfcToday(
      { ...EVENTO_1063, mainEventFinished: true },
      new Date("2026-08-01T20:00:00Z"),
    );
    expect(r.verdict).toBe("hoy");
    expect(r.finished).toBe(true);
  });

  it("cuenta los días que faltan por el día natural de Madrid", () => {
    // Jueves 30-jul, 12:00 en Madrid → sábado 1-ago: faltan 2 días.
    const r = resolveUfcToday(EVENTO_1063, new Date("2026-07-30T10:00:00Z"));
    expect(r.verdict).toBe("no");
    expect(r.daysUntil).toBe(2);
  });

  it("el 1087 cae en el día 8, no en el 9, al contar los días que faltan", () => {
    // Jueves 30-jul → la velada "del sábado 8". Son 9 días, no 10.
    const r = resolveUfcToday(EVENTO_1087, new Date("2026-07-30T10:00:00Z"));
    expect(r.daysUntil).toBe(9);
  });

  it("pasada la medianoche sigue siendo la velada de esa noche", () => {
    // 00:30 del domingo 2 en Madrid, con la velada del sábado 1. Decir "hoy no
    // hay UFC" media hora después de que acabe sería absurdo.
    const r = resolveUfcToday(
      { ...EVENTO_1063, mainEventFinished: true },
      new Date("2026-08-01T22:30:00Z"),
    );
    expect(r.verdict).toBe("hoy");
    expect(r.daysUntil).toBe(0);
  });

  it("a las 06:00 de Madrid ya es un día nuevo", () => {
    // 06:30 del domingo 2 en Madrid: la velada del sábado ya es pasado.
    const r = resolveUfcToday(
      { ...EVENTO_1063, mainEventFinished: true },
      new Date("2026-08-02T04:30:00Z"),
    );
    expect(r.verdict).toBe("no");
    expect(r.daysUntil).toBe(-1);
  });

  it("sin ningún horario se cae a la fecha del evento", () => {
    const sinHoras: UfcTodayEvent = {
      eventDate: "2026-08-01",
      startTime: null,
      prelimsTime: null,
      earlyPrelimsTime: null,
    };
    expect(resolveUfcToday(sinHoras, new Date("2026-08-01T09:00:00Z")).verdict).toBe("hoy");
    expect(resolveUfcToday(sinHoras, new Date("2026-07-30T09:00:00Z")).verdict).toBe("no");
  });

  it("usa el primer tramo, no el estelar, para decidir el día", () => {
    // Si mirase startTime, un evento con prelims a las 23:00 y estelar a las
    // 02:00 se contaría en el día equivocado.
    const aCaballo: UfcTodayEvent = {
      eventDate: "2026-08-01",
      earlyPrelimsTime: null,
      prelimsTime: "2026-08-01 21:00:00+00", // 23:00 en Madrid, sábado
      startTime: "2026-08-02 00:00:00+00", // 02:00 en Madrid, domingo
    };
    const r = resolveUfcToday(aCaballo, new Date("2026-08-01T15:00:00Z"));
    expect(r.verdict).toBe("hoy");
  });
});

describe("claveDiaLogico", () => {
  it("la madrugada pertenece al día anterior", () => {
    // 01:30 del 2-ago en Madrid.
    expect(claveDiaLogico(new Date("2026-08-01T23:30:00Z"))).toBe("2026-08-01");
  });

  it("a partir de las 06:00 empieza el día nuevo", () => {
    // 06:30 del 2-ago en Madrid.
    expect(claveDiaLogico(new Date("2026-08-02T04:30:00Z"))).toBe("2026-08-02");
  });

  it("respeta el horario de verano peninsular", () => {
    // En agosto Madrid va en UTC+2: las 22:30Z son las 00:30 del día siguiente.
    expect(claveDiaLogico(new Date("2026-08-01T22:30:00Z"))).toBe("2026-08-01");
    // En enero va en UTC+1: las 22:30Z siguen siendo las 23:30 del mismo día.
    expect(claveDiaLogico(new Date("2026-01-15T22:30:00Z"))).toBe("2026-01-15");
  });
});

describe("formato peninsular", () => {
  it("convierte el timestamptz de Postgres a hora de Madrid", () => {
    // 14:00Z en agosto = 16:00 en Madrid.
    expect(formatMadridTime("2026-08-01 14:00:00+00")).toBe("16:00");
    // 00:00Z del 9 = 02:00 de la madrugada del 9 en Madrid.
    expect(formatMadridTime("2026-08-09 00:00:00+00")).toBe("02:00");
  });

  it("da la fecha en Madrid, no en UTC", () => {
    // Las 00:00Z del domingo 9 son la madrugada del domingo 9 en Madrid.
    expect(formatMadridDate("2026-08-09 00:00:00+00")).toBe("domingo, 9 de agosto");
    // Pero las 23:00Z del sábado 8 ya son domingo en Madrid.
    expect(formatMadridDate("2026-08-08 23:00:00+00")).toBe("domingo, 9 de agosto");
  });

  it("sin valor devuelve null en vez de romper", () => {
    expect(formatMadridTime(null)).toBeNull();
    expect(formatMadridDate(null)).toBeNull();
  });
});
