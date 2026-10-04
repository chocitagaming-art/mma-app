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
      // null cuando el servicio no tiene un valor finito que mandar (JSON no
      // admite NaN): la barra sale de contribution y el hueco se pinta «N/D».
      // Sigue sin admitir que falte, ni texto, ni NaN/Infinity.
      value: z.number().nullable(),
      contribution: z.number(),
      direction: z.enum(["red", "blue"]),
    }),
  ),
  methodPrediction: methodPredictionSchema.nullish(),
});

// Where the service anchored the prediction (owner decision, 4-oct-2026): the
// requested fight, the pair's pending bout, today, or none (neither fighter
// has any fight).
export const PREDICTION_ANCHORS = ["fight", "pending", "today", "none"] as const;
export type PredictionAnchor = (typeof PREDICTION_ANCHORS)[number];

// Secondary data, like the method: validated on its own so a malformed anchor
// is dropped without taking the winner prediction down. Both fields are
// optional because a service older than them does not send them, and the web
// may deploy first.
const anchorFieldsSchema = z.object({
  anchor: z.enum(PREDICTION_ANCHORS).optional(),
  anchorFightId: z.number().int().positive().nullable().optional(),
});

// Drops BOTH anchor fields when either is malformed (they describe one thing)
// and returns the warning; undefined when there is nothing to drop.
function dropMalformedAnchor(data: RawPrediction): string | undefined {
  const context: unknown = data.context;
  if (typeof context !== "object" || context === null) return undefined;
  const fields = context as Record<string, unknown>;
  const parsed = anchorFieldsSchema.safeParse({
    anchor: fields.anchor,
    anchorFightId: fields.anchorFightId,
  });
  if (parsed.success) return undefined;

  const rest = { ...fields };
  delete rest.anchor;
  delete rest.anchorFightId;
  data.context = rest as RawPrediction["context"];
  return `context.anchor/anchorFightId con forma inesperada, se descartan: ${z.prettifyError(parsed.error)}`;
}

export type ParsePredictionResult =
  | { ok: true; data: RawPrediction; warning?: string }
  | { ok: false; error: string };

function accepted(data: RawPrediction, methodWarning?: string): ParsePredictionResult {
  const warnings = [methodWarning, dropMalformedAnchor(data)].filter(
    (warning): warning is string => warning !== undefined,
  );
  return warnings.length > 0
    ? { ok: true, data, warning: warnings.join("\n") }
    : { ok: true, data };
}

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
 *
 * The anchor fields of `context` (`anchor`, `anchorFightId`) degrade the same
 * way as the method: malformed, they are dropped on their own with a warning.
 */
export function parsePredictionPayload(payload: unknown): ParsePredictionResult {
  const parsed = rawPredictionSchema.safeParse(payload);
  if (parsed.success) {
    return accepted(parsed.data as RawPrediction);
  }

  // Segunda oportunidad: sálvese el ganador aunque el método venga roto.
  const withoutMethod = rawPredictionSchema.safeParse({
    ...(payload as Record<string, unknown>),
    methodPrediction: null,
  });
  if (withoutMethod.success) {
    return accepted(
      withoutMethod.data as RawPrediction,
      `methodPrediction con forma inesperada, se descarta: ${z.prettifyError(parsed.error)}`,
    );
  }

  return { ok: false, error: z.prettifyError(parsed.error) };
}
