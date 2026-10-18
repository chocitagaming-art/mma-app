import { unstable_cache } from "next/cache";

import { sql } from "@/lib/db";

export type HofWing = "modern" | "pioneer" | "contributor" | "fight";

export type HofInductee = {
  wing: HofWing;
  displayName: string;
  inducteeYear: number | null;
  // Orden dentro de su promoción (el del seed). Las pestañas ordenan por
  // inducteeYear DESC y luego por esto (lib/hall-of-fame-display.ts).
  sortOrder: number;
  subtitle: string | null;
  // Foto curada del seed: la de ufc.com (retrato oficial del Salón) para los que
  // no tienen otra, /fighters/… para Forrest Griffin… NULL = la de su ficha.
  // bio: prosa para el panel expandible (columna de la migración 014).
  photoUrl: string | null;
  bio: string | null;
  // Punto de la cara ('68% 22%') para encuadrar en el marco las fotos 16:9 de
  // ufc.com (migración 031; NULL antes de migrar).
  photoFocus: string | null;
  // La pelea completa en YouTube (Ala de Combate, migración 031). Sin validar:
  // la web lo valida antes de incrustar (lib/hall-of-fame-display.ts fightClip).
  videoId: string | null;
  videoStart: number | null;
  videoEnd: number | null;
  // Lo que midió mma-ingesta (src/scrapers/measure_photo_cutout.py, tabla
  // photo_cutout, migración 031) de la foto que la base da para la persona:
  // la URL EXACTA medida y si es un recorte con fondo transparente. NULL = sin
  // medir (o sin la tabla): la tarjeta va enmarcada, que es lo seguro.
  photoMeasuredUrl: string | null;
  photoIsCutout: boolean | null;
  // Persona (modern/pioneer/contributor): enlace a su ficha si la tenemos.
  fighterId: number | null;
  headshotUrl: string | null;
  nationality: string | null;
  // Fight Wing: las dos esquinas, con la medida de su headshot.
  cornerAId: number | null;
  cornerAName: string | null;
  cornerAHeadshot: string | null;
  cornerAMeasuredUrl: string | null;
  cornerACutout: boolean | null;
  cornerBId: number | null;
  cornerBName: string | null;
  cornerBHeadshot: string | null;
  cornerBMeasuredUrl: string | null;
  cornerBCutout: boolean | null;
};

export type HallOfFameData = Record<HofWing, HofInductee[]>;

type Row = {
  wing: string;
  display_name: string;
  inductee_year: number | null;
  sort_order: number | null;
  subtitle: string | null;
  photo_url: string | null;
  bio: string | null;
  photo_focus: string | null;
  video_id: string | null;
  video_start: number | null;
  video_end: number | null;
  photo_measured_url: string | null;
  photo_is_cutout: boolean | null;
  fighter_id: number | null;
  headshot_url: string | null;
  nationality: string | null;
  corner_a_id: number | null;
  corner_a_name: string | null;
  corner_a_headshot: string | null;
  corner_a_measured_url: string | null;
  corner_a_cutout: boolean | null;
  corner_b_id: number | null;
  corner_b_name: string | null;
  corner_b_headshot: string | null;
  corner_b_measured_url: string | null;
  corner_b_cutout: boolean | null;
};

function emptyData(): HallOfFameData {
  return { modern: [], pioneer: [], contributor: [], fight: [] };
}

// Qué partes del esquema se piden. El Salón tiene que servirse ANTES y DESPUÉS
// de cada migración, sin duplicar SQL: lo que aún no existe se pide como NULL.
//   · bio: migración 014.
//   · salon: video_id, video_start, video_end y photo_focus (migración 031).
//   · cutout: la tabla photo_cutout (también la 031, pero con su propio GRANT a
//     mma_app_readonly: sin él la tabla existe y no se puede leer).
export type HallOfFameSchema = { bio: boolean; salon: boolean; cutout: boolean };

// De más a menos. Cada escalón quita UNA cosa, y la bio va la última: que un
// fallo de lo nuevo nunca deje el Salón sin biografías.
export const SCHEMA_LADDER: readonly HallOfFameSchema[] = [
  { bio: true, salon: true, cutout: true },
  { bio: true, salon: true, cutout: false },
  { bio: true, salon: false, cutout: false },
  { bio: false, salon: false, cutout: false },
];

