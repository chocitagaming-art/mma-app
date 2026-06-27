"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, Info, Loader2, Sparkles, Swords, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { FighterSearchCombobox } from "@/components/fighter-search-combobox";
import { StrikeSilhouette } from "@/components/fighter/strike-silhouette";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatControlTime,
  formatDate,
  formatHeight,
  formatMethod,
  formatPercentage,
  formatReach,
  formatModelDate,
  formatRecord,
  formatWeightClass,
} from "@/lib/format";
import type { FighterHistorySummary, PredictionResponse } from "@/lib/prediction";
import type {
  FighterComparisonDetail,
  FighterComparisonProfile,
  FighterSearchResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// Production-equivalent accuracy of the retrained model (0.629). Single source
// of truth so the pre/post-prediction copy never drifts.
const MODEL_ACCURACY_LABEL = "~63%";

type MatchupClientProps = {
  initialRedFighter: FighterSearchResult | null;
  initialBlueFighter: FighterSearchResult | null;
  comparison: FighterComparisonDetail | null;
};

type TaleRow = {
  label: string;
  red: string;
  blue: string;
  redNum?: number | null;
  blueNum?: number | null;
};

function formatAverage(value: number) {
  return value.toFixed(1);
}

function humanizeFeatureName(name: string) {
  return name
    .replace(/_diff$/u, "")
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

// Spanish labels for the model's feature names (the model uses red-blue diffs;
// feature.name carries the _diff suffix). Falls back to humanize for new keys.
const FEATURE_LABELS_ES: Record<string, string> = {
  height_cm: "Altura",
  reach_cm: "Alcance",
  age: "Edad",
  sig_strikes_landed_per_fight: "Golpes significativos por pelea",
  sig_strike_accuracy: "Precisión de golpeo",
  knockdowns_per_fight: "Knockdowns por pelea",
  takedowns_landed_per_fight: "Derribos por pelea",
  takedown_accuracy: "Precisión de derribo",
  control_time_seconds_per_fight: "Tiempo de control por pelea",
  wins_last_5: "Victorias en las últimas 5",
  total_prior_fights: "Experiencia (peleas previas)",
  total_rounds_fought: "Asaltos disputados",
  pct_wins_by_ko: "Victorias por KO (%)",
  days_since_last_fight: "Días desde la última pelea",
  ranking_position: "Posición en el ranking",
  sig_strikes_absorbed_per_fight: "Golpes recibidos por pelea",
  sig_strike_defense: "Defensa de golpeo",
  takedowns_absorbed_per_fight: "Derribos recibidos por pelea",
  takedown_defense: "Defensa de derribo",
  avg_opponent_prior_win_rate: "Calidad del rival",
};

function featureLabel(name: string) {
  const key = name.replace(/_diff$/u, "");
  return FEATURE_LABELS_ES[key] ?? humanizeFeatureName(name);
}

function formatFeatureValue(value: number | null) {
  if (value === null) {
    return "N/D";
  }
  return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function buildTaleRows(
  red: FighterComparisonProfile,
  blue: FighterComparisonProfile,
): TaleRow[] {
  return [
    {
      label: "Récord",
      red: formatRecord(red.wins, red.losses, red.draws),
      blue: formatRecord(blue.wins, blue.losses, blue.draws),
      redNum: red.wins,
      blueNum: blue.wins,
    },
    {
      label: "Altura",
      red: formatHeight(red.heightCm),
      blue: formatHeight(blue.heightCm),
      redNum: red.heightCm,
      blueNum: blue.heightCm,
    },
    {
      label: "Alcance",
      red: formatReach(red.reachCm),
      blue: formatReach(blue.reachCm),
      redNum: red.reachCm,
      blueNum: blue.reachCm,
    },
    {
      label: "Guardia",
      red: red.stance ?? "—",
      blue: blue.stance ?? "—",
    },
    {
      label: "Golpes sig. / pelea",
      red: formatAverage(red.aggregateStats.sigStrikesLandedPerFight),
      blue: formatAverage(blue.aggregateStats.sigStrikesLandedPerFight),
      redNum: red.aggregateStats.sigStrikesLandedPerFight,
      blueNum: blue.aggregateStats.sigStrikesLandedPerFight,
    },
    {
      label: "Precisión golpes",
      red: formatPercentage(red.aggregateStats.sigStrikeAccuracy),
      blue: formatPercentage(blue.aggregateStats.sigStrikeAccuracy),
      redNum: red.aggregateStats.sigStrikeAccuracy,
      blueNum: blue.aggregateStats.sigStrikeAccuracy,
    },
    {
      label: "Knockdowns / pelea",
      red: formatAverage(red.aggregateStats.knockdownsPerFight),
      blue: formatAverage(blue.aggregateStats.knockdownsPerFight),
      redNum: red.aggregateStats.knockdownsPerFight,
      blueNum: blue.aggregateStats.knockdownsPerFight,
    },
    {
      label: "Derribos / pelea",
      red: formatAverage(red.aggregateStats.takedownsLandedPerFight),
      blue: formatAverage(blue.aggregateStats.takedownsLandedPerFight),
      redNum: red.aggregateStats.takedownsLandedPerFight,
      blueNum: blue.aggregateStats.takedownsLandedPerFight,
    },
    {
      label: "Precisión derribos",
      red: formatPercentage(red.aggregateStats.takedownAccuracy),
      blue: formatPercentage(blue.aggregateStats.takedownAccuracy),
      redNum: red.aggregateStats.takedownAccuracy,
      blueNum: blue.aggregateStats.takedownAccuracy,
    },
    {
      label: "Sumisiones int. / pelea",
      red: formatAverage(red.aggregateStats.submissionAttemptsPerFight),
      blue: formatAverage(blue.aggregateStats.submissionAttemptsPerFight),
      redNum: red.aggregateStats.submissionAttemptsPerFight,
      blueNum: blue.aggregateStats.submissionAttemptsPerFight,
    },
    {
      label: "Tiempo control / pelea",
      red: formatControlTime(
        Math.round(red.aggregateStats.controlTimePerFightSeconds),
      ),
      blue: formatControlTime(
        Math.round(blue.aggregateStats.controlTimePerFightSeconds),
      ),
      redNum: red.aggregateStats.controlTimePerFightSeconds,
      blueNum: blue.aggregateStats.controlTimePerFightSeconds,
    },
  ];
}

function TaleStatRow({ row }: { row: TaleRow }) {
  const both = row.redNum != null && row.blueNum != null;
  const redBetter = both && (row.redNum as number) > (row.blueNum as number);
  const blueBetter = both && (row.blueNum as number) > (row.redNum as number);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border py-3 last:border-b-0">
      <p
        className={cn(
          "tabular text-right font-display text-lg font-bold leading-none sm:text-xl",
          redBetter ? "text-corner-red" : "text-foreground",
        )}
      >
        {row.red}
      </p>
      <p className="w-28 text-center font-mono text-[0.65rem] uppercase leading-tight tracking-[0.12em] text-muted-foreground sm:w-40 sm:text-[0.7rem]">
        {row.label}
      </p>
      <p
        className={cn(
          "tabular text-left font-display text-lg font-bold leading-none sm:text-xl",
          blueBetter ? "text-corner-blue" : "text-foreground",
        )}
      >
        {row.blue}
      </p>
    </div>
  );
}

function CornerBlock({
  corner,
  fighter,
}: {
  corner: "red" | "blue";
  fighter: FighterComparisonProfile;
}) {
  const isRed = corner === "red";
  return (
    <div
      className={cn(
        "flex items-center gap-3 sm:gap-4",
        isRed ? "flex-row" : "flex-row sm:flex-row-reverse",
      )}
    >
      <Link
        href={`/fighters/${fighter.id}`}
        className="shrink-0 transition-opacity hover:opacity-80"
      >
        <FighterHeadshot
          name={fighter.name}
          headshotUrl={fighter.headshotUrl}
          size="lg"
          priority
          className={cn(
            "aspect-square border-2 bg-muted",
            isRed ? "border-corner-red" : "border-corner-blue",
          )}
          imageClassName="object-cover object-top"
        />
      </Link>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1.5",
          isRed ? "items-start text-left" : "items-start text-left sm:items-end sm:text-right",
        )}
      >
        <span
          className={cn(
            "font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em]",
            isRed ? "text-corner-red" : "text-corner-blue",
          )}
        >
          Esquina {isRed ? "roja" : "azul"}
        </span>
        <Link
          href={`/fighters/${fighter.id}`}
          className="font-display text-2xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground transition-colors hover:text-primary sm:text-3xl"
        >
          {fighter.name}
        </Link>
        <p className="tabular font-mono text-sm text-muted-foreground">
          {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
        </p>
        <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          {formatWeightClass(fighter.latestWeightClass ?? "Open Weight")}
        </span>
      </div>
    </div>
  );
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
        <p className="tabular text-base font-semibold text-foreground">
          {formatPercentage(value)}
        </p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        />
      </div>
    </div>
  );
}

