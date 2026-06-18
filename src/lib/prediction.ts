import { Anthropic } from "@anthropic-ai/sdk";

export type PredictionFeature = {
  name: string;
  value: number | null;
  importance: number;
  impact: number;
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

export type PredictionResponse = {
  redProbability: number;
  blueProbability: number;
  topFeatures: PredictionFeature[];
  featureValues: Record<string, number | null>;
  context: {
    matchupDate: string;
    weightClass: string | null;
  };
  fighters: {
    red: PredictionFighterProfile;
    blue: PredictionFighterProfile;
  };
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
  const favorite =
    data.redProbability >= data.blueProbability ? data.fighters.red.name : data.fighters.blue.name;
  const underdog =
    data.redProbability >= data.blueProbability ? data.fighters.blue.name : data.fighters.red.name;
  const topFactors = data.topFeatures
    .slice(0, 3)
    .map((feature) => `${humanizeFeatureName(feature.name)} (${feature.value ?? "N/D"})`)
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
    `Peleador esquina roja: ${data.fighters.red.name}`,
    `Peleador esquina azul: ${data.fighters.blue.name}`,
    `Probabilidad roja: ${formatPercent(data.redProbability)}`,
    `Probabilidad azul: ${formatPercent(data.blueProbability)}`,
    `Categoría: ${data.context.weightClass ?? "No disponible"}`,
    `Factores clave: ${data.topFeatures
      .map((feature) => `${humanizeFeatureName(feature.name)}=${feature.value ?? "N/D"}`)
      .join(", ")}`,
    `Stats roja: ${JSON.stringify(data.fighters.red.aggregate_stats)}`,
    `Stats azul: ${JSON.stringify(data.fighters.blue.aggregate_stats)}`,
  ].join("\n");

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
}