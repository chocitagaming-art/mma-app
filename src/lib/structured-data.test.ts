import { describe, expect, it } from "vitest";

import { SITE_URL } from "@/lib/site-url";
import {
  absoluteUrl,
  buildEventJsonLd,
  buildFighterJsonLd,
  decodeHtmlEntities,
  resolveEventStartDate,
  serializeJsonLd,
  toIsoDateOnly,
  type EventJsonLdInput,
  type FighterJsonLdInput,
} from "@/lib/structured-data";

const FIGHTER: FighterJsonLdInput = {
  id: 6493,
  name: "Charles Oliveira",
  nickname: "do Bronx",
  headshotUrl: "https://ejemplo.test/oliveira.png",
  nationality: "Brazil",
  birthDate: "1989-10-17",
  birthPlace: "Guarujá, São Paulo, Brasil",
  heightCm: 178,
  trainsAt: "Chute Boxe Diego Lima",
  wins: 35,
  losses: 11,
  draws: 0,
};

const EVENTO: EventJsonLdInput = {
  id: 1063,
  name: "UFC Fight Night: Medic vs. Rodriguez",
  eventDate: "2026-08-01",
  location: "UFC APEX, Las Vegas, Nevada, USA",
  status: "upcoming",
  startTime: "2026-08-01 17:00:00+00",
  prelimsTime: "2026-08-01 14:00:00+00",
  earlyPrelimsTime: null,
  imageUrl: "https://ejemplo.test/1063.jpg",
  tagline: "Noche de peso ligero",
  bouts: [
    {
      fightId: 14100,
      red: { id: 6493, name: "Charles Oliveira" },
      blue: { id: 7001, name: "Rival Uno" },
    },
    // Combate futuro con rival sin asignar: `id` a null es el caso normal, no
    // un dato corrupto.
    { fightId: 14101, red: { id: 7002, name: "Otro Peleador" }, blue: { id: null, name: "TBD" } },
  ],
};

describe("serializeJsonLd", () => {
  it("escapa `<` para que un nombre no pueda cerrar la etiqueta <script>", () => {
    const salida = serializeJsonLd({ name: "</script><img src=x onerror=alert(1)>" });

    expect(salida).not.toContain("</script>");
    expect(salida).toContain("\\u003c");
    // El escape NO altera el dato: al parsearlo vuelve el texto original.
    expect(JSON.parse(salida).name).toBe("</script><img src=x onerror=alert(1)>");
  });

  it("produce JSON válido para la ficha completa de un evento", () => {
    expect(() => JSON.parse(serializeJsonLd(buildEventJsonLd(EVENTO)))).not.toThrow();
  });
});

describe("toIsoDateOnly", () => {
  // EL BUG QUE ESTO ARREGLA: `fighters.birth_date` es DATE y getFighterDetail la
  // trae con `select f.*` sin castear, así que node-postgres devuelve un objeto
  // Date construido a MEDIANOCHE LOCAL — no el string que promete el tipo.
  it("recupera el día natural de un Date de Postgres al este de Greenwich", () => {
    // Lo que devuelve pg para el 17-oct-1989 en Europa/Madrid: su toISOString()
    // dice "1989-10-16T23:00:00.000Z", un día MENOS.
    const dePostgres = new Date(1989, 9, 17, 0, 0, 0);

    expect(dePostgres.toISOString().slice(0, 10)).toBe("1989-10-16"); // el bug
    expect(toIsoDateOnly(dePostgres)).toBe("1989-10-17"); // el arreglo
  });

  it("también acierta al oeste de Greenwich", () => {
    // Un huso negativo corre el instante al día siguiente en UTC; el día natural
    // sigue siendo el mismo y es el que hay que publicar.
    expect(toIsoDateOnly(new Date(1989, 9, 17, 23, 30, 0))).toBe("1989-10-17");
  });

  it("acepta el string ISO que ya viene casteado (event_date)", () => {
    expect(toIsoDateOnly("2026-08-01")).toBe("2026-08-01");
    expect(toIsoDateOnly("2026-08-01 17:00:00+00")).toBe("2026-08-01");
  });

  it("descarta basura en vez de publicarla", () => {
    expect(toIsoDateOnly(null)).toBeNull();
    expect(toIsoDateOnly(undefined)).toBeNull();
    expect(toIsoDateOnly("")).toBeNull();
    expect(toIsoDateOnly("no es una fecha")).toBeNull();
    expect(toIsoDateOnly(new Date("fecha inválida"))).toBeNull();
  });
});

