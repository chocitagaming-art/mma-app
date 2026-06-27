// Market odds helpers (#41). Decimal odds (e.g. 1.40) come from fights.odds_red /
// fights.odds_blue, populated from The Odds API. Implied probability is 1/odds,
// then normalized across both corners to strip the bookmaker's vig (overround) so
// the two add up to 100%.

export type MarketFavorite = {
  favorite: "red" | "blue";
  redImplied: number; // 0-1, vig-removed
  blueImplied: number; // 0-1, vig-removed
};

export function marketFavorite(
  oddsRed: number | null | undefined,
  oddsBlue: number | null | undefined,
): MarketFavorite | null {
  // Valid decimal odds are > 1.0; anything else means "no line".
  if (!oddsRed || !oddsBlue || oddsRed <= 1 || oddsBlue <= 1) {
    return null;
  }

  const redRaw = 1 / oddsRed;
  const blueRaw = 1 / oddsBlue;
  const total = redRaw + blueRaw;
  const redImplied = redRaw / total;
  const blueImplied = blueRaw / total;

  return {
    favorite: redImplied >= blueImplied ? "red" : "blue",
    redImplied,
    blueImplied,
  };
}

// Model vs Market comparison (#Phase 9). Confronts the pure model probabilities
// against the vig-removed market implied probabilities. The edge is signed
// (model - market) per corner; "value" is the corner where the model is more
// optimistic than the market. Because both distributions sum to 1, redEdge =
// -blueEdge, so |redEdge| is the single magnitude of disagreement.
export type ModelVsMarket = {
  redEdge: number; // model - market, red corner (-1..1)
  blueEdge: number; // model - market, blue corner (-1..1)
  marketFavorite: "red" | "blue";
  modelFavorite: "red" | "blue";
  agree: boolean; // market and model favour the same corner
  valueCorner: "red" | "blue"; // corner where the model out-prices the market
  valueEdge: number; // absolute magnitude of the edge (0..1)
};

export function compareModelVsMarket(
  market: { redImplied: number; blueImplied: number },
  model: { redProbability: number; blueProbability: number },
): ModelVsMarket {
  // Defensive normalization: a calibrated binary classifier returns
  // complementary probabilities, but normalizing guarantees redProb + blueProb
  // == 1 (so redEdge = -blueEdge holds) even if an upstream value ever drifts.
  const modelTotal = model.redProbability + model.blueProbability;
  const redProb = modelTotal > 0 ? model.redProbability / modelTotal : 0.5;
  const blueProb = modelTotal > 0 ? model.blueProbability / modelTotal : 0.5;

  const redEdge = redProb - market.redImplied;
  const blueEdge = blueProb - market.blueImplied;
  const marketFavorite = market.redImplied >= market.blueImplied ? "red" : "blue";
  const modelFavorite = redProb >= blueProb ? "red" : "blue";
  const valueCorner = redEdge >= blueEdge ? "red" : "blue";

  return {
    redEdge,
    blueEdge,
    marketFavorite,
    modelFavorite,
    agree: marketFavorite === modelFavorite,
    valueCorner,
    valueEdge: Math.abs(valueCorner === "red" ? redEdge : blueEdge),
  };
}
