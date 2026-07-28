// Datos estructurados (JSON-LD, schema.org) para las rutas dinámicas.
//
// POR QUÉ EXISTE: el sitemap mete 3.640 páginas en Google, pero ninguna le
// explica QUÉ está mirando. Un `<h1>` con un nombre no le dice que eso es una
// persona que compite en MMA, ni que un evento tiene fecha, sede y doce
// combates dentro. Esto sí.
//
// NO LLEVA NONCE, Y NO ES UN DESCUIDO. Está escrito en tres documentos del
// proyecto que la CSP (`script-src` con nonce y sin 'unsafe-inline') bloquea
// estos bloques. Se comprobó el 28-jul-2026 con la CSP EXACTA de producción y
// Chromium 149: un `<script>` de JavaScript sin nonce se bloquea, y el
// `<script type="application/ld+json">` de al lado NO genera ni una violación.
// El motivo es que un ld+json es un BLOQUE DE DATOS: el navegador no lo ejecuta
// nunca, así que `script-src` no tiene nada que bloquear. La guía de esta
// versión de Next (node_modules/next/dist/docs/.../json-ld.md) enseña el
// ejemplo sin nonce por lo mismo. Añadirlo sería peor que inútil: en las
// peticiones de prefetch el proxy no corre y la cabecera `x-nonce` no existe.
//
// Módulo puro (sin Next ni DOM) para poder testearlo con vitest, igual que
// security-headers.ts.

import { parseEventTimestamp } from "@/lib/event-time";
import { decodeHtmlEntitiesOrNull } from "@/lib/html-entities";
import { SITE_URL } from "@/lib/site-url";

/** Convierte una ruta interna en la URL absoluta que exige schema.org. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// Texto listo para publicar: decodificado y sin espacios sobrantes, o null.
//
// El mapper (fighters.mappers.ts) YA decodifica `trains_at` y `birth_place`, que
// son los dos únicos campos sucios medidos. Aquí se vuelve a pasar todo lo que
// viaja a Google — nombres, apodos, sedes, titulares — porque es idempotente y
// porque esta es la última puerta antes de publicar: si mañana un scraper
// ensucia un campo nuevo, no acaba en los datos estructurados por el camino.
const texto = decodeHtmlEntitiesOrNull;

/**
 * Fecha de calendario en `YYYY-MM-DD`, venga como venga de la base de datos.
 *
 * ESTO ARREGLA UN BUG REAL, NO ES DEFENSA PREVENTIVA. `fighters.birth_date` es
 * una columna DATE y `getFighterDetail` la trae con `select f.*` sin castear a
 * texto, así que **node-postgres devuelve un objeto Date**, no un string, por
 * mucho que el tipo `Fighter` diga `string | null`. Ese Date se construye a
 * MEDIANOCHE LOCAL, de modo que `toISOString()` lo corre al día anterior en
 * cualquier huso al este de Greenwich: Charles Oliveira (17-oct-1989) se
 * publicaba como `1989-10-16T23:00:00.000Z`. Habríamos mandado a Google la
 * fecha de nacimiento equivocada de 1.515 personas reales.
 *
 * Por eso se leen los componentes LOCALES del Date (no los UTC): son los que
 * reconstruyen el día natural que guardó Postgres.
 */
export function toIsoDateOnly(value: string | Date | null | undefined): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const año = String(value.getFullYear()).padStart(4, "0");
    const mes = String(value.getMonth() + 1).padStart(2, "0");
    const dia = String(value.getDate()).padStart(2, "0");
    return `${año}-${mes}-${dia}`;
  }

  const recortado = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(recortado) ? recortado : null;
}

// schema.org ignora las propiedades ausentes, pero un `"image": null` es peor
// que no ponerlo: los validadores lo marcan como valor inválido. Se quitan las
// claves vacías antes de serializar.
type JsonLdValue = unknown;

