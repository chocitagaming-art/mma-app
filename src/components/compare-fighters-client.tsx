"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ComparisonStatRow } from "@/components/comparison-stat-row";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { FighterSearchCombobox } from "@/components/fighter-search-combobox";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  formatControlTime,
  formatDate,
  formatHeight,
  formatPercentage,
  formatReach,
  formatRecord,
  formatWeight,
  formatWeightClass,
} from "@/lib/format";
import type {
  FighterComparisonDetail,
  FighterSearchResult,
} from "@/lib/types";

type CompareFightersClientProps = {
  initialFighterA: FighterSearchResult | null;
  initialFighterB: FighterSearchResult | null;
  comparison: FighterComparisonDetail | null;
};

function formatAverage(value: number) {
  return value.toFixed(1);
}

export function CompareFightersClient({
  initialFighterA,
  initialFighterB,
  comparison,
}: CompareFightersClientProps) {
  const router = useRouter();
  const [fighterA, setFighterA] = useState<FighterSearchResult | null>(initialFighterA);
  const [fighterB, setFighterB] = useState<FighterSearchResult | null>(initialFighterB);

  useEffect(() => {
    const params = new URLSearchParams();

    if (fighterA) {
      params.set("a", String(fighterA.id));
    }

    if (fighterB) {
      params.set("b", String(fighterB.id));
    }

    router.replace(`/compare${params.toString() ? `?${params.toString()}` : ""}`);
  }, [fighterA, fighterB, router]);

  const canCompare = Boolean(fighterA && fighterB);
  const detail = comparison;

  const matchupSummary = useMemo(() => {
    if (!detail) {
      return null;
    }

    const fighterAWins = detail.directMatchups.filter(
      (fight) => fight.winnerId === detail.fighterA.id,
    ).length;
    const fighterBWins = detail.directMatchups.filter(
      (fight) => fight.winnerId === detail.fighterB.id,
    ).length;
    const draws = detail.directMatchups.filter((fight) => fight.winnerId === null).length;

    return { fighterAWins, fighterBWins, draws };
  }, [detail]);

  return (
    <div className="space-y-10">
      <Card className="overflow-visible border-border bg-card">
        <CardContent className="space-y-8 p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Cara a cara"
              title="Comparar dos luchadores de UFC"
              description="Busca en la plantilla, fija ambas esquinas y analiza golpeo, grappling e historial directo de enfrentamientos lado a lado."
            />
            <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              La URL compartible se actualiza automáticamente mientras comparas.
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <FighterSearchCombobox
              label="Luchador A"
              value={fighterA}
              onSelect={setFighterA}
              excludeId={fighterB?.id}
            />
            <div className="flex justify-center pb-2">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-lg">
                <ArrowRightLeft className="size-5" />
              </div>
            </div>
            <FighterSearchCombobox
              label="Luchador B"
              value={fighterB}
              onSelect={setFighterB}
              excludeId={fighterA?.id}
            />
          </div>
        </CardContent>
      </Card>

      {canCompare && detail ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
            <Card className="border-border bg-card">
              <CardContent className="space-y-6 p-6">
                <div className="flex flex-col items-center gap-4 text-center xl:items-start xl:text-left">
                  <FighterHeadshot
                    name={detail.fighterA.name}
                    headshotUrl={detail.fighterA.headshotUrl}
                    size="xl"
                    priority
                    className="border-corner-red bg-muted"
                    imageClassName="object-contain object-top"
                  />
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-corner-red">
                      Luchador A
                    </p>
                    <Link
                      href={`/fighters/${detail.fighterA.id}`}
                      className="text-3xl font-semibold tracking-tight text-foreground transition hover:text-corner-red"
                    >
                      {detail.fighterA.name}
                    </Link>
                    <p className="text-muted-foreground">
                      {detail.fighterA.nickname
                        ? `"${detail.fighterA.nickname}"`
                        : "Sin apodo registrado"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Badge className="border-primary/20 bg-primary/10 text-primary">
                    {formatRecord(
                      detail.fighterA.wins,
                      detail.fighterA.losses,
                      detail.fighterA.draws,
                    )}
                  </Badge>
                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                    {detail.fighterA.stance ?? "Unknown stance"}
                  </Badge>
                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                    {formatWeightClass(detail.fighterA.latestWeightClass ?? "Open Weight")}
                  </Badge>
                </div>
                <Separator className="bg-border" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Altura
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatHeight(detail.fighterA.heightCm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Alcance
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatReach(detail.fighterA.reachCm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Nacionalidad
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {detail.fighterA.nationality ?? "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Peleas registradas
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {detail.fighterA.fightCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-center">
              <div className="flex min-h-24 min-w-24 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-6 text-center shadow-xl">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
                    Comparativa física
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">VS</p>
                </div>
              </div>
            </div>

            <Card className="border-border bg-card">
              <CardContent className="space-y-6 p-6">
                <div className="flex flex-col items-center gap-4 text-center xl:items-end xl:text-right">
                  <FighterHeadshot
                    name={detail.fighterB.name}
                    headshotUrl={detail.fighterB.headshotUrl}
                    size="xl"
                    priority
                    className="border-corner-blue bg-muted"
                    imageClassName="object-contain object-top"
                  />
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-corner-blue">
                      Luchador B
                    </p>
                    <Link
                      href={`/fighters/${detail.fighterB.id}`}
                      className="text-3xl font-semibold tracking-tight text-foreground transition hover:text-corner-blue"
                    >
                      {detail.fighterB.name}
                    </Link>
                    <p className="text-muted-foreground">
                      {detail.fighterB.nickname
                        ? `"${detail.fighterB.nickname}"`
                        : "Sin apodo registrado"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 xl:justify-end">
                  <Badge className="border-primary/20 bg-primary/10 text-primary">
                    {formatRecord(
                      detail.fighterB.wins,
                      detail.fighterB.losses,
                      detail.fighterB.draws,
                    )}
                  </Badge>
                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                    {detail.fighterB.stance ?? "Unknown stance"}
                  </Badge>
                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                    {formatWeightClass(detail.fighterB.latestWeightClass ?? "Open Weight")}
                  </Badge>
                </div>
                <Separator className="bg-border" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Altura
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatHeight(detail.fighterB.heightCm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Alcance
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatReach(detail.fighterB.reachCm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Nacionalidad
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {detail.fighterB.nationality ?? "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Peleas registradas
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {detail.fighterB.fightCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Comparación de récord y físico</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ComparisonStatRow
                  label="Victorias"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.wins}
                  rightValue={detail.fighterB.wins}
                  leftDisplay={String(detail.fighterA.wins)}
                  rightDisplay={String(detail.fighterB.wins)}
                />
                <ComparisonStatRow
                  label="Derrotas"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.losses}
                  rightValue={detail.fighterB.losses}
                  leftDisplay={String(detail.fighterA.losses)}
                  rightDisplay={String(detail.fighterB.losses)}
                  higherIsBetter={false}
                />
                <ComparisonStatRow
                  label="Empates"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.draws}
                  rightValue={detail.fighterB.draws}
                  leftDisplay={String(detail.fighterA.draws)}
                  rightDisplay={String(detail.fighterB.draws)}
                />
                <ComparisonStatRow
                  label="Altura"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.heightCm}
                  rightValue={detail.fighterB.heightCm}
                  leftDisplay={formatHeight(detail.fighterA.heightCm)}
                  rightDisplay={formatHeight(detail.fighterB.heightCm)}
                />
                <ComparisonStatRow
                  label="Alcance"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.reachCm}
                  rightValue={detail.fighterB.reachCm}
                  leftDisplay={formatReach(detail.fighterA.reachCm)}
                  rightDisplay={formatReach(detail.fighterB.reachCm)}
                />
                <ComparisonStatRow
                  label="Peso"
                  leftLabel={detail.fighterA.name}
                  rightLabel={detail.fighterB.name}
                  leftValue={detail.fighterA.weightGrams ?? 0}
                  rightValue={detail.fighterB.weightGrams ?? 0}
                  leftDisplay={formatWeight(detail.fighterA.weightGrams)}
                  rightDisplay={formatWeight(detail.fighterB.weightGrams)}
                />
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">Estadísticas de golpeo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ComparisonStatRow
                    label="Golpes sig. conectados / pelea"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.sigStrikesLandedPerFight}
                    rightValue={detail.fighterB.aggregateStats.sigStrikesLandedPerFight}
                    leftDisplay={formatAverage(
                      detail.fighterA.aggregateStats.sigStrikesLandedPerFight,
                    )}
                    rightDisplay={formatAverage(
                      detail.fighterB.aggregateStats.sigStrikesLandedPerFight,
                    )}
                  />
                  <ComparisonStatRow
                    label="Precisión de golpes sig."
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.sigStrikeAccuracy}
                    rightValue={detail.fighterB.aggregateStats.sigStrikeAccuracy}
                    leftDisplay={formatPercentage(
                      detail.fighterA.aggregateStats.sigStrikeAccuracy,
                    )}
                    rightDisplay={formatPercentage(
                      detail.fighterB.aggregateStats.sigStrikeAccuracy,
                    )}
                  />
                  <ComparisonStatRow
                    label="Knockdowns / pelea"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.knockdownsPerFight}
                    rightValue={detail.fighterB.aggregateStats.knockdownsPerFight}
                    leftDisplay={formatAverage(
                      detail.fighterA.aggregateStats.knockdownsPerFight,
                    )}
                    rightDisplay={formatAverage(
                      detail.fighterB.aggregateStats.knockdownsPerFight,
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">Estadísticas de grappling</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ComparisonStatRow
                    label="Derribos conectados / pelea"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.takedownsLandedPerFight}
                    rightValue={detail.fighterB.aggregateStats.takedownsLandedPerFight}
                    leftDisplay={formatAverage(
                      detail.fighterA.aggregateStats.takedownsLandedPerFight,
                    )}
                    rightDisplay={formatAverage(
                      detail.fighterB.aggregateStats.takedownsLandedPerFight,
                    )}
                  />
                  <ComparisonStatRow
                    label="Precisión de derribos"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.takedownAccuracy}
                    rightValue={detail.fighterB.aggregateStats.takedownAccuracy}
                    leftDisplay={formatPercentage(
                      detail.fighterA.aggregateStats.takedownAccuracy,
                    )}
                    rightDisplay={formatPercentage(
                      detail.fighterB.aggregateStats.takedownAccuracy,
                    )}
                  />
                  <ComparisonStatRow
                    label="Intentos de sumisión / pelea"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.submissionAttemptsPerFight}
                    rightValue={detail.fighterB.aggregateStats.submissionAttemptsPerFight}
                    leftDisplay={formatAverage(
                      detail.fighterA.aggregateStats.submissionAttemptsPerFight,
                    )}
                    rightDisplay={formatAverage(
                      detail.fighterB.aggregateStats.submissionAttemptsPerFight,
                    )}
                  />
                  <ComparisonStatRow
                    label="Tiempo de control / pelea"
                    leftLabel={detail.fighterA.name}
                    rightLabel={detail.fighterB.name}
                    leftValue={detail.fighterA.aggregateStats.controlTimePerFightSeconds}
                    rightValue={detail.fighterB.aggregateStats.controlTimePerFightSeconds}
                    leftDisplay={formatControlTime(
                      Math.round(detail.fighterA.aggregateStats.controlTimePerFightSeconds),
                    )}
                    rightDisplay={formatControlTime(
                      Math.round(detail.fighterB.aggregateStats.controlTimePerFightSeconds),
                    )}
                  />
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-6">
            <SectionHeading
              eyebrow="Historial directo"
              title="Enfrentamientos previos"
              description="Cada pelea registrada en la que estos dos luchadores compartieron la jaula."
            />
            {matchupSummary ? (
              <Card className="border-border bg-primary/5">
                <CardContent className="grid gap-4 p-6 md:grid-cols-3 md:items-center">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-corner-red">
                      {detail.fighterA.name}
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">
                      {matchupSummary.fighterAWins}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
                      Cara a cara
                    </p>
                    <p className="mt-2 text-lg text-muted-foreground">
                      {matchupSummary.draws} empate
                      {matchupSummary.draws === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm uppercase tracking-[0.3em] text-corner-blue">
                      {detail.fighterB.name}
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">
                      {matchupSummary.fighterBWins}
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
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">
                              {fight.weightClass
                                ? formatWeightClass(fight.weightClass)
                                : "Weight class unavailable"}
                            </Badge>
                            <Badge className="border-primary/20 bg-primary/10 text-primary">
                              {fight.winnerId === detail.fighterA.id
                                ? `${detail.fighterA.name} won`
                                : fight.winnerId === detail.fighterB.id
                                  ? `${detail.fighterB.name} won`
                                  : "Draw / No contest"}
                            </Badge>
                          </div>
                          <p className="text-lg font-semibold text-foreground">
                            {fight.eventName ?? "Unknown event"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(fight.eventDate)} · {fight.method ?? "Method unavailable"} ·
                            {" "}Asalto {fight.endRound ?? "—"} · {fight.endTime ?? "—"}
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
                      <p className="text-2xl font-semibold text-foreground">No se encontraron peleas directas</p>
                      <p className="max-w-xl text-sm text-muted-foreground">
                        Estos luchadores no tienen un enfrentamiento directo registrado en la base de datos actual.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
        </>
      ) : (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary">
              <Swords className="size-7" />
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-semibold text-foreground">Construye tu enfrentamiento</p>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Elige dos luchadores para desbloquear una comparación lado a lado de récords, herramientas físicas,
                eficiencia de golpeo, producción de grappling y cualquier historial directo de enfrentamientos.
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