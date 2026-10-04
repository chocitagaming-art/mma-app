// Body the browser POSTs to /api/predict (validated by its zod schema).
export type PredictRequestBody = {
  redFighterId: number;
  blueFighterId: number;
  fightId?: number;
};

/**
 * Builds the /api/predict request body.
 *
 * With `fightId` the service predicts THAT fight, anchored to its own date,
 * weight class, rounds and title status, even once it has been decided, so its
 * own result never leaks into the history (the fight page, "Mercado vs
 * Modelo"). Without it the service predicts the bare pair: its pending bout, or
 * "as if they fought today" (/enfrentamiento). The key is left out rather than
 * sent as null, so the bare-pair request stays byte-identical to the old one.
 */
export function buildPredictRequestBody(
  redFighterId: number,
  blueFighterId: number,
  fightId?: number,
): PredictRequestBody {
  return fightId === undefined
    ? { redFighterId, blueFighterId }
    : { redFighterId, blueFighterId, fightId };
}
