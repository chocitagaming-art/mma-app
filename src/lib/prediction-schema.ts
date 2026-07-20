import { z } from "zod";

import type { PredictionResponse } from "@/lib/prediction";

export type RawPrediction = Omit<
  PredictionResponse,
  "explanation" | "explanationSource"
>;

// z.number() de zod 4 ya rechaza NaN e Infinity por sí solo, que es justo lo que
// acabaría pintado como "NaN%" en el careo.
const probability = z.number().min(0).max(1);

// El método es SECUNDARIO: se valida aparte para poder descartarlo solo a él
// cuando llega mal formado, en vez de tumbar la predicción de ganador entera.
const methodPredictionSchema = z.looseObject({
  probabilities: z.looseObject({
    decision: probability,
    ko: probability,
    submission: probability,
  }),
  predicted: z.enum(["decision", "ko", "submission"]),
  trainedAt: z.string().nullish(),
});

// Núcleo que la UI necesita para no romperse. Todo lo demás viaja sin validar:
// se usa looseObject (y NO z.object, que descarta las claves desconocidas) para
// que el microservicio pueda añadir campos nuevos sin obligar a desplegar la app
// — así viajaron en su día featureContributions y methodPrediction.
const rawPredictionSchema = z.looseObject({
  redProbability: probability,
  blueProbability: probability,
  lowConfidence: z.boolean(),
  topFeatures: z.array(
    z.looseObject({
      name: z.string(),
      value: z.number(),
      contribution: z.number(),
      direction: z.enum(["red", "blue"]),
    }),
  ),
  methodPrediction: methodPredictionSchema.nullish(),
});

export type ParsePredictionResult =
  | { ok: true; data: RawPrediction; warning?: string }
  | { ok: false; error: string };

/**
 * Valida en runtime lo que devuelve el microservicio de predicción.
 *
 * Esto era un `as RawPrediction`, un cast que no comprueba NADA: el día que
 * Render renombrase un campo, la app no lanzaba error — pintaba huecos o "NaN%"
 * y nadie se enteraba.
 *
 * Degradación en dos escalones, porque no todo pesa igual: si lo único roto es
 * `methodPrediction` se descarta solo ese campo y la predicción de ganador sigue
 * adelante (la sección de método ya está preparada para no existir); si lo roto
 * es el núcleo, no hay nada que salvar y el llamante debe cortar.
 */
export function parsePredictionPayload(payload: unknown): ParsePredictionResult {
  const parsed = rawPredictionSchema.safeParse(payload);
  if (parsed.success) {
    return { ok: true, data: parsed.data as RawPrediction };
  }

  // Segunda oportunidad: sálvese el ganador aunque el método venga roto.
  const withoutMethod = rawPredictionSchema.safeParse({
    ...(payload as Record<string, unknown>),
    methodPrediction: null,
  });
  if (withoutMethod.success) {
    return {
      ok: true,
      data: withoutMethod.data as RawPrediction,
      warning: `methodPrediction con forma inesperada, se descarta: ${z.prettifyError(parsed.error)}`,
    };
  }

  return { ok: false, error: z.prettifyError(parsed.error) };
}
