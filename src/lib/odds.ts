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
