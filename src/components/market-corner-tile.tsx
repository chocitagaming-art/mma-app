import { TrendingUp } from "lucide-react";

import { formatPercentage } from "@/lib/format";
import type { MarketFavorite } from "@/lib/odds";
import { cn } from "@/lib/utils";

// A true pick'em: when both corners sit within ~1 point of each other (e.g. even
// odds) we don't crown a "favorite", to avoid over-claiming on a coin flip.
const EVEN_EPSILON = 0.01;

export function isPickEm(market: Pick<MarketFavorite, "redImplied" | "blueImplied">) {
  return Math.abs(market.redImplied - market.blueImplied) < EVEN_EPSILON;
}

function MiniBar({
  label,
  value,
  barClass,
}: {
  label: string;
  value: number;
  barClass: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="tabular text-sm font-semibold text-foreground">
          {formatPercentage(value)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", barClass)}
          style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        />
      </div>
    </div>
  );
}

// Shared corner tile for the market block. With modelProbability === null it
// renders the market-only view (a single big implied %). With a model value it
// renders paired Mercado/Modelo bars. Reused by the static market card and the
// interactive Mercado vs Modelo comparison so the two never drift.
export function MarketCornerTile({
  corner,
  name,
  odds,
  marketImplied,
  modelProbability,
  isMarketFavorite,
  lowConfidence,
}: {
  corner: "red" | "blue";
  name: string;
  odds: number;
  marketImplied: number;
  modelProbability: number | null;
  isMarketFavorite: boolean;
  lowConfidence: boolean;
}) {
  const isRed = corner === "red";
  // Tailwind v4 only sees fully-spelled class names, so keep every variant literal.
  const modelBarClass = isRed
    ? lowConfidence
      ? "bg-corner-red/40"
      : "bg-corner-red"
    : lowConfidence
      ? "bg-corner-blue/40"
      : "bg-corner-blue";

  return (
    <div
      className={cn(
        "rounded-xl border p-4 text-center",
        isMarketFavorite ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <p className="truncate font-display text-lg font-bold uppercase text-foreground">
        {name}
      </p>
      {modelProbability === null ? (
        <p className="tabular mt-1 text-2xl font-bold text-foreground">
          {formatPercentage(marketImplied)}
        </p>
      ) : (
        <div className="mt-3 space-y-3 text-left">
          <MiniBar
            label="Mercado"
            value={marketImplied}
            barClass="bg-muted-foreground/40"
          />
          <MiniBar label="Modelo" value={modelProbability} barClass={modelBarClass} />
        </div>
      )}
      <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        Cuota {odds.toFixed(2)}
        {isMarketFavorite ? " · favorito" : ""}
      </p>
    </div>
  );
}

// Static market-only card (no model call). Used as the fallback on the fight
// page when the interactive comparison can't run (e.g. a finished fight with a
// recorded line, or a TBD rival).
export function MarketOnlyCard({
  redName,
  blueName,
  oddsRed,
  oddsBlue,
  market,
}: {
  redName: string;
  blueName: string;
  oddsRed: number;
  oddsBlue: number;
  market: MarketFavorite;
}) {
  const pickEm = isPickEm(market);
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-center gap-2">
        <TrendingUp className="size-4 text-primary" />
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Favorito del mercado
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MarketCornerTile
          corner="red"
          name={redName}
          odds={oddsRed}
          marketImplied={market.redImplied}
          modelProbability={null}
          isMarketFavorite={market.favorite === "red" && !pickEm}
          lowConfidence={false}
        />
        <MarketCornerTile
          corner="blue"
          name={blueName}
          odds={oddsBlue}
          marketImplied={market.blueImplied}
          modelProbability={null}
          isMarketFavorite={market.favorite === "blue" && !pickEm}
          lowConfidence={false}
        />
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Probabilidad implícita de las casas de apuestas (sin margen).
      </p>
    </div>
  );
}