describe("decodeHtmlEntities", () => {
  // Casos REALES sacados de la BD de producción el 28-jul-2026.
  it("decodifica las entidades que los scrapers dejan crudas", () => {
    expect(decodeHtmlEntities("Bronx&#039;s Gold Team")).toBe("Bronx's Gold Team");
    expect(decodeHtmlEntities("Glory MMA &amp; Fitness")).toBe("Glory MMA & Fitness");
    expect(decodeHtmlEntities("Mick Doyle&#039;s Kickboxing - Omaha, NE")).toBe(
      "Mick Doyle's Kickboxing - Omaha, NE",
    );
  });

  it("resuelve el doble codificado que hay en birth_place", () => {
    expect(decodeHtmlEntities("Ponte dell&amp;#039;Olio, Italy")).toBe(
      "Ponte dell'Olio, Italy",
    );
    expect(decodeHtmlEntities("St. Pierre &amp;amp; Miquelon, France")).toBe(
      "St. Pierre & Miquelon, France",
    );
  });

  it("se detiene a las dos pasadas y no se deja arrastrar", () => {
    // Triple codificado: se desenrolla dos veces y para. Que quede una entidad a
    // medias es MEJOR que un bucle sin tope gobernado por el dato de entrada.
    expect(decodeHtmlEntities("&amp;amp;amp;lt;")).toBe("&amp;lt;");
  });

  it("no toca un texto limpio", () => {
    expect(decodeHtmlEntities("Chute Boxe Diego Lima")).toBe("Chute Boxe Diego Lima");
  });
});

describe("absoluteUrl", () => {
  it("compone la URL absoluta que exige schema.org", () => {
    expect(absoluteUrl("/fighters/6493")).toBe(`${SITE_URL}/fighters/6493`);
  });

  it("tolera una ruta sin barra inicial", () => {
    expect(absoluteUrl("fighters/6493")).toBe(`${SITE_URL}/fighters/6493`);
  });
});

describe("buildFighterJsonLd", () => {
  it("marca la ficha como Person con su récord y su equipo", () => {
    const ld = buildFighterJsonLd(FIGHTER);

    expect(ld["@type"]).toBe("Person");
    expect(ld.name).toBe("Charles Oliveira");
    expect(ld.alternateName).toBe("do Bronx");
    expect(ld.description).toContain("35-11-0");
    expect(ld.nationality).toEqual({ "@type": "Country", name: "Brazil" });
    expect(ld.height).toEqual({ "@type": "QuantitativeValue", value: 178, unitCode: "CMT" });
    expect(ld.affiliation).toEqual({
      "@type": "SportsOrganization",
      name: "Chute Boxe Diego Lima",
    });
  });

  it("usa el id NUMÉRICO en la URL, que es lo que mata el duplicado de /fighters/06493", () => {
    // El id llega ya parseado (parseId devuelve number), así que la URL no puede
    // arrastrar los ceros a la izquierda de la ruta original.
    expect(buildFighterJsonLd(FIGHTER).url).toBe(`${SITE_URL}/fighters/6493`);
  });

  it("omite las claves vacías en vez de emitirlas a null", () => {
    const ld = buildFighterJsonLd({
      id: 1,
      name: "Debutante",
      nickname: null,
      headshotUrl: null,
      nationality: null,
      birthDate: null,
      birthPlace: null,
      heightCm: null,
      trainsAt: null,
      wins: 0,
      losses: 0,
      draws: 0,
    });

    for (const clave of [
      "alternateName",
      "image",
      "nationality",
      "birthDate",
      "birthPlace",
      "height",
      "affiliation",
    ]) {
      expect(ld, `${clave} no debería estar presente`).not.toHaveProperty(clave);
    }
    // Y lo que sí hay, sigue estando.
    expect(ld.name).toBe("Debutante");
    expect(ld.url).toBe(`${SITE_URL}/fighters/1`);
  });

  it("trata un apodo en blanco como si no existiera", () => {
    const ld = buildFighterJsonLd({ ...FIGHTER, nickname: "   " });

    expect(ld).not.toHaveProperty("alternateName");
    expect(ld.description).not.toContain("«");
  });

  it("publica el día natural aunque pg entregue un Date, no un string", () => {
    // Es lo que pasa DE VERDAD: birth_date es DATE sin castear en la query.
    const ld = buildFighterJsonLd({ ...FIGHTER, birthDate: new Date(1989, 9, 17) });

    expect(ld.birthDate).toBe("1989-10-17");
  });

  it("no manda a Google las entidades HTML del gimnasio ni del lugar de nacimiento", () => {
    const ld = buildFighterJsonLd({
      ...FIGHTER,
      trainsAt: "Team Alpha Male  (Urijah Faber&#039;s Ultimate Fitness)",
      birthPlace: "Ponte dell&amp;#039;Olio, Italy",
    });

    expect(ld.affiliation).toEqual({
      "@type": "SportsOrganization",
      name: "Team Alpha Male  (Urijah Faber's Ultimate Fitness)",
    });
    expect(ld.birthPlace).toEqual({ "@type": "Place", name: "Ponte dell'Olio, Italy" });
  });
});

