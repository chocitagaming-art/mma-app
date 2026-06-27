"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FighterSearchCombobox } from "@/components/fighter-search-combobox";
import { StrikeSilhouette } from "@/components/fighter/strike-silhouette";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMethod, formatWeightClass } from "@/lib/format";
import type { PredictionResponse } from "@/lib/prediction";
import type {
  FighterComparisonDetail,
  FighterSearchResult,
} from "@/lib/types";

import { CornerBlock } from "@/components/matchup/corner-cards";
import { PredictionSection } from "@/components/matchup/prediction-section";
import { buildTaleRows, TaleStatRow } from "@/components/matchup/tale-of-tape";

type MatchupClientProps = {
  initialRedFighter: FighterSearchResult | null;
  initialBlueFighter: FighterSearchResult | null;
  comparison: FighterComparisonDetail | null;
};

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
                Comparativa · promedios por pelea
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
          <PredictionSection
            loading={loading}
            unavailable={unavailable}
            error={error}
            prediction={prediction}
            favorite={favorite}
            showPrediction={showPrediction}
            handlePredict={handlePredict}
          />
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