function formatSignalPercent(value: number | null) {
  return value === null ? "N/D" : formatPercentage(value);
}

// Señales que YA calcula el modelo por esquina (context.redHistory/blueHistory),
// no diffs. Se diferencian visualmente de "Factores clave" (que son red-blue).
function CornerSignals({
  corner,
  name,
  history,
}: {
  corner: "red" | "blue";
  name: string;
  history: FighterHistorySummary;
}) {
  const isRed = corner === "red";
  const rows: { label: string; value: string }[] = [
    { label: "Racha de victorias", value: `${history.win_streak}` },
    { label: "Victorias (últ. 5)", value: `${history.wins_last_5} / 5` },
    {
      label: "Calidad del rival",
      value: formatSignalPercent(history.avg_opponent_prior_win_rate),
    },
  ];
  if (history.sig_strike_defense != null) {
    rows.push({
      label: "Defensa de golpeo",
      value: formatPercentage(history.sig_strike_defense),
    });
  }
  if (history.takedown_defense != null) {
    rows.push({
      label: "Defensa de derribo",
      value: formatPercentage(history.takedown_defense),
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-muted/40 p-5",
        isRed ? "border-corner-red/30" : "border-corner-blue/30",
      )}
    >
      <p
        className={cn(
          "font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em]",
          isRed ? "text-corner-red" : "text-corner-blue",
        )}
      >
        Esquina {isRed ? "roja" : "azul"}
      </p>
      <p className="mt-1 font-display text-lg font-bold uppercase leading-tight tracking-tight text-foreground">
        {name}
      </p>
      <dl className="mt-4 space-y-2.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-border/60 pb-2.5 last:border-b-0 last:pb-0"
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="tabular text-sm font-semibold text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MatchupClient({
  initialRedFighter,
  initialBlueFighter,
  comparison,
}: MatchupClientProps) {
  const router = useRouter();
  const [redFighter, setRedFighter] = useState<FighterSearchResult | null>(
    initialRedFighter,
  );
  const [blueFighter, setBlueFighter] = useState<FighterSearchResult | null>(
    initialBlueFighter,
  );
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Separate, non-destructive state for a 503 (service down) so we can show a
  // calm "unavailable" message and stop users hammering a dead service.
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (redFighter) {
      params.set("red", String(redFighter.id));
    }
    if (blueFighter) {
      params.set("blue", String(blueFighter.id));
    }
    const query = params.toString();
    const nextUrl = `/enfrentamiento${query ? `?${query}` : ""}`;
    // En el montaje la URL ya coincide con las esquinas iniciales; evitamos el
    // router.replace redundante para no provocar una navegación de más (#66).
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl === currentUrl) {
      return;
    }
    router.replace(nextUrl);
  }, [blueFighter, redFighter, router]);

  // Changing a corner invalidates the previous outcome: re-enable the Predecir
  // button and clear any stale error / unavailable banner. Done in the select
  // handlers (not an effect) to avoid a cascading setState-in-effect.
  function handleSelectRed(next: FighterSearchResult | null) {
    setRedFighter(next);
    setError(null);
    setUnavailable(false);
  }

  function handleSelectBlue(next: FighterSearchResult | null) {
    setBlueFighter(next);
    setError(null);
    setUnavailable(false);
  }

  const canMatchup = Boolean(
    redFighter && blueFighter && redFighter.id !== blueFighter.id,
  );
  // The server-provided comparison stays valid only while the selected corners
  // still match the ids it was built for.
  const detail =
    comparison &&
    redFighter?.id === comparison.fighterA.id &&
    blueFighter?.id === comparison.fighterB.id
      ? comparison
      : null;

  const taleRows = useMemo(
    () => (detail ? buildTaleRows(detail.fighterA, detail.fighterB) : []),
    [detail],
  );

  const matchupSummary = useMemo(() => {
    if (!detail) {
      return null;
    }

    const redWins = detail.directMatchups.filter(
      (fight) => fight.winnerId === detail.fighterA.id,
    ).length;
    const blueWins = detail.directMatchups.filter(
      (fight) => fight.winnerId === detail.fighterB.id,
    ).length;
    const draws = detail.directMatchups.filter(
      (fight) => fight.winnerId === null,
    ).length;

    return { redWins, blueWins, draws };
  }, [detail]);

  const favorite = useMemo(() => {
    if (!prediction) {
      return null;
    }
    return prediction.redProbability >= prediction.blueProbability
      ? "red"
      : "blue";
  }, [prediction]);

  async function handlePredict() {
    if (!canMatchup || !redFighter || !blueFighter) {
      return;
    }

    setLoading(true);
    setError(null);
    setUnavailable(false);

    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redFighterId: redFighter.id,
          blueFighterId: blueFighter.id,
        }),
      });

      // 503 = service not deployed / unreachable. Treat it as a neutral
      // "not available" state, not a hard error.
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

  const showPrediction = Boolean(
    prediction &&
      redFighter &&
      blueFighter &&
      prediction.fighters.red.id === redFighter.id &&
      prediction.fighters.blue.id === blueFighter.id,
  );

  return (
    <div className="space-y-10">
      <Card className="overflow-visible border-border bg-card">
        <CardContent className="space-y-8 p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Cara a cara"
              title="Arma tu enfrentamiento UFC"
              description="Fija las esquinas roja y azul para ver al instante el cara a cara con récords, físico, golpeo y grappling. Después dispara la predicción de IA."
            />
            <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              La URL compartible se actualiza automáticamente mientras eliges.
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <FighterSearchCombobox
              label="Esquina roja"
              value={redFighter}
              onSelect={handleSelectRed}
              excludeId={blueFighter?.id}
            />
            <div className="flex justify-center pb-2">
              <div className="octagon grid size-12 place-items-center bg-foreground font-display text-sm font-extrabold uppercase tracking-tight text-background">
                VS
              </div>
            </div>
            <FighterSearchCombobox
              label="Esquina azul"
              value={blueFighter}
              onSelect={handleSelectBlue}
              excludeId={redFighter?.id}
            />
          </div>
        </CardContent>
      </Card>

      {canMatchup && detail ? (
        <>
          {/* Tale of the tape — shown instantly once both corners are set */}
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="relative flex flex-col gap-5 border-b border-border p-6 sm:grid sm:grid-cols-2 sm:gap-10 sm:p-8">
              <span className="absolute inset-y-0 left-0 hidden w-1 bg-corner-red sm:block" />
              <span className="absolute inset-y-0 right-0 hidden w-1 bg-corner-blue sm:block" />
              <span className="octagon absolute left-1/2 top-1/2 z-10 hidden size-12 -translate-x-1/2 -translate-y-1/2 place-items-center bg-foreground font-display text-sm font-extrabold uppercase tracking-tight text-background sm:grid">
                VS
              </span>
              <CornerBlock corner="red" fighter={detail.fighterA} />
              <CornerBlock corner="blue" fighter={detail.fighterB} />
            </div>

            <div className="p-6 sm:p-8">
              <p className="mb-4 text-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Tale of the tape · promedios por pelea
              </p>
              <div className="mx-auto max-w-xl">
                {taleRows.map((row) => (
                  <TaleStatRow key={row.label} row={row} />
                ))}
              </div>
            </div>
          </section>

          {/* Strike silhouettes — instant, no prediction needed */}
          <section className="space-y-6">
            <SectionHeading
              eyebrow="Golpeo"
              title="Silueta de golpes"
              description="Dónde conecta y dónde recibe cada peleador, por zona y posición, según su historial registrado."
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-corner-red">
                  {detail.fighterA.name}
                </p>
                <StrikeSilhouette
                  profile={detail.fighterA.strikeProfile}
                  showHeader={false}
                />
              </div>
              <div className="space-y-3">
                <p className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-corner-blue">
                  {detail.fighterB.name}
                </p>
                <StrikeSilhouette
                  profile={detail.fighterB.strikeProfile}
                  showHeader={false}
                />
              </div>
            </div>
          </section>

          {/* Direct matchup history */}
          <section className="space-y-6">
            <SectionHeading
              eyebrow="Historial directo"
              title="Enfrentamientos previos"
              description="Cada pelea registrada en la que estos dos luchadores compartieron la jaula."
            />
            {matchupSummary && detail.directMatchups.length ? (
              <Card className="border-border bg-primary/5">
                <CardContent className="grid gap-4 p-6 md:grid-cols-3 md:items-center">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.3em] text-corner-red">
                      {detail.fighterA.name}
                    </p>
                    <p className="tabular mt-2 font-display text-3xl font-bold text-foreground">
                      {matchupSummary.redWins}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.35em] text-primary">
                      Cara a cara
                    </p>
                    <p className="mt-2 text-lg text-muted-foreground">
                      {matchupSummary.draws} empate
                      {matchupSummary.draws === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="font-mono text-xs uppercase tracking-[0.3em] text-corner-blue">
                      {detail.fighterB.name}
                    </p>
                    <p className="tabular mt-2 font-display text-3xl font-bold text-foreground">
                      {matchupSummary.blueWins}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            <div className="grid gap-4">
              {detail.directMatchups.length ? (
                detail.directMatchups.map((fight) => (
                  <Link key={fight.fightId} href={`/fights/${fight.fightId}`}>
                    <Card className="border-border bg-card transition hover:border-primary/30 hover:bg-accent">
                      <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              variant="secondary"
                              className="bg-muted text-muted-foreground"
                            >
                              {fight.weightClass
                                ? formatWeightClass(fight.weightClass)
                                : "Categoría no disponible"}
                            </Badge>
                            <Badge className="border-primary/20 bg-primary/10 text-primary">
                              {fight.winnerId === detail.fighterA.id
                                ? `Ganó ${detail.fighterA.name}`
                                : fight.winnerId === detail.fighterB.id
                                  ? `Ganó ${detail.fighterB.name}`
                                  : "Empate / Sin resultado"}
                            </Badge>
                          </div>
                          <p className="text-lg font-semibold text-foreground">
                            {fight.eventName ?? "Evento desconocido"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(fight.eventDate)} ·{" "}
                            {fight.method ? formatMethod(fight.method) : "Método no disponible"} · Asalto{" "}
                            {fight.endRound ?? "—"} · {fight.endTime ?? "—"}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-primary">
                          Abrir detalles de la pelea →
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              ) : (
                <Card className="border-dashed border-border bg-card">
                  <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
                    <Swords className="size-8 text-muted-foreground" />
                    <div className="space-y-2">
                      <p className="text-2xl font-semibold text-foreground">
                        No se encontraron peleas directas
                      </p>
                      <p className="max-w-xl text-sm text-muted-foreground">
                        Estos luchadores no tienen un enfrentamiento directo
                        registrado en la base de datos actual.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          {/* AI prediction — triggered on demand (slow Python model) */}
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
        </>
      ) : (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary">
              <Swords className="size-7" />
            </div>
            <div className="space-y-2">
              <p className="font-display text-3xl font-bold text-foreground">
                Construye tu enfrentamiento
              </p>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Elige dos luchadores para desbloquear el cara a cara con récords,
                herramientas físicas, golpeo y grappling, además del historial
                directo y la predicción de IA.
              </p>
            </div>
            <Link href="/fighters">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Ver la plantilla
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
