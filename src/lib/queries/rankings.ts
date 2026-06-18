import { sql } from "@/lib/db";
import type { DivisionRanking, RankingEntry, RankingsResult } from "@/lib/types";

type RankingRow = {
  division: string;
  rank_position: number;
  is_champion: boolean;
  rank_change: number | null;
  fighter_name: string | null;
  fighter_id: number | null;
  snapshot_date: string | null;
  headshot_url: string | null;
  nationality: string | null;
  nickname: string | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
};

// Orden canónico de divisiones + etiqueta en español.
// Los slugs DEBEN coincidir con los que escribe el backend (ver RANKINGS_BACKEND_HANDOFF.md §2).
const DIVISION_ORDER: { slug: string; label: string }[] = [
  { slug: "mens_pound_for_pound", label: "Libra por libra" },
  { slug: "flyweight", label: "Peso Mosca" },
  { slug: "bantamweight", label: "Peso Gallo" },
  { slug: "featherweight", label: "Peso Pluma" },
  { slug: "lightweight", label: "Peso Ligero" },
  { slug: "welterweight", label: "Peso Wélter" },
  { slug: "middleweight", label: "Peso Medio" },
  { slug: "light_heavyweight", label: "Peso Semipesado" },
  { slug: "heavyweight", label: "Peso Pesado" },
  { slug: "womens_pound_for_pound", label: "Libra por libra (F)" },
  { slug: "womens_strawweight", label: "Peso Paja (F)" },
  { slug: "womens_flyweight", label: "Peso Mosca (F)" },
  { slug: "womens_bantamweight", label: "Peso Gallo (F)" },
  { slug: "womens_featherweight", label: "Peso Pluma (F)" },
];

function toEntry(row: RankingRow): RankingEntry {
  return {
    rankPosition: row.rank_position,
    isChampion: row.is_champion,
    rankChange: row.rank_change,
    fighterId: row.fighter_id,
    fighterName: row.fighter_name ?? "—",
    headshotUrl: row.headshot_url,
    nationality: row.nationality,
    nickname: row.nickname,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
  };
}

function buildDivision(slug: string, label: string, rows: RankingRow[]): DivisionRanking {
  const champion = rows.find((row) => row.is_champion) ?? null;
  const ranked = rows
    .filter((row) => !row.is_champion)
    .sort((a, b) => a.rank_position - b.rank_position)
    .map(toEntry);

  return {
    division: slug,
    label,
    champion: champion ? toEntry(champion) : null,
    ranked,
  };
}

export async function getRankings(): Promise<RankingsResult> {
  let rows: RankingRow[];

  try {
    rows = await sql<RankingRow>(
      `WITH latest AS (SELECT MAX(snapshot_date) AS d FROM rankings)
       SELECT r.division,
              r.rank_position,
              r.is_champion,
              r.rank_change,
              r.fighter_name,
              r.fighter_id,
              r.snapshot_date::text AS snapshot_date,
              f.headshot_url,
              f.nationality,
              f.nickname,
              f.wins,
              f.losses,
              f.draws
       FROM rankings r
       LEFT JOIN fighters f ON f.id = r.fighter_id
       WHERE r.snapshot_date = (SELECT d FROM latest)
       ORDER BY r.division, r.is_champion DESC, r.rank_position`,
    );
  } catch (error) {
    // La tabla `rankings` puede no estar migrada/poblada todavía (backend en curso).
    // Degradamos a vacío en vez de romper la página.
    console.error("getRankings: la tabla rankings aún no está lista:", error);
    return { snapshotDate: null, divisions: [] };
  }

  if (rows.length === 0) {
    return { snapshotDate: null, divisions: [] };
  }

  const snapshotDate = rows[0]?.snapshot_date ?? null;

  const byDivision = new Map<string, RankingRow[]>();
  for (const row of rows) {
    const list = byDivision.get(row.division) ?? [];
    list.push(row);
    byDivision.set(row.division, list);
  }

  const divisions: DivisionRanking[] = [];

  // Divisiones conocidas, en orden canónico.
  for (const { slug, label } of DIVISION_ORDER) {
    const list = byDivision.get(slug);
    if (!list) continue;
    divisions.push(buildDivision(slug, label, list));
    byDivision.delete(slug);
  }

  // Cualquier división extra que el backend añadiera y no tengamos mapeada (fallback: slug crudo).
  for (const [slug, list] of byDivision) {
    divisions.push(buildDivision(slug, slug, list));
  }

  return { snapshotDate, divisions };
}
