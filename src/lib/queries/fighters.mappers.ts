import type {
  FighterAggregateStats,
  FighterComparisonAverages,
  FighterCardData,
  FighterDefenseStats,
  FighterQaItem,
  FighterStrikeBreakdown,
  FighterWinMethods,
  StrikeZoneStat,
  NewsArticle,
} from "@/lib/types";
import { decodeHtmlEntitiesOrNull } from "@/lib/html-entities";
import type {
  AggregateRow,
  DefenseRow,
  FighterRow,
  NewsRow,
  StrikeBreakdownRow,
  WinMethodRow,
} from "./fighters.types";

export function mapFighter(row: FighterRow): FighterCardData {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    headshotUrl: row.headshot_url,
    nationality: row.nationality,
    birthDate: row.birth_date,
    heightCm: row.height_cm ? Number(row.height_cm) : null,
    reachCm: row.reach_cm ? Number(row.reach_cm) : null,
    stance: row.stance,
    weightGrams: row.weight_grams,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    updatedAt: row.updated_at,
    fullBodyUrl: row.full_body_url ?? null,
    standingBodyUrl: row.standing_body_url ?? null,
    standingBodyUrlL: row.standing_body_url_l ?? null,
    standingBodyUrlR: row.standing_body_url_r ?? null,
    legReachCm: row.leg_reach_cm ? Number(row.leg_reach_cm) : null,
    // Estas dos columnas llegan del scraper con entidades HTML sin resolver, y
    // se veían tal cual en la ficha: "Bronx&#039;s Gold Team". Son 54 de las
    // 1.127 filas con gimnasio y 2 de las 1.515 con lugar de nacimiento, una
    // doblemente codificada. El resto de columnas de texto están limpias.
    trainsAt: decodeHtmlEntitiesOrNull(row.trains_at),
    source: row.source ?? null,
    sourceId: row.source_id ?? null,
    birthPlace: decodeHtmlEntitiesOrNull(row.birth_place),
    octagonDebut: row.octagon_debut ?? null,
    fightCount: Number(row.fight_count ?? 0),
    latestWeightClass: row.latest_weight_class ?? null,
    winsByKo: row.wins_by_ko ?? null,
    winsBySubmission: row.wins_by_submission ?? null,
    firstRoundFinishes: row.first_round_finishes ?? null,
  };
}

// S2-E: las columnas JSONB llegan ya parseadas por pg, pero la forma se valida
// aquí de forma defensiva (una fila corrupta degrada a sección ausente, nunca
// rompe la ficha).
export function mapFighterFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

export function mapFighterQa(value: unknown): FighterQaItem[] {
  if (!Array.isArray(value)) return [];
  const items: FighterQaItem[] = [];
  for (const raw of value) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const { q, a } = raw as Record<string, unknown>;
      if (typeof q === "string" && typeof a === "string" && q.trim() && a.trim()) {
        items.push({ q, a });
      }
    }
  }
  return items;
}

export function mapAggregate(row?: AggregateRow): FighterAggregateStats {
  const sigStrikesLanded = Number(row?.sig_strikes_landed ?? 0);
  const sigStrikesAttempted = Number(row?.sig_strikes_attempted ?? 0);
  const takedownsLanded = Number(row?.takedowns_landed ?? 0);
  const takedownsAttempted = Number(row?.takedowns_attempted ?? 0);

  return {
    sigStrikesLanded,
    sigStrikesAttempted,
    sigStrikeAccuracy:
      sigStrikesAttempted > 0 ? sigStrikesLanded / sigStrikesAttempted : 0,
    takedownsLanded,
    takedownsAttempted,
    takedownAccuracy:
      takedownsAttempted > 0 ? takedownsLanded / takedownsAttempted : 0,
    submissionAttempts: Number(row?.submission_attempts ?? 0),
    controlTimeSeconds: Number(row?.control_time_seconds ?? 0),
    knockdowns: Number(row?.knockdowns ?? 0),
    totalFightStats: Number(row?.total_fight_stats ?? 0),
  };
}

export function mapComparisonAggregate(row?: AggregateRow): FighterComparisonAverages {
  const totals = mapAggregate(row);
  const fightCount = Math.max(1, totals.totalFightStats);

  return {
    sigStrikesLandedPerFight: totals.sigStrikesLanded / fightCount,
    sigStrikeAccuracy: totals.sigStrikeAccuracy,
    knockdownsPerFight: totals.knockdowns / fightCount,
    takedownsLandedPerFight: totals.takedownsLanded / fightCount,
    takedownAccuracy: totals.takedownAccuracy,
    submissionAttemptsPerFight: totals.submissionAttempts / fightCount,
    controlTimePerFightSeconds: totals.controlTimeSeconds / fightCount,
    totalFightStats: totals.totalFightStats,
  };
}

export function mapDefense(row?: DefenseRow): FighterDefenseStats {
  const oppSigLanded = Number(row?.opp_sig_strikes_landed ?? 0);
  const oppSigAtt = Number(row?.opp_sig_strikes_attempted ?? 0);
  const oppTdLanded = Number(row?.opp_takedowns_landed ?? 0);
  const oppTdAtt = Number(row?.opp_takedowns_attempted ?? 0);

  return {
    // Sin intentos del rival no hay defensa que medir: null, NO cero. Un cero
    // aquí es un dato (encajó todos los que le tiraron) y se publica.
    strikingDefense: oppSigAtt > 0 ? 1 - oppSigLanded / oppSigAtt : null,
    takedownDefense: oppTdAtt > 0 ? 1 - oppTdLanded / oppTdAtt : null,
    oppSigStrikesLanded: oppSigLanded,
    oppSigStrikesAttempted: oppSigAtt,
    oppTakedownsLanded: oppTdLanded,
    oppTakedownsAttempted: oppTdAtt,
  };
}

