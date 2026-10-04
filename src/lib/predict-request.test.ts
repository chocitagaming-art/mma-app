import { describe, expect, it } from "vitest";

import { buildPredictRequestBody } from "@/lib/predict-request";

// The body the browser POSTs to /api/predict. MarketModelComparison (the fight
// page) builds it with the fight id; /enfrentamiento predicts a bare pair.
describe("buildPredictRequestBody", () => {
  it("the fight page asks for the prediction of its own fight", () => {
    expect(buildPredictRequestBody(1489, 448, 14232)).toEqual({
      redFighterId: 1489,
      blueFighterId: 448,
      fightId: 14232,
    });
  });

  it("without a fight id the body is the bare pair, with no fightId key at all", () => {
    const body = buildPredictRequestBody(1489, 448);
    expect(body).toEqual({ redFighterId: 1489, blueFighterId: 448 });
    expect(body).not.toHaveProperty("fightId");
    expect(JSON.stringify(body)).toBe('{"redFighterId":1489,"blueFighterId":448}');
  });
});