function compact(entries: Record<string, JsonLdValue>): Record<string, JsonLdValue> {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string" && value.trim() === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

/**
 * Serializa el objeto para meterlo dentro de un `<script>`.
 *
 * El escape de `<` NO es cosmético: el nombre de un luchador o el titular de un
 * evento salen de scrapers, y un `</script>` dentro de una cadena cerraría la
 * etiqueta antes de tiempo y convertiría el resto del JSON en HTML ejecutable.
 * Con `<` el JSON sigue siendo idéntico al parsearlo y la etiqueta no se
 * puede cerrar desde dentro.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// ---------------------------------------------------------------------------
// Persona (ficha de luchador)
// ---------------------------------------------------------------------------

export type FighterJsonLdInput = {
  id: number;
  name: string;
  nickname?: string | null;
  headshotUrl?: string | null;
  nationality?: string | null;
  // `Date` no sobra: el tipo `Fighter` la declara string, pero la columna es
  // DATE sin castear y node-postgres entrega un Date. Ver toIsoDateOnly.
  birthDate?: string | Date | null;
  birthPlace?: string | null;
  heightCm?: number | null;
  trainsAt?: string | null;
  wins: number;
  losses: number;
  draws: number;
};

/**
 * `Person` para `/fighters/[id]`.
 *
 * AVISO HONESTO SOBRE LO QUE ESTO DA: Google NO tiene resultado enriquecido
 * para personas, así que esto no va a pintar una tarjeta en la página de
 * resultados. Sirve para que los buscadores (y los modelos que leen la web)
 * entiendan la ficha como una ENTIDAD con récord, nacionalidad y equipo, en vez
 * de como un montón de texto. `Athlete` no existe en schema.org: el tipo
 * correcto es `Person`.
 */
export function buildFighterJsonLd(fighter: FighterJsonLdInput): Record<string, JsonLdValue> {
  const nombre = texto(fighter.name) ?? fighter.name;
  const nickname = texto(fighter.nickname);
  const birthPlace = texto(fighter.birthPlace);
  const nationality = texto(fighter.nationality);
  const trainsAt = texto(fighter.trainsAt);

  return compact({
    "@context": "https://schema.org",
    "@type": "Person",
    name: nombre,
    alternateName: nickname,
    // La URL canónica se construye con el id NUMÉRICO, nunca con el texto de la
    // ruta: /fighters/06493 y /fighters/6493 sirven la misma ficha con un 200,
    // y sin esto Google vería dos páginas idénticas compitiendo entre sí.
    url: absoluteUrl(`/fighters/${fighter.id}`),
    image: fighter.headshotUrl,
    jobTitle: "Peleador de artes marciales mixtas",
    description: `${nombre}${nickname ? ` «${nickname}»` : ""}, peleador de MMA. Récord ${fighter.wins}-${fighter.losses}-${fighter.draws}.`,
    // Día natural, nunca el instante: publicar `1989-10-16T23:00:00.000Z` sería
    // decirle a Google que Oliveira nació el 16 de octubre. Ver toIsoDateOnly.
    birthDate: toIsoDateOnly(fighter.birthDate),
    birthPlace: birthPlace ? { "@type": "Place", name: birthPlace } : null,
    nationality: nationality ? { "@type": "Country", name: nationality } : null,
    // unitCode CMT = centímetros en el vocabulario UN/CEFACT que usa schema.org.
    height: fighter.heightCm
      ? { "@type": "QuantitativeValue", value: fighter.heightCm, unitCode: "CMT" }
      : null,
    // El gimnasio es la organización deportiva a la que pertenece, no un equipo.
    affiliation: trainsAt ? { "@type": "SportsOrganization", name: trainsAt } : null,
  });
}

// ---------------------------------------------------------------------------
// Evento deportivo (ficha de evento)
// ---------------------------------------------------------------------------

export type EventBoutJsonLdInput = {
  fightId: number;
  red: { id: number | null; name: string };
  blue: { id: number | null; name: string };
};

export type EventJsonLdInput = {
  id: number;
  name: string;
  eventDate?: string | null;
  location?: string | null;
  status?: string | null;
  startTime?: string | null;
  prelimsTime?: string | null;
  earlyPrelimsTime?: string | null;
  imageUrl?: string | null;
  tagline?: string | null;
  bouts: EventBoutJsonLdInput[];
};

/**
 * Cuándo empieza la velada DE VERDAD, en ISO 8601.
 *
 * No es `startTime`: esa columna es la cartelera estelar, y una velada arranca
 * horas antes con los preliminares. Es el mismo criterio que usa el centinela
 * del directo en mma-ingesta. Si no hay ningún timestamptz (eventos históricos
 * que el scraper nunca enriqueció) cae al día natural, que es ISO 8601 válido.
 */
export function resolveEventStartDate(event: EventJsonLdInput): string | null {
  const candidates = [event.earlyPrelimsTime, event.prelimsTime, event.startTime]
    .map((value) => parseEventTimestamp(value ?? null))
    .filter((date): date is Date => date != null);

  if (candidates.length > 0) {
    // Estos SÍ van como instante con offset: `start_time` es timestamptz y la
    // hora del día importa. La ambigüedad que hay que evitar es la del día
    // natural (birth_date), no la de un instante con Z explícita.
    return candidates.reduce((min, date) => (date < min ? date : min)).toISOString();
  }

  // Los eventos históricos que el scraper nunca enriqueció solo tienen el día.
  return toIsoDateOnly(event.eventDate);
}

/**
 * `SportsEvent` para `/eventos/[id]`.
 *
 * Este SÍ es elegible para resultado enriquecido en Google (tipo Event), que lo
 * pide con nombre, fecha de inicio y sede. De los tres marcados de la fase, es
 * el único que puede cambiar cómo se ve la web en los resultados.
 *
 * Los combates van como `subEvent` con sus dos `competitor`: es lo que ata la
 * página del evento con las fichas de luchador y de combate, y la razón de que
 * marcar el evento valga más que marcar las 8.800 peleas por separado.
 */
export function buildEventJsonLd(event: EventJsonLdInput): Record<string, JsonLdValue> {
  const startDate = resolveEventStartDate(event);
  const isCancelled = event.status === "cancelled";
  const nombre = texto(event.name) ?? event.name;
  const sede = texto(event.location);

  // `location` es obligatorio para el resultado enriquecido de Google. La BD
  // guarda la sede como texto libre ("T-Mobile Arena, Las Vegas, Nevada, USA");
  // schema.org acepta `address` como texto, así que no hay que trocearlo.
  const lugar = sede ? { "@type": "Place", name: sede, address: sede } : null;

  // Cada combate hereda fecha y sede del evento. NO es relleno: Google detecta
  // entidades Event en TODOS los niveles de la jerarquía, no solo en la raíz
  // (anuncio de Search Console del 10-may-2021), así que un `subEvent` sin
  // `startDate` ni `location` se le presenta como un Event incompleto y lo
  // reporta como error. Y es cierto además: todos los combates de una velada se
  // disputan el mismo día y en el mismo recinto. La hora exacta de cada uno no
  // existe en la BD, así que se hereda la del evento en vez de inventarla.
  const subEvents = event.bouts.map((bout) =>
    compact({
      "@type": "SportsEvent",
      name: `${texto(bout.red.name) ?? bout.red.name} vs ${texto(bout.blue.name) ?? bout.blue.name}`,
      url: absoluteUrl(`/fights/${bout.fightId}`),
      sport: "Mixed Martial Arts",
      startDate,
      location: lugar,
      competitor: [bout.red, bout.blue].map((corner) =>
        compact({
          "@type": "Person",
          name: texto(corner.name) ?? corner.name,
          // TBD: los combates futuros pueden no tener rival asignado todavía.
          url: corner.id != null ? absoluteUrl(`/fighters/${corner.id}`) : null,
        }),
      ),
    }),
  );

  return compact({
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: nombre,
    url: absoluteUrl(`/eventos/${event.id}`),
    sport: "Mixed Martial Arts",
    startDate,
    eventStatus: isCancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: lugar,
    image: event.imageUrl,
    description: texto(event.tagline),
    organizer: { "@type": "Organization", name: "UFC", url: "https://www.ufc.com" },
    subEvent: subEvents,
  });
}
