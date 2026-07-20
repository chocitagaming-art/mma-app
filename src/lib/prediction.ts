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

// Cómo acaba la pelea según el modelo de método (3 clases). Simetrizado por
// esquinas en el microservicio: probabilities(A, B) == probabilities(B, A).
export type MethodPrediction = {
  probabilities: {
    decision: number;
    ko: number;
    submission: number;
  };
  predicted: "decision" | "ko" | "submission";
  // ISO date del entrenamiento del modelo de método (clave method_trained_at
  // del bundle); null/ausente en bundles antiguos.
  trainedAt?: string | null;
};

export type PredictionResponse = {
  redProbability: number;
  blueProbability: number;
  // True when either fighter has < 3 prior fights or no usable history, so the
  // probabilities are a ~50/50 baseline rather than a confident pick.
  lowConfidence: boolean;
  topFeatures: PredictionFeature[];
  // Predicción de MÉTODO de victoria. OPTIONAL: respuestas cacheadas antiguas
  // o un servicio con bundle pre-método la omiten (o null) — la UI no renderiza
  // la sección en ese caso, nunca crashea (mismo patrón que featureContributions).
  methodPrediction?: MethodPrediction | null;
  // Full symmetrized SHAP map (feature -> log-odds contribution) the
  // microservice adds since mma-ingesta f898944. OPTIONAL: older cached
  // responses / an older service omit it — render the factor bars without the
  // aggregated "rest" row in that case, never crash.
  featureContributions?: Record<string, number> | null;
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

// Timeout por defecto de la explicación (camino caliente) y suelo por debajo
// del cual ni se intenta la llamada: con menos de 1,5s es casi seguro que el
// timeout gana a la respuesta y solo retrasaría el fallback local.
const DEFAULT_EXPLANATION_TIMEOUT_MS = 10_000;
const MIN_EXPLANATION_TIMEOUT_MS = 1_500;

function getAnthropicClient(timeoutMs: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  // Sin reintentos y con timeout acotado por el llamante: /api/predict tiene
  // maxDuration=60 (tope Hobby de Vercel) y, tras un arranque en frío de
  // Render (~50s medido), sus reintentos pueden haber consumido ~56s, así que
  // la ruta pasa aquí solo el presupuesto que le queda. Si la explicación no
  // llega a tiempo, el catch degrada al resumen local (mejor que un 504).
  return new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
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

const METHOD_LABELS_TEXT: Record<MethodPrediction["predicted"], string> = {
  ko: "KO/TKO",
  submission: "sumisión",
  decision: "decisión",
};

// Frase corta "cómo acaba" para la explicación local; null si no hay datos de
// método (respuesta antigua) para que el resto del párrafo no cambie.
function describeMethodOutcome(method: MethodPrediction | null | undefined) {
  if (!method?.probabilities || !method.predicted) {
    return null;
  }
  const probability = method.probabilities[method.predicted];
  if (typeof probability !== "number" || !Number.isFinite(probability)) {
    return null;
  }
  return `El desenlace más probable según el modelo es ${METHOD_LABELS_TEXT[method.predicted]} (${formatPercent(probability)}).`;
}

function buildFallbackExplanation(data: Omit<PredictionResponse, "explanation" | "explanationSource">) {
  // Un único párrafo corto (3-4 frases): el dueño pidió explicaciones
  // resumidas y claras (11-jul).
  if (data.lowConfidence) {
    // No confident favorite: one fighter lacks enough history, so the model falls
    // back to a ~50/50 baseline. Do NOT frame either corner as a real favorite.
    return `Enfrentamiento de baja confianza: uno de los peleadores no tiene suficiente historial registrado, así que el modelo no puede fijar un favorito claro y la probabilidad se queda cerca del 50/50. Tómalo como una referencia, no como una predicción fiable de ${data.fighters.red.name} contra ${data.fighters.blue.name}.`;
  }

  const favorite =
    data.redProbability >= data.blueProbability ? data.fighters.red.name : data.fighters.blue.name;
  const underdog =
    data.redProbability >= data.blueProbability ? data.fighters.blue.name : data.fighters.red.name;
  const topFactors = data.topFeatures
    .slice(0, 2)
    .map((feature) => humanizeFeatureName(feature.name))
    .join(" y ");

  const methodSentence = describeMethodOutcome(data.methodPrediction);
  return `${favorite} parte como favorito con un ${formatPercent(
    Math.max(data.redProbability, data.blueProbability),
  )} de probabilidad frente a ${underdog}. Las ventajas que más pesan son ${topFactors}.${
    methodSentence ? ` ${methodSentence}` : ""
  } Recuerda que es una estimación basada en patrones históricos: no garantiza el resultado real.`;
}

export async function generatePredictionExplanation(
  data: Omit<PredictionResponse, "explanation" | "explanationSource">,
  // timeoutMs: presupuesto máximo que el llamante puede permitirse esperar
  // (p.ej. lo que le queda a /api/predict de su maxDuration). Se acota al
  // timeout por defecto para que un presupuesto holgado no alargue la espera.
  options?: { timeoutMs?: number },
) {
  const timeoutMs = Math.min(
    DEFAULT_EXPLANATION_TIMEOUT_MS,
    options?.timeoutMs ?? DEFAULT_EXPLANATION_TIMEOUT_MS,
  );

  // Presupuesto restante demasiado pequeño (arranque en frío que apuró los
  // reintentos): ir directo al resumen local en vez de arriesgar el 504.
  if (timeoutMs < MIN_EXPLANATION_TIMEOUT_MS) {
    return {
      explanation: buildFallbackExplanation(data),
      explanationSource: "fallback" as const,
    };
  }

  const anthropic = getAnthropicClient(timeoutMs);

  if (!anthropic) {
    return {
      explanation: buildFallbackExplanation(data),
      explanationSource: "fallback" as const,
    };
  }

  const prompt = [
    "Explica en español una predicción de pelea UFC en UN SOLO párrafo de 3-4 frases.",
    "Resumido, claro y con lenguaje sencillo: quédate solo con las 2-3 claves que más pesan.",
    "Evita certezas absolutas y jerga estadística.",
    "Responde directamente con el párrafo, sin preámbulo ni meta-comentarios.",
    data.lowConfidence
      ? "IMPORTANTE: este enfrentamiento es de BAJA CONFIANZA porque uno de los peleadores no tiene suficiente historial. NO declares un favorito claro; explica que la probabilidad es una base cercana al 50/50 por datos insuficientes y debe tomarse como referencia, no como predicción fiable."
      : "",
    `Peleador esquina roja: ${data.fighters.red.name}`,
    `Peleador esquina azul: ${data.fighters.blue.name}`,
    `Probabilidad roja: ${formatPercent(data.redProbability)}`,
    `Probabilidad azul: ${formatPercent(data.blueProbability)}`,
    `Categoría: ${data.context.weightClass ?? "No disponible"}`,
    data.methodPrediction
      ? `Probabilidades de método (cómo acaba): decisión ${formatPercent(
          data.methodPrediction.probabilities.decision,
        )}, KO/TKO ${formatPercent(data.methodPrediction.probabilities.ko)}, sumisión ${formatPercent(
          data.methodPrediction.probabilities.submission,
        )}. Si alguna destaca sobre su base histórica, menciónala en una frase.`
      : "",
    `Factores clave: ${data.topFeatures
      .map((feature) => `${humanizeFeatureName(feature.name)}=${feature.value}`)
      .join(", ")}`,
    `Stats roja: ${JSON.stringify(data.fighters.red.aggregate_stats)}`,
    `Stats azul: ${JSON.stringify(data.fighters.blue.aggregate_stats)}`,
  ].join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      // Un párrafo corto: presupuesto ajustado (antes 1024 para 2 párrafos).
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    let text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    // Si el modelo agotó max_tokens, el texto puede cortarse a mitad de frase:
    // recortamos hasta el último punto para que siempre termine limpio.
    if (response.stop_reason === "max_tokens") {
      const lastPeriod = text.lastIndexOf(".");
      if (lastPeriod > 0) {
        text = text.slice(0, lastPeriod + 1);
      }
    }

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