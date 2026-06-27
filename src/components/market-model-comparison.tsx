"use client";

import Link from "next/link";
import { ArrowRight, Brain, Info, Loader2, Scale, TrendingUp } from "lucide-react";
import { useState } from "react";

import { MarketCornerTile, isPickEm } from "@/components/market-corner-tile";
import { Button } from "@/components/ui/button";
import { compareModelVsMarket, type MarketFavorite } from "@/lib/odds";
import type { PredictionResponse } from "@/lib/prediction";

type MarketModelComparisonProps = {
  redFighterId: number;
  blueFighterId: number;
  redName: string;
  blueName: string;
  oddsRed: number;
  oddsBlue: number;
  market: MarketFavorite;
};

export function MarketModelComparison({
  redFighterId,
  blueFighterId,
  redName,
  blueName,
  oddsRed,
  oddsBlue,
  market,
}: MarketModelComparisonProps) {
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Separate, non-destructive state for a 503 (service down): a calm
  // "unavailable" note instead of a hard error, keeping the market visible.
  const [unavailable, setUnavailable] = useState(false);

  async function handleCompare() {
    setLoading(true);
    setError(null);
    setUnavailable(false);

    try {
      // Modelo PURO: solo se envían ids de peleador; las cuotas nunca entran al
      // modelo, únicamente a la comparación visual.
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redFighterId, blueFighterId }),
      });

      // 503 = service not deployed / unreachable. Neutral "not available" state,
      // not a hard error: the market comparison above stays on screen.
      if (response.status === 503) {
        setPrediction(null);
        setUnavailable(true);
        return;
      }

      const data = (await response.json()) as
        | PredictionResponse
        | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "La predicción falló.");
      }

      setPrediction(data);
    } catch (caughtError) {
      setPrediction(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "La predicción falló.",
      );
    } finally {
      setLoading(false);
    }
  }

  const comparison = prediction
    ? compareModelVsMarket(
        { redImplied: market.redImplied, blueImplied: market.blueImplied },
        {
          redProbability: prediction.redProbability,
          blueProbability: prediction.blueProbability,
        },
      )
    : null;

  const lowConfidence = prediction?.lowConfidence ?? false;
  const pickEm = isPickEm(market);
  const valueName = comparison?.valueCorner === "red" ? redName : blueName;
  const valuePoints = comparison ? Math.round(comparison.valueEdge * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-center gap-2">
        <TrendingUp className="size-4 text-primary" />
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Mercado vs Modelo
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MarketCornerTile
          corner="red"
          name={redName}
          odds={oddsRed}
          marketImplied={market.redImplied}
          modelProbability={prediction ? prediction.redProbability : null}
          isMarketFavorite={market.favorite === "red" && !pickEm}
          lowConfidence={lowConfidence}
        />
        <MarketCornerTile
          corner="blue"
          name={blueName}
          odds={oddsBlue}
          marketImplied={market.blueImplied}
          modelProbability={prediction ? prediction.blueProbability : null}
          isMarketFavorite={market.favorite === "blue" && !pickEm}
          lowConfidence={lowConfidence}
        />
      </div>

      {prediction ? null : (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Probabilidad implícita de las casas de apuestas (sin margen).
        </p>
      )}

      {prediction && comparison ? (
        <div aria-live="polite" className="mt-5 space-y-3">
          {lowConfidence ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-left text-sm leading-6 text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  Baja confianza · datos insuficientes.
                </span>{" "}
                Uno de los peleadores no tiene suficiente historial, así que el
                modelo se mantiene en una base cercana al 50/50 y no se compara
                el valor frente al mercado.
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted px-4 py-2.5 text-center">
                <Scale className="size-4 shrink-0 text-primary" />
                <p className="font-display text-sm font-bold uppercase tracking-tight text-foreground">
                  {comparison.agree
                    ? "Modelo y mercado coinciden"
                    : "El modelo discrepa del mercado"}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <Brain className="size-4 shrink-0 text-primary" />
                {valuePoints >= 1 ? (
                  <span>
                    El modelo da{" "}
                    <span className="font-semibold text-foreground">
                      +{valuePoints} pts
                    </span>{" "}
                    a{" "}
                    <span className="font-semibold text-foreground">
                      {valueName}
                    </span>{" "}
                    frente al mercado
                  </span>
                ) : (
                  <span>
                    El modelo coincide con el mercado (diferencia menor a 1
                    punto)
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {prediction ? null : (
        <div className="mt-5 space-y-3">
          <Button
            type="button"
            onClick={handleCompare}
            disabled={loading}
            aria-label="Comparar las cuotas del mercado con el modelo de IA"
            className="h-11 w-full rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : unavailable ? (
              <Info />
            ) : (
              <Brain />
            )}
            {loading
              ? "Comparando..."
              : unavailable
                ? "Reintentar"
                : "Comparar con el modelo"}
          </Button>

          {unavailable ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-2xl border border-border bg-muted px-4 py-3 text-left text-sm text-muted-foreground"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-semibold text-foreground">
                  Modelo no disponible por ahora.
                </span>{" "}
                El servicio de predicción está fuera de línea temporalmente. El
                favorito del mercado sigue arriba; vuelve a intentarlo más tarde.
              </span>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-4 text-center">
        <Link
          href={`/enfrentamiento?red=${redFighterId}&blue=${blueFighterId}`}
          className="inline-flex items-center gap-1 font-mono text-xs font-semibold uppercase tracking-wide text-primary transition-colors hover:text-primary/80"
        >
          Ver desglose completo
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