/**
 * Cuota de control: la fracción del combate que el luchador pasó controlando.
 *
 * 🪤 El numerador y el denominador TIENEN que salir de la misma muestra. La
 * suma global de `control_time_seconds` no lleva el filtro de era (el dato no
 * existe antes de 1999-07-16) ni el de duración calculable, y el único
 * denominador del repo sí los lleva. Cruzarlos, medido contra Neon el
 * 9-ago-2026, da 3 fichas por encima del 100 % —la peor al 363,1 %— y 312 con
 * denominador cero. Con los dos de la muestra cronometrada: ninguna pasa del
 * 100 % y el máximo real es 89,7 %.
 *
 * Misma definición que `ctrl_share` en skill-radar.ts, que alimenta el eje de
 * agarre del radar. Si divergen, la app enseñará dos cuotas de control que no
 * cuadran entre sí.
 *
 * 🪤 Y por eso hace falta `controlOverall`: el tile de la ficha enseña el
 * control TOTAL del luchador, pero la cuota solo puede salir de las peleas
 * cronometradas. Cuando la muestra no cubre todo ese control, el porcentaje NO
 * corresponde al tiempo escrito encima — 74 fichas el 9-ago-2026, 20 de ellas
 * con más de un 10 % de desvío. Ahí no se aproxima: no se publica. Recortar el
 * tile a la muestra tampoco vale, porque borraría control real de 46 fichas
 * (31 de ellas más de un minuto).
 *
 * @param controlSeconds control DENTRO de la muestra cronometrada (numerador).
 * @param totalSeconds duración de esa misma muestra (denominador).
 * @param controlOverall control total del luchador, para comprobar que la
 *   muestra lo cubre entero.
 * @returns null cuando no hay combate que repartir, cuando el dato es imposible
 * (más control que combate), o cuando la muestra no cubre todo el control.
 */
export function computeControlShare(
  controlSeconds: number,
  totalSeconds: number,
  controlOverall: number,
): number | null {
  if (!(totalSeconds > 0)) {
    return null;
  }
  if (controlSeconds !== controlOverall) {
    return null;
  }

  const share = controlSeconds / totalSeconds;
  return share > 1 ? null : share;
}

export function mapWinMethods(row?: WinMethodRow): FighterWinMethods {
  const koTko = Number(row?.ko_tko ?? 0);
  const submission = Number(row?.submission ?? 0);
  const decision = Number(row?.decision ?? 0);
  const other = Number(row?.other ?? 0);

  return {
    koTko,
    submission,
    decision,
    other,
    total: koTko + submission + decision + other,
  };
}

export function mapNewsArticle(row: NewsRow): NewsArticle {
  return {
    id: row.id,
    headline: row.headline,
    summary: row.summary,
    source: row.source,
    url: row.url,
    publishedAt: row.published_at,
    fighterId: row.fighter_id,
    fighterName: row.fighter_name,
    category: row.category,
    relevance: row.relevance ? Number(row.relevance) : null,
    imageUrl: row.image_url,
  };
}

export function zoneStat(
  landed: string | null | undefined,
  attempted: string | null | undefined,
): StrikeZoneStat {
  return { landed: Number(landed ?? 0), attempted: Number(attempted ?? 0) };
}

export function mapStrikeBreakdown(row?: StrikeBreakdownRow): FighterStrikeBreakdown {
  const head = zoneStat(row?.head_landed, row?.head_attempted);
  const body = zoneStat(row?.body_landed, row?.body_attempted);
  const leg = zoneStat(row?.leg_landed, row?.leg_attempted);

  return {
    head,
    body,
    leg,
    distance: zoneStat(row?.distance_landed, row?.distance_attempted),
    clinch: zoneStat(row?.clinch_landed, row?.clinch_attempted),
    ground: zoneStat(row?.ground_landed, row?.ground_attempted),
    // head+body+leg == golpes significativos conectados (invariante de la BD).
    totalLanded: head.landed + body.landed + leg.landed,
  };
}

// Columnas de golpes por zona/posición con COALESCE(SUM(...),0): peleas antiguas
// pueden tener NULL. `prefix` permite reutilizar el bloque para el rival (opp.).
export function strikeBreakdownSelect(prefix: string): string {
  const col = (name: string) => `coalesce(sum(${prefix}${name}), 0)::text`;
  return `
    ${col("sig_str_head_landed")} as head_landed,
    ${col("sig_str_head_attempted")} as head_attempted,
    ${col("sig_str_body_landed")} as body_landed,
    ${col("sig_str_body_attempted")} as body_attempted,
    ${col("sig_str_leg_landed")} as leg_landed,
    ${col("sig_str_leg_attempted")} as leg_attempted,
    ${col("sig_str_distance_landed")} as distance_landed,
    ${col("sig_str_distance_attempted")} as distance_attempted,
    ${col("sig_str_clinch_landed")} as clinch_landed,
    ${col("sig_str_clinch_attempted")} as clinch_attempted,
    ${col("sig_str_ground_landed")} as ground_landed,
    ${col("sig_str_ground_attempted")} as ground_attempted`;
}
