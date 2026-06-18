import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePredictionExplanation, type PredictionResponse } from "@/lib/prediction";

export const runtime = "nodejs";

const requestSchema = z.object({
  redFighterId: z.number().int().positive(),
  blueFighterId: z.number().int().positive(),
});

type RawPrediction = Omit<PredictionResponse, "explanation" | "explanationSource">;

// Thrown when the prediction microservice is not configured or unreachable, so
// the UI can degrade gracefully (503) instead of showing a hard error.
class PredictionUnavailableError extends Error {}

async function fetchPrediction(
  redFighterId: number,
  blueFighterId: number,
): Promise<RawPrediction> {
  const baseUrl = process.env.PREDICTION_SERVICE_URL;

  if (!baseUrl) {
    throw new PredictionUnavailableError(
      "La predicción con IA está temporalmente no disponible.",
    );
  }

  const apiKey = process.env.PREDICTION_SERVICE_API_KEY;

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/u, "")}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify({ red: redFighterId, blue: blueFighterId }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    // Network failure or timeout reaching the microservice.
    throw new PredictionUnavailableError(
      "El servicio de predicción no responde. Inténtalo de nuevo en un momento.",
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as { error?: string };
      detail = data?.error ?? "";
    } catch {
      // Non-JSON error body — ignore.
    }

    if (response.status === 422) {
      throw new Error(detail || "Insufficient fighter history");
    }
    if (response.status === 400) {
      throw new Error(detail || "Invalid fighter IDs.");
    }
    throw new PredictionUnavailableError(
      detail || `El servicio de predicción falló (${response.status}).`,
    );
  }

  return (await response.json()) as RawPrediction;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid fighter IDs.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.redFighterId === parsed.data.blueFighterId) {
      return NextResponse.json(
        { error: "Choose two different fighters." },
        { status: 400 },
      );
    }

    const prediction = await fetchPrediction(
      parsed.data.redFighterId,
      parsed.data.blueFighterId,
    );
    const explanation = await generatePredictionExplanation(prediction);

    return NextResponse.json({
      ...prediction,
      ...explanation,
    } satisfies PredictionResponse);
  } catch (error) {
    // Service not configured / unreachable → 503 so the UI degrades gracefully.
    if (error instanceof PredictionUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    const message =
      error instanceof Error ? error.message : "Prediction service failed unexpectedly.";
    const status = message.includes("Insufficient fighter history") ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