export function hallOfFameQuery({ bio, salon, cutout }: HallOfFameSchema): string {
  const salonCols = salon
    ? "h.photo_focus, h.video_id, h.video_start, h.video_end"
    : "NULL::text AS photo_focus, NULL::text AS video_id, NULL::int AS video_start, NULL::int AS video_end";
  // 🪤 El cruce va por la URL EXACTA que guarda la base (643 headshot_url llevan
  // '&amp;' literal, y el navegador pide esa cadena): nada de normalizarla.
  const cutoutCols = cutout
    ? `pc.url AS photo_measured_url, pc.is_cutout AS photo_is_cutout,
              pca.url AS corner_a_measured_url, pca.is_cutout AS corner_a_cutout,
              pcb.url AS corner_b_measured_url, pcb.is_cutout AS corner_b_cutout`
    : `NULL::text AS photo_measured_url, NULL::boolean AS photo_is_cutout,
              NULL::text AS corner_a_measured_url, NULL::boolean AS corner_a_cutout,
              NULL::text AS corner_b_measured_url, NULL::boolean AS corner_b_cutout`;
  const cutoutJoins = cutout
    ? `
       LEFT JOIN photo_cutout pc  ON pc.url  = COALESCE(h.photo_url, f.headshot_url)
       LEFT JOIN photo_cutout pca ON pca.url = fa.headshot_url
       LEFT JOIN photo_cutout pcb ON pcb.url = fb.headshot_url`
    : "";
  return `SELECT h.wing, h.display_name, h.inductee_year, h.subtitle, h.sort_order,
              h.photo_url, ${bio ? "h.bio" : "NULL::text"} AS bio,
              ${salonCols},
              ${cutoutCols},
              h.fighter_id, f.headshot_url, f.nationality,
              h.fighter_a_id AS corner_a_id, fa.name AS corner_a_name, fa.headshot_url AS corner_a_headshot,
              h.fighter_b_id AS corner_b_id, fb.name AS corner_b_name, fb.headshot_url AS corner_b_headshot
       FROM hall_of_fame h
       LEFT JOIN fighters f  ON f.id  = h.fighter_id
       LEFT JOIN fighters fa ON fa.id = h.fighter_a_id
       LEFT JOIN fighters fb ON fb.id = h.fighter_b_id${cutoutJoins}
       ORDER BY h.wing, h.inductee_year DESC NULLS LAST, h.sort_order`;
}

// Errores de ESQUEMA de Postgres: columna inexistente, tabla inexistente, sin
// permiso de lectura. Son los únicos que bajan un escalón. Cualquier otro (Neon
// caído, un timeout) se relanza: getHallOfFame lo degrada a vacío SIN cachearlo,
// en vez de cachear un día entero un Salón sin vídeos por un fallo pasajero.
const SCHEMA_ERRORS = new Set(["42703", "42P01", "42501"]);

export function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && SCHEMA_ERRORS.has(code);
}

function toInductee(row: Row, wing: HofWing): HofInductee {
  return {
    wing,
    displayName: row.display_name,
    inducteeYear: row.inductee_year,
    sortOrder: row.sort_order ?? 0,
    subtitle: row.subtitle,
    photoUrl: row.photo_url,
    bio: row.bio,
    photoFocus: row.photo_focus,
    videoId: row.video_id,
    videoStart: row.video_start,
    videoEnd: row.video_end,
    photoMeasuredUrl: row.photo_measured_url,
    photoIsCutout: row.photo_is_cutout,
    fighterId: row.fighter_id,
    headshotUrl: row.headshot_url,
    nationality: row.nationality,
    cornerAId: row.corner_a_id,
    cornerAName: row.corner_a_name,
    cornerAHeadshot: row.corner_a_headshot,
    cornerAMeasuredUrl: row.corner_a_measured_url,
    cornerACutout: row.corner_a_cutout,
    cornerBId: row.corner_b_id,
    cornerBName: row.corner_b_name,
    cornerBHeadshot: row.corner_b_headshot,
    cornerBMeasuredUrl: row.corner_b_measured_url,
    cornerBCutout: row.corner_b_cutout,
  };
}

async function getHallOfFameUncached(): Promise<HallOfFameData> {
  let rows: Row[] | null = null;
  // La escalera es un fallback de ESQUEMA, no de errores: va DENTRO de la caché.
  // El try/catch de "tabla no migrada / Neon caído" va FUERA (en getHallOfFame)
  // para no cachear un fallo transitorio.
  for (const [index, schema] of SCHEMA_LADDER.entries()) {
    try {
      rows = await sql<Row>(hallOfFameQuery(schema));
      break;
    } catch (error) {
      if (!isSchemaError(error) || index === SCHEMA_LADDER.length - 1) throw error;
      // Bajar un escalón deja el Salón sin vídeos o sin relieve DURANTE UN DÍA
      // (va dentro de la caché): que quede en el log de Vercel por qué. Un
      // 42501 aquí es un GRANT olvidado, no una migración pendiente.
      const code = (error as { code?: string }).code;
      console.warn(
        `getHallOfFame: escalón ${index} (${JSON.stringify(schema)}) rechazado por el esquema (${code}); se sirve el siguiente:`,
        (error as { message?: string }).message,
      );
    }
  }

  const data = emptyData();
  for (const row of rows ?? []) {
    const wing = row.wing as HofWing;
    if (!data[wing]) continue;
    data[wing].push(toInductee(row, wing));
  }
  return data;
}

// Cacheada 1 día (la ventana del ISR anterior de /salon-de-la-fama), con la
// etiqueta 'hall-of-fame', que /api/revalidate también invalida. El try/catch de
// "tabla no migrada" va FUERA de unstable_cache: un fallo de Neon se degrada a
// vacío SIN cachear el fallo (no queremos el Salón vacío un día entero por un
// error transitorio).
const getHallOfFameCached = unstable_cache(getHallOfFameUncached, ["hall-of-fame-v2"], {
  revalidate: 86400,
  tags: ["hall-of-fame"],
});

export async function getHallOfFame(): Promise<HallOfFameData> {
  try {
    return await getHallOfFameCached();
  } catch (error) {
    // La tabla hall_of_fame puede no estar migrada todavía: degradamos a vacío
    // en vez de romper la página.
    console.error("getHallOfFame: la tabla hall_of_fame aún no está lista:", error);
    return emptyData();
  }
}
