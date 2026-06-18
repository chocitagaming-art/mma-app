"use client";

import { Brain, Loader2, Sparkles, Swords, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { FighterSearchCombobox } from "@/components/fighter-search-combobox";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercentage, formatRecord, formatWeightClass } from "@/lib/format";
import type { PredictionResponse } from "@/lib/prediction";
import type { FighterSearchResult } from "@/lib/types";

type PredictFightClientProps = {
  initialRedFighter: FighterSearchResult | null;
  initialBlueFighter: FighterSearchResult | null;
};

function humanizeFeatureName(name: string) {
  return name
    .replace(/_diff$/u, "")
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

function formatFeatureValue(value: number | null) {
  if (value === null) {
    return "N/D";
  }
  return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function ProbabilityBar({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-base font-semibold text-foreground">{formatPercentage(value)}</p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        />
      </div>
    </div>
  );
}

export function PredictFightClient({
  initialRedFighter,
  initialBlueFighter,
}: PredictFightClientProps) {
  const router = useRouter();
  const [redFighter, setRedFighter] = useState<FighterSearchResult | null>(initialRedFighter);
  const [blueFighter, setBlueFighter] = useState<FighterSearchResult | null>(initialBlueFighter);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (redFighter) {
      params.set("red", String(redFighter.id));
    }
    if (blueFighter) {
      params.set("blue", String(blueFighter.id));
    }
    router.replace(`/predict${params.toString() ? `?${params.toString()}` : ""}`);
  }, [blueFighter, redFighter, router]);

  const canPredict = Boolean(redFighter && blueFighter && redFighter.id !== blueFighter.id);

  const favorite = useMemo(() => {
    if (!prediction) {
      return null;
    }
    return prediction.redProbability >= prediction.blueProbability ? "red" : "blue";
  }, [prediction]);

  async function handlePredict() {
    if (!canPredict || !redFighter || !blueFighter) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redFighterId: redFighter.id,
          blueFighterId: blueFighter.id,
        }),
      });

      const data = (await response.json()) as PredictionResponse | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "La predicción falló.");
      }

      setPrediction(data);
    } catch (caughtError) {
      setPrediction(null);
      setError(caughtError instanceof Error ? caughtError.message : "La predicción falló.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      <Card className="overflow-visible border-border bg-card">
        <CardContent className="space-y-8 p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Phase 4"
              title="Predicción UFC con explicación IA"
              description="Selecciona la esquina roja y azul para ejecutar el modelo entrenado, revisar los factores clave del matchup y leer una explicación en español."
            />
            <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              La URL se actualiza automáticamente para compartir el enfrentamiento.
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <FighterSearchCombobox
              label="Esquina roja"
              value={redFighter}
              onSelect={setRedFighter}
              excludeId={blueFighter?.id}
            />
            <div className="flex justify-center pb-2">
              <Button
                type="button"
                onClick={handlePredict}
                disabled={!canPredict || loading}
                className="h-12 rounded-2xl bg-primary px-6 text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Brain />}
                {loading ? "Prediciendo..." : "Predecir"}
              </Button>
            </div>
            <FighterSearchCombobox
              label="Esquina azul"
              value={blueFighter}
              onSelect={setBlueFighter}
              excludeId={redFighter?.id}
            />
          </div>
          {error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {prediction && redFighter && blueFighter ? (
        <>
          {prediction.context.weightClass ? (
            <div className="flex justify-center">
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-4 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {formatWeightClass(prediction.context.weightClass)}
              </span>
            </div>
          ) : null}
          <section className="grid gap-6 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
            <Card className="border-border bg-card">
              <CardContent className="space-y-6 p-6">
                <div className="flex flex-col items-center gap-4 text-center xl:items-start xl:text-left">
                  <FighterHeadshot
                    name={prediction.fighters.red.name}
                    headshotUrl={prediction.fighters.red.headshot_url}
                    size="xl"
                    priority
                    className="border-corner-red/20 bg-muted"
                    imageClassName="object-contain object-top"
                  />
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-corner-red">
                      Esquina roja
                    </p>
                    <p className="text-3xl font-semibold tracking-tight text-foreground">
                      {prediction.fighters.red.name}
                    </p>
                    <p className="text-muted-foreground">
                      {prediction.fighters.red.nickname
                        ? `"${prediction.fighters.red.nickname}"`
                        : "Sin apodo registrado"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Badge className="border-corner-red/20 bg-corner-red/10 text-corner-red">
                    {formatRecord(
                      prediction.fighters.red.wins,
                      prediction.fighters.red.losses,
                      prediction.fighters.red.draws,
                    )}
                  </Badge>
                  {favorite === "red" ? (
                    <Badge className="border-win/20 bg-win/10 text-win">
                      Favorito del modelo
                    </Badge>
                  ) : null}
                </div>
                <ProbabilityBar
                  label="Probabilidad de victoria"
                  value={prediction.redProbability}
                  colorClass="bg-corner-red"
                />
              </CardContent>
            </Card>

            <div className="flex items-center justify-center">
              <div className="flex min-h-24 min-w-24 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-6 text-center shadow-xl">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
                    Modelo
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">VS</p>
                </div>
              </div>
            </div>

            <Card className="border-border bg-card">
              <CardContent className="space-y-6 p-6">
                <div className="flex flex-col items-center gap-4 text-center xl:items-end xl:text-right">
                  <FighterHeadshot
                    name={prediction.fighters.blue.name}
                    headshotUrl={prediction.fighters.blue.headshot_url}
                    size="xl"
                    priority
                    className="border-corner-blue/20 bg-muted"
                    imageClassName="object-contain object-top"
                  />
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-corner-blue">
                      Esquina azul
                    </p>
                    <p className="text-3xl font-semibold tracking-tight text-foreground">
                      {prediction.fighters.blue.name}
                    </p>
                    <p className="text-muted-foreground">
                      {prediction.fighters.blue.nickname
                        ? `"${prediction.fighters.blue.nickname}"`
                        : "Sin apodo registrado"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 xl:justify-end">
                  <Badge className="border-corner-blue/20 bg-corner-blue/10 text-corner-blue">
                    {formatRecord(
                      prediction.fighters.blue.wins,
                      prediction.fighters.blue.losses,
                      prediction.fighters.blue.draws,
                    )}
                  </Badge>
                  {favorite === "blue" ? (
                    <Badge className="border-win/20 bg-win/10 text-win">
                      Favorito del modelo
                    </Badge>
                  ) : null}
                </div>
                <ProbabilityBar
                  label="Probabilidad de victoria"
                  value={prediction.blueProbability}
                  colorClass="bg-corner-blue"
                />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <TrendingUp className="size-5 text-primary" />
                  Factores clave del modelo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {prediction.topFeatures.map((feature) => (
                  <div
                    key={feature.name}
                    className="rounded-2xl border border-border bg-muted p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-foreground">{humanizeFeatureName(feature.name)}</p>
                        <p className="text-sm text-muted-foreground">
                          Valor diferencial: {formatFeatureValue(feature.value)}
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        Impacto {feature.impact.toFixed(3)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Sparkles className="size-5 text-primary" />
                  Explicación IA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border bg-muted p-5 text-sm leading-7 text-muted-foreground whitespace-pre-line">
                  {prediction.explanation}
                </div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  Fuente: {prediction.explanationSource === "anthropic" ? "Claude" : "Resumen local"}
                </p>
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary">
              <Swords className="size-7" />
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-semibold text-foreground">Construye tu predicción</p>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Elige dos peleadores para calcular probabilidades de victoria, revisar los factores
                más influyentes y obtener una explicación generada por IA.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}