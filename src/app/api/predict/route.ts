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

// The request to the microservice was rejected as invalid (400).
class InvalidPredictionRequestError extends Error {}

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
    if (response.status === 400) {
      throw new InvalidPredictionRequestError(
        "Identificadores de peleador no válidos.",
      );
    }
    throw new PredictionUnavailableError(
      `El servicio de predicción falló (${response.status}).`,
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
        { error: "Identificadores de peleador no válidos." },
        { status: 400 },
      );
    }

    if (parsed.data.redFighterId === parsed.data.blueFighterId) {
      return NextResponse.json(
        { error: "Elige dos peleadores diferentes." },
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

    // Bad request reaching the microservice → 400.
    if (error instanceof InvalidPredictionRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Error inesperado (JSON malformado, fallo del microservicio, etc.):
    // se loggea server-side y al cliente solo le llega un mensaje genérico,
    // nunca el stack ni el mensaje crudo.
    console.error("[api/predict] error inesperado", error);
    return NextResponse.json(
      { error: "El servicio de predicción falló de forma inesperada." },
      { status: 500 },
    );
  }
}
