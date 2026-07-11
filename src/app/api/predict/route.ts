import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePredictionExplanation, type PredictionResponse } from "@/lib/prediction";

export const runtime = "nodejs";
// El microservicio (Render free) se duerme a los 15 min: el primer request lo
// despierta y puede tardar ~50s. Presupuesto amplio + reintento (abajo) para
// que el usuario nunca vea el fallo de arranque en frío (dueño, 11-jul).
export const maxDuration = 60;

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

  // Hasta 2 intentos: el 1º puede morir por el arranque en frío de Render
  // (~50s); ese mismo intento ya ha despertado el servicio, así que el 2º
  // responde en caliente. 25s + 1s + 26s ≈ 52s, dentro del maxDuration de 60.
  const ATTEMPT_TIMEOUTS_MS = [25_000, 26_000];
  let response: Response | null = null;
  for (let attempt = 0; attempt < ATTEMPT_TIMEOUTS_MS.length; attempt += 1) {
    try {
      const attemptResponse = await fetch(`${baseUrl.replace(/\/$/u, "")}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify({ red: redFighterId, blue: blueFighterId }),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUTS_MS[attempt]),
      });
      // El proxy de Render responde 502/503/504 mientras la instancia
      // arranca: cuenta como "aún dormido" y se reintenta.
      if (
        [502, 503, 504].includes(attemptResponse.status) &&
        attempt < ATTEMPT_TIMEOUTS_MS.length - 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      response = attemptResponse;
      break;
    } catch {
      // Fallo de red o timeout alcanzando el microservicio.
      if (attempt === ATTEMPT_TIMEOUTS_MS.length - 1) {
        throw new PredictionUnavailableError(
          "El servicio de predicción no responde. Inténtalo de nuevo en un momento.",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  if (response === null) {
    // Inalcanzable (el bucle siempre asigna o lanza), pero satisface a TS.
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
