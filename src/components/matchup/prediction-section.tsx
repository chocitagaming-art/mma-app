import { Brain, Info, Loader2, Sparkles, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatModelDate, formatWeightClass } from "@/lib/format";
import type { PredictionResponse } from "@/lib/prediction";
import { cn } from "@/lib/utils";

import { CornerSignals } from "./corner-cards";
import {
  featureLabel,
  formatFeatureValue,
  MODEL_ACCURACY_LABEL,
} from "./helpers";
import { ProbabilityBar } from "./probability-bar";

type PredictionSectionProps = {
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  prediction: PredictionResponse | null;
  favorite: "red" | "blue" | null;
  showPrediction: boolean;
  handlePredict: () => void;
};

export function PredictionSection({
  loading,
  unavailable,
  error,
  prediction,
  favorite,
  showPrediction,
  handlePredict,
}: PredictionSectionProps) {
  return (
    <section className="space-y-6">
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center gap-5 p-6 text-center sm:p-8">
          <div className="space-y-1.5">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Predicción IA
            </p>
            <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight text-foreground sm:text-4xl">
              ¿Quién gana este enfrentamiento?
            </h2>
            <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Ejecuta el modelo entrenado para obtener probabilidades por
              esquina, los factores más influyentes y una explicación en
              español.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            <Info className="size-3.5 text-primary" />
            Precisión del modelo {MODEL_ACCURACY_LABEL} · estimación con incertidumbre
          </div>
          <Button
            type="button"
            onClick={handlePredict}
            disabled={loading}
            className="h-12 rounded-2xl bg-primary px-6 text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : unavailable ? (
              <Info />
            ) : (
              <Brain />
            )}
            {loading
              ? "Prediciendo..."
              : unavailable
                ? "Reintentar"
                : "Predecir resultado"}
          </Button>
          {unavailable ? (
            <div className="flex w-full items-start gap-3 rounded-2xl border border-border bg-muted px-4 py-3 text-left text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-semibold text-foreground">
                  Predicción no disponible por ahora.
                </span>{" "}
                El servicio de predicción está fuera de línea
                temporalmente. Vuelve a intentarlo más tarde.
              </span>
            </div>
          ) : null}
          {error ? (
            <div className="w-full rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {showPrediction && prediction ? (
        <>
          {prediction.context.weightClass ? (
            <div className="flex justify-center">
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-4 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {formatWeightClass(prediction.context.weightClass)}
              </span>
            </div>
          ) : null}
          {prediction.lowConfidence ? (
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
                <Info className="size-3.5" />
                Baja confianza · datos insuficientes
              </span>
            </div>
          ) : null}
          <div
            className={cn(
              "mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-6 text-muted-foreground",
              prediction.lowConfidence
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-border bg-muted",
            )}
          >
            <Info
              className={cn(
                "mt-0.5 size-4 shrink-0",
                prediction.lowConfidence
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-primary",
              )}
            />
            {prediction.lowConfidence ? (
              <span>
                <span className="font-semibold text-foreground">
                  Estimación de referencia.
                </span>{" "}
                Uno de los peleadores no tiene suficiente historial de
                combates, así que el modelo no puede inclinar la balanza:
                trata este resultado como una base cercana al 50/50, no
                como un favorito real.
              </span>
            ) : (
              <span>
                <span className="font-semibold text-foreground">
                  Precisión del modelo {MODEL_ACCURACY_LABEL}.
                </span>{" "}
                Estas probabilidades son una estimación con incertidumbre,
                no una certeza: en MMA hasta un favorito claro puede caer.
              </span>
            )}
          </div>
          {prediction.modelTrainedAt ? (
            <p className="text-center font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              Modelo entrenado el {formatModelDate(prediction.modelTrainedAt)}
            </p>
          ) : null}
          <div className="grid gap-6 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
            <Card className="border-border bg-card">
              <CardContent className="space-y-6 p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-corner-red">
                    Esquina roja
                  </p>
                  {!prediction.lowConfidence && favorite === "red" ? (
                    <Badge className="border-win/20 bg-win/10 text-win">
                      Favorito del modelo
                    </Badge>
                  ) : null}
                </div>
                <p className="font-display text-2xl font-extrabold uppercase leading-none tracking-tight text-foreground">
                  {prediction.fighters.red.name}
                </p>
                <ProbabilityBar
                  label="Probabilidad de victoria"
                  value={prediction.redProbability}
                  colorClass={
                    prediction.lowConfidence
                      ? "bg-corner-red/40"
                      : "bg-corner-red"
                  }
                />
              </CardContent>
            </Card>

            <div className="flex items-center justify-center">
              <div className="octagon grid size-14 place-items-center bg-foreground font-display text-base font-extrabold uppercase tracking-tight text-background">
                VS
              </div>
            </div>

            <Card className="border-border bg-card">
              <CardContent className="space-y-6 p-6">
                <div className="flex items-center justify-between gap-3">
                  {!prediction.lowConfidence && favorite === "blue" ? (
                    <Badge className="border-win/20 bg-win/10 text-win">
                      Favorito del modelo
                    </Badge>
                  ) : (
                    <span />
                  )}
                  <p className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-corner-blue">
                    Esquina azul
                  </p>
                </div>
                <p className="text-right font-display text-2xl font-extrabold uppercase leading-none tracking-tight text-foreground">
                  {prediction.fighters.blue.name}
                </p>
                <ProbabilityBar
                  label="Probabilidad de victoria"
                  value={prediction.blueProbability}
                  colorClass={
                    prediction.lowConfidence
                      ? "bg-corner-blue/40"
                      : "bg-corner-blue"
                  }
                />
              </CardContent>
            </Card>
          </div>

          {prediction.context.redHistory &&
          prediction.context.blueHistory ? (
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <TrendingUp className="size-5 text-primary" />
                  Señales por esquina
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Indicadores propios de cada peleador (no son diferencias
                  entre esquinas). &quot;Calidad del rival&quot; es el % medio de
                  victorias de los oponentes que ha enfrentado.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <CornerSignals
                  corner="red"
                  name={prediction.fighters.red.name}
                  history={prediction.context.redHistory}
                />
                <CornerSignals
                  corner="blue"
                  name={prediction.fighters.blue.name}
                  history={prediction.context.blueHistory}
                />
              </CardContent>
              {prediction.context.matchupDate ? (
                <p className="px-6 pb-5 text-center font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                  Señales calculadas a fecha de{" "}
                  {formatModelDate(prediction.context.matchupDate)}
                </p>
              ) : null}
            </Card>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <TrendingUp className="size-5 text-primary" />
                  Factores clave del modelo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {prediction.topFeatures.map((feature) => {
                  const favoursRed = feature.direction === "red";
                  const favouredName = favoursRed
                    ? prediction.fighters.red.name
                    : prediction.fighters.blue.name;
                  return (
                    <div
                      key={feature.name}
                      className="rounded-2xl border border-border bg-muted p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-foreground">
                            {featureLabel(feature.name)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Favorece a{" "}
                            <span
                              className={cn(
                                "font-semibold",
                                favoursRed
                                  ? "text-corner-red"
                                  : "text-corner-blue",
                              )}
                            >
                              {favouredName}
                            </span>{" "}
                            · valor {formatFeatureValue(feature.value)}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            favoursRed
                              ? "bg-corner-red/10 text-corner-red"
                              : "bg-corner-blue/10 text-corner-blue",
                          )}
                        >
                          {favoursRed ? "Roja" : "Azul"} +
                          {Math.abs(feature.contribution).toFixed(2)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
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
                <div className="whitespace-pre-line rounded-2xl border border-border bg-muted p-5 text-sm leading-7 text-muted-foreground">
                  {prediction.explanation}
                </div>
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  Fuente:{" "}
                  {prediction.explanationSource === "anthropic"
                    ? "Claude"
                    : "Resumen local"}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </section>
  );
}