describe("resolveEventStartDate", () => {
  it("ancla en los preliminares, no en el estelar", () => {
    // La velada empieza a las 14:00Z aunque la cartelera estelar sea a las 17:00Z.
    expect(resolveEventStartDate(EVENTO)).toBe("2026-08-01T14:00:00.000Z");
  });

  it("prefiere los preliminares tempranos cuando existen", () => {
    expect(
      resolveEventStartDate({ ...EVENTO, earlyPrelimsTime: "2026-08-01 11:30:00+00" }),
    ).toBe("2026-08-01T11:30:00.000Z");
  });

  it("normaliza el formato de Postgres, que no es ISO 8601 estricto", () => {
    // "2026-08-01 17:00:00+00": espacio en vez de T y offset sin minutos.
    expect(
      resolveEventStartDate({ ...EVENTO, prelimsTime: null, earlyPrelimsTime: null }),
    ).toBe("2026-08-01T17:00:00.000Z");
  });

  it("cae al día natural en eventos históricos sin ningún horario", () => {
    expect(
      resolveEventStartDate({
        ...EVENTO,
        startTime: null,
        prelimsTime: null,
        earlyPrelimsTime: null,
      }),
    ).toBe("2026-08-01");
  });

  it("devuelve null cuando no hay ni fecha", () => {
    expect(
      resolveEventStartDate({
        ...EVENTO,
        eventDate: null,
        startTime: null,
        prelimsTime: null,
        earlyPrelimsTime: null,
      }),
    ).toBeNull();
  });
});

describe("buildEventJsonLd", () => {
  it("marca el evento con fecha, sede y organizador", () => {
    const ld = buildEventJsonLd(EVENTO);

    expect(ld["@type"]).toBe("SportsEvent");
    expect(ld.startDate).toBe("2026-08-01T14:00:00.000Z");
    expect(ld.url).toBe(`${SITE_URL}/eventos/1063`);
    expect(ld.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(ld.location).toEqual({
      "@type": "Place",
      name: "UFC APEX, Las Vegas, Nevada, USA",
      address: "UFC APEX, Las Vegas, Nevada, USA",
    });
    expect(ld.organizer).toMatchObject({ name: "UFC" });
  });

  it("ata cada combate con su ficha y sus dos luchadores", () => {
    const subEvents = buildEventJsonLd(EVENTO).subEvent as Record<string, unknown>[];

    expect(subEvents).toHaveLength(2);
    expect(subEvents[0].name).toBe("Charles Oliveira vs Rival Uno");
    expect(subEvents[0].url).toBe(`${SITE_URL}/fights/14100`);
    // Google detecta entidades Event en TODOS los niveles: un subEvent sin fecha
    // ni sede se le presenta como un Event incompleto y lo reporta como error.
    expect(subEvents[0].startDate, "subEvent sin fecha").toBe("2026-08-01T14:00:00.000Z");
    expect(subEvents[0].location, "subEvent sin sede").toEqual({
      "@type": "Place",
      name: "UFC APEX, Las Vegas, Nevada, USA",
      address: "UFC APEX, Las Vegas, Nevada, USA",
    });
    expect(subEvents[0].competitor).toEqual([
      { "@type": "Person", name: "Charles Oliveira", url: `${SITE_URL}/fighters/6493` },
      { "@type": "Person", name: "Rival Uno", url: `${SITE_URL}/fighters/7001` },
    ]);
  });

  it("no inventa una URL para un rival TBD", () => {
    const subEvents = buildEventJsonLd(EVENTO).subEvent as Record<string, unknown>[];
    const competidores = subEvents[1].competitor as Record<string, unknown>[];

    expect(competidores[1]).toEqual({ "@type": "Person", name: "TBD" });
    expect(competidores[1]).not.toHaveProperty("url");
  });

  it("declara cancelado el evento cancelado", () => {
    expect(buildEventJsonLd({ ...EVENTO, status: "cancelled" }).eventStatus).toBe(
      "https://schema.org/EventCancelled",
    );
  });

  it("omite la sede cuando la BD no la tiene, en vez de emitir un Place vacío", () => {
    expect(buildEventJsonLd({ ...EVENTO, location: null })).not.toHaveProperty("location");
  });

  it("omite subEvent en un evento sin cartelera cargada", () => {
    expect(buildEventJsonLd({ ...EVENTO, bouts: [] })).not.toHaveProperty("subEvent");
  });
});
