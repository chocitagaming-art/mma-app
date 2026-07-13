import { unstable_cache } from "next/cache";

import { sql } from "@/lib/db";

export type HofWing = "modern" | "pioneer" | "contributor" | "fight";

export type HofInductee = {
  wing: HofWing;
  displayName: string;
  inducteeYear: number | null;
  subtitle: string | null;
  // Foto curada hospedada en la app (/hof/…) para contributor/fight; NULL hasta
  // que el seed la puebla. bio: prosa para el panel expandible (columna nueva de
  // la migración 014; NULL o ausente antes de migrar).
  photoUrl: string | null;
  bio: string | null;
  // Persona (modern/pioneer/contributor): enlace a su ficha si la tenemos.
  fighterId: number | null;
  headshotUrl: string | null;
  nationality: string | null;
  // Fight Wing: las dos esquinas.
  cornerAId: number | null;
  cornerAName: string | null;
  cornerAHeadshot: string | null;
  cornerBId: number | null;
  cornerBName: string | null;
  cornerBHeadshot: string | null;
};

export type HallOfFameData = Record<HofWing, HofInductee[]>;

type Row = {
  wing: string;
  display_name: string;
  inductee_year: number | null;
  subtitle: string | null;
  photo_url: string | null;
  bio: string | null;
  fighter_id: number | null;
  headshot_url: string | null;
  nationality: string | null;
  corner_a_id: number | null;
  corner_a_name: string | null;
  corner_a_headshot: string | null;
  corner_b_id: number | null;
  corner_b_name: string | null;
  corner_b_headshot: string | null;
};

function emptyData(): HallOfFameData {
  return { modern: [], pioneer: [], contributor: [], fight: [] };
}

// Query base parametrizada por cómo se selecciona `bio`: con la columna real o
// con NULL cuando aún no existe (migración 014 pendiente). Así el mismo SELECT
// sirve antes y después de migrar sin duplicar SQL.
function hallOfFameQuery(bioExpr: string): string {
  return `SELECT h.wing, h.display_name, h.inductee_year, h.subtitle, h.sort_order,
              h.photo_url, ${bioExpr} AS bio,
              h.fighter_id, f.headshot_url, f.nationality,
              h.fighter_a_id AS corner_a_id, fa.name AS corner_a_name, fa.headshot_url AS corner_a_headshot,
              h.fighter_b_id AS corner_b_id, fb.name AS corner_b_name, fb.headshot_url AS corner_b_headshot
       FROM hall_of_fame h
       LEFT JOIN fighters f  ON f.id  = h.fighter_id
       LEFT JOIN fighters fa ON fa.id = h.fighter_a_id
       LEFT JOIN fighters fb ON fb.id = h.fighter_b_id
       ORDER BY h.wing, h.sort_order`;
}

async function getHallOfFameUncached(): Promise<HallOfFameData> {
  let rows: Row[];
  // El try/catch interno (columna bio ausente, migración 014) es un fallback de
  // ESQUEMA, no un error: va DENTRO de la caché. El try/catch de "tabla no migrada"
  // va FUERA (en getHallOfFame) para no cachear un fallo transitorio de Neon.
  try {
    rows = await sql<Row>(hallOfFameQuery("h.bio"));
  } catch {
    // La columna bio puede no existir todavía (migración 014 pendiente):
    // reintenta con bio=NULL para no dejar el Salón en blanco.
    rows = await sql<Row>(hallOfFameQuery("NULL::text"));
  }

  const data = emptyData();
  for (const row of rows) {
    const wing = row.wing as HofWing;
    if (!data[wing]) continue;
    data[wing].push({
      wing,
      displayName: row.display_name,
      inducteeYear: row.inductee_year,
      subtitle: row.subtitle,
      photoUrl: row.photo_url,
      bio: row.bio,
      fighterId: row.fighter_id,
      headshotUrl: row.headshot_url,
      nationality: row.nationality,
      cornerAId: row.corner_a_id,
      cornerAName: row.corner_a_name,
      cornerAHeadshot: row.corner_a_headshot,
      cornerBId: row.corner_b_id,
      cornerBName: row.corner_b_name,
      cornerBHeadshot: row.corner_b_headshot,
    });
  }
  return data;
}

// Cacheada 1 día (la ventana del ISR anterior de /salon-de-la-fama). El try/catch de
// "tabla no migrada" va FUERA de unstable_cache: un fallo de Neon se degrada a vacío
// SIN cachear el fallo (no queremos el Salón vacío un día entero por un error transitorio).
const getHallOfFameCached = unstable_cache(getHallOfFameUncached, ["hall-of-fame"], {
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
