import type {
  FighterAggregateStats,
  FighterComparisonAverages,
  FighterCardData,
  FighterDefenseStats,
  FighterStrikeBreakdown,
  FighterWinMethods,
  StrikeZoneStat,
  NewsArticle,
} from "@/lib/types";
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
    fightCount: Number(row.fight_count ?? 0),
    latestWeightClass: row.latest_weight_class ?? null,
  };
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
    strikingDefense: oppSigAtt > 0 ? 1 - oppSigLanded / oppSigAtt : 0,
    takedownDefense: oppTdAtt > 0 ? 1 - oppTdLanded / oppTdAtt : 0,
    oppSigStrikesLanded: oppSigLanded,
    oppSigStrikesAttempted: oppSigAtt,
    oppTakedownsLanded: oppTdLanded,
    oppTakedownsAttempted: oppTdAtt,
  };
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
