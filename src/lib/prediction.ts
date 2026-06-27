import { Anthropic } from "@anthropic-ai/sdk";

export type PredictionFeature = {
  name: string;
  value: number;
  // Signed log-odds contribution of this feature for the matchup.
  contribution: number;
  // Which corner the feature favours.
  direction: "red" | "blue";
};

export type PredictionFighterProfile = {
  id: number;
  name: string;
  nickname: string | null;
  headshot_url: string | null;
  wins: number;
  losses: number;
  draws: number;
  height_cm: number | null;
  reach_cm: number | null;
  stance: string | null;
  latest_weight_class: string | null;
  aggregate_stats: {
    sigStrikesLandedPerFight: number;
    sigStrikeAccuracy: number;
    knockdownsPerFight: number;
    takedownsLandedPerFight: number;
    takedownAccuracy: number;
    submissionAttemptsPerFight: number;
    controlTimePerFightSeconds: number;
  };
};

// Per-corner history summary the microservice already computes and returns under
// context.redHistory / context.blueHistory (asdict of FighterHistorySummary in
// features.py). Snake_case keys mirror the dataclass field names verbatim;
// latest_prior_fight_date arrives as an ISO date string (json.dumps default=str).
export type FighterHistorySummary = {
  total_prior_fights: number;
  total_rounds_fought: number;
  sig_strikes_landed_per_fight: number | null;
  sig_strike_accuracy: number | null;
  knockdowns_per_fight: number | null;
  takedowns_landed_per_fight: number | null;
  takedown_accuracy: number | null;
  submission_attempts_per_fight: number | null;
  control_time_seconds_per_fight: number | null;
  win_streak: number;
  wins_last_5: number;
  pct_wins_by_ko: number | null;
  pct_wins_by_submission: number | null;
  pct_wins_by_decision: number | null;
  days_since_last_fight: number | null;
  ranking_position: number | null;
  sig_strikes_absorbed_per_fight: number | null;
  sig_strike_defense: number | null;
  takedowns_absorbed_per_fight: number | null;
  takedown_defense: number | null;
  avg_opponent_prior_win_rate: number | null;
  latest_prior_fight_date: string | null;
};

export type PredictionResponse = {
  redProbability: number;
  blueProbability: number;
  // True when either fighter has < 3 prior fights or no usable history, so the
  // probabilities are a ~50/50 baseline rather than a confident pick.
  lowConfidence: boolean;
  topFeatures: PredictionFeature[];
  featureValues: Record<string, number | null>;
  context: {
    matchupDate: string;
    weightClass: string | null;
    lowConfidence?: boolean;
    // null when a fighter has no usable history (debutant / missing stats).
    redHistory?: FighterHistorySummary | null;
    blueHistory?: FighterHistorySummary | null;
  };
  fighters: {
    red: PredictionFighterProfile;
    blue: PredictionFighterProfile;
  };
  // ISO date (e.g. "2026-06-25") stamped into the model bundle; optional/null
  // for older bundles. Comes straight from the microservice /predict response.
  modelTrainedAt?: string | null;
  explanation: string;
  explanationSource: "anthropic" | "fallback";
};

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Anthropic({ apiKey });
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function humanizeFeatureName(name: string) {
  return name
    .replace(/_diff$/u, "")
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

function buildFallbackExplanation(data: Omit<PredictionResponse, "explanation" | "explanationSource">) {
  if (data.lowConfidence) {
    // No confident favorite: one fighter lacks enough history, so the model falls
    // back to a ~50/50 baseline. Do NOT frame either corner as a real favorite.
    return `Este enfrentamiento es de baja confianza: uno de los peleadores no tiene suficiente historial registrado, así que el modelo no puede establecer un favorito claro y la probabilidad se mantiene cerca del 50/50. Trátalo como una estimación de referencia, no como una predicción fiable.\n\nCon más peleas registradas para ambos perfiles, el modelo podría detectar diferencias reales. Por ahora, las señales disponibles son insuficientes para inclinar el resultado hacia ${data.fighters.red.name} o ${data.fighters.blue.name}.`;
  }

  const favorite =
    data.redProbability >= data.blueProbability ? data.fighters.red.name : data.fighters.blue.name;
  const underdog =
    data.redProbability >= data.blueProbability ? data.fighters.blue.name : data.fighters.red.name;
  const topFactors = data.topFeatures
    .slice(0, 3)
    .map((feature) => `${humanizeFeatureName(feature.name)} (${feature.value})`)
    .join(", ");

  return `${favorite} parte como favorito con una probabilidad estimada de ${formatPercent(
    Math.max(data.redProbability, data.blueProbability),
  )}. El modelo detecta ventajas comparativas recientes frente a ${underdog}, especialmente en ${topFactors}. Estas señales combinan volumen ofensivo, eficiencia y contexto competitivo acumulado.\n\nAun así, la predicción no garantiza el resultado real de la pelea. Refleja únicamente patrones históricos del dataset y cómo el modelo pondera las diferencias entre ambos perfiles para este enfrentamiento.`;
}

export async function generatePredictionExplanation(
  data: Omit<PredictionResponse, "explanation" | "explanationSource">,
) {
  const anthropic = getAnthropicClient();

  if (!anthropic) {
    return {
      explanation: buildFallbackExplanation(data),
      explanationSource: "fallback" as const,
    };
  }

  const prompt = [
    "Explica en español, en 2 párrafos, una predicción de pelea UFC.",
    "Sé claro, analítico y evita afirmar certezas absolutas.",
    "Responde directamente con los 2 párrafos, sin preámbulo ni meta-comentarios.",
    data.lowConfidence
      ? "IMPORTANTE: este enfrentamiento es de BAJA CONFIANZA porque uno de los peleadores no tiene suficiente historial. NO declares un favorito claro; explica que la probabilidad es una base cercana al 50/50 por datos insuficientes y debe tomarse como referencia, no como predicción fiable."
      : "",
    `Peleador esquina roja: ${data.fighters.red.name}`,
    `Peleador esquina azul: ${data.fighters.blue.name}`,
    `Probabilidad roja: ${formatPercent(data.redProbability)}`,
    `Probabilidad azul: ${formatPercent(data.blueProbability)}`,
    `Categoría: ${data.context.weightClass ?? "No disponible"}`,
    `Factores clave: ${data.topFeatures
      .map((feature) => `${humanizeFeatureName(feature.name)}=${feature.value}`)
      .join(", ")}`,
    `Stats roja: ${JSON.stringify(data.fighters.red.aggregate_stats)}`,
    `Stats azul: ${JSON.stringify(data.fighters.blue.aggregate_stats)}`,
  ].join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return {
      explanation: text || buildFallbackExplanation(data),
      explanationSource: text ? ("anthropic" as const) : ("fallback" as const),
    };
  } catch (error) {
    // Anthropic puede fallar (timeout, 429, 529, red). La predicción ML ya está
    // calculada, así que degradamos al resumen local en vez de tumbar /predict.
    console.error("[prediction] Anthropic falló; se usa la explicación de respaldo", error);
    return {
      explanation: buildFallbackExplanation(data),
      explanationSource: "fallback" as const,
    };
  }
}