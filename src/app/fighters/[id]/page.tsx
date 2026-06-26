import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRightLeft, Play, Trophy } from "lucide-react";

import { CountryFlag } from "@/components/country-flag";
import { DefenseMeter } from "@/components/fighter/defense-meter";
import { PerFightBars } from "@/components/fighter/per-fight-bars";
import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { StatDonut } from "@/components/fighter/stat-donut";
import { StrikeSilhouette } from "@/components/fighter/strike-silhouette";
import { UpcomingBouts } from "@/components/fighter/upcoming-bouts";
import { WinMethodChart } from "@/components/fighter/win-method-chart";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatControlTime,
  formatDate,
  formatDivision,
  formatHeight,
  formatMethod,
  formatReach,
  formatRecord,
  formatWeight,
  formatWeightClass,
} from "@/lib/format";
import { buildFightVideoSearchUrl } from "@/lib/video";
import {
  getFighterDetail,
  getFighterStrikeProfile,
  getFighterUpcomingBouts,
} from "@/lib/queries/fighters";

type FighterDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: FighterDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getFighterDetail(Number(id));

  if (!detail) {
    return {
      title: "Luchador no encontrado",
    };
  }

  return {
    title: `${detail.fighter.name}`,
    description: `Historial de peleas y estadísticas agregadas de rendimiento de ${detail.fighter.name}.`,
  };
}

export default async function FighterDetailPage({
  params,
}: FighterDetailPageProps) {
  const { id } = await params;
  const fighterId = Number(id);
  const [detail, strikeProfile, upcomingBouts] = await Promise.all([
    getFighterDetail(fighterId),
    getFighterStrikeProfile(fighterId),
    getFighterUpcomingBouts(fighterId),
  ]);

  if (!detail) {
    notFound();
  }

  const { fighter, aggregateStats, history, news, defenseStats, winMethods, rateStats } =
    detail;

  // Cuando no hay noticias, el hueco se rellena con los próximos combates (#48).
  const showUpcoming = news.length === 0 && upcomingBouts.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-border bg-card">
          <CardContent className="space-y-8 p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex flex-wrap items-center gap-6">
                <FighterHeadshot
                  name={fighter.name}
                  headshotUrl={fighter.headshotUrl}
                  size="xl"
                  priority
                  className="border-0 bg-transparent shadow-md ring-1 ring-border"
                  imageClassName="object-cover object-top"
                />
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      Perfil del luchador
                    </p>
                    <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-foreground sm:text-5xl">
                      {fighter.name}
                    </h1>
                    <p className="text-lg text-muted-foreground">
                      {fighter.nickname ? `"${fighter.nickname}"` : "Sin apodo registrado"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {detail.ranking ? (
                      detail.ranking.isChampion ? (
                        <Badge className="bg-primary text-primary-foreground">
                          <Trophy />
                          Campeón
                        </Badge>
                      ) : (
                        <Badge className="border-primary/30 bg-primary/10 text-primary">
                          <Trophy />
                          {`#${detail.ranking.position} ${formatDivision(detail.ranking.division)}`}
                        </Badge>
                      )
                    ) : null}
                    <Badge className="border-primary/20 bg-primary/10 text-primary">
                      {detail.latestWeightClass
                        ? formatWeightClass(detail.latestWeightClass)
                        : "Categoría no disponible"}
                    </Badge>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      {fighter.stance ?? "Guardia desconocida"}
                    </Badge>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      <CountryFlag nationality={fighter.nationality} className="mr-1.5" />
                      {fighter.nationality ?? "Nacionalidad no disponible"}
                    </Badge>
                    <Link href={`/enfrentamiento?red=${fighter.id}`}>
                      <Button
                        variant="secondary"
                        className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <ArrowRightLeft />
                        Comparar luchador
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-border bg-muted px-6 py-5 text-right">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Récord</p>
                <p className="tabular mt-3 font-display text-4xl font-bold text-foreground">
                  {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{detail.fightCount} peleas registradas</p>
              </div>
            </div>
            <Separator className="bg-border" />
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Altura</p>
                <p className="tabular mt-2 text-lg font-semibold text-foreground">
                  {formatHeight(fighter.heightCm)}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Alcance</p>
                <p className="tabular mt-2 text-lg font-semibold text-foreground">
                  {formatReach(fighter.reachCm)}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Peso</p>
                <p className="tabular mt-2 text-lg font-semibold text-foreground">
                  {formatWeight(fighter.weightGrams)}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Nacionalidad</p>
                <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <CountryFlag nationality={fighter.nationality} className="h-4 w-6" />
                  {fighter.nationality ?? "Desconocida"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Resumen de rendimiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <StatDonut
                label="Precisión de golpeo"
                value={aggregateStats.sigStrikeAccuracy}
                helper={`${aggregateStats.sigStrikesLanded}/${aggregateStats.sigStrikesAttempted}`}
                colorVar="var(--chart-1)"
              />
              <StatDonut
                label="Precisión de derribo"
                value={aggregateStats.takedownAccuracy}
                helper={`${aggregateStats.takedownsLanded}/${aggregateStats.takedownsAttempted}`}
                colorVar="var(--chart-2)"
              />
            </div>
            <StrikeSilhouette profile={strikeProfile} />
            <div className="grid grid-cols-2 gap-3">
              <div className={`${PREMIUM_TILE} p-4 text-center`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Knockdowns
                </p>
                <p className="tabular mt-2 text-2xl font-bold text-foreground">
                  {aggregateStats.knockdowns}
                </p>
              </div>
              <div className={`${PREMIUM_TILE} p-4 text-center`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Int. sumisión
                </p>
                <p className="tabular mt-2 text-2xl font-bold text-foreground">
                  {aggregateStats.submissionAttempts}
                </p>
              </div>
              <div className={`${PREMIUM_TILE} p-4 text-center`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Derribos
                </p>
                <p className="tabular mt-2 text-2xl font-bold text-foreground">
                  {aggregateStats.takedownsLanded}
                </p>
              </div>
              <div className={`${PREMIUM_TILE} p-4 text-center`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  T. control
                </p>
                <p className="tabular mt-2 text-2xl font-bold text-foreground">
                  {formatControlTime(aggregateStats.controlTimeSeconds)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {aggregateStats.totalFightStats > 0 || winMethods.total > 0 ? (
        <section className="space-y-6">
          <SectionHeading
            eyebrow="Estadísticas"
            title="Perfil de rendimiento"
            description="Precisión, defensa y desglose de victorias, calculado sobre las peleas registradas."
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <PerFightBars
              landedPerFight={rateStats.sigStrikesLandedPerFight}
              absorbedPerFight={rateStats.sigStrikesAbsorbedPerFight}
            />
            {winMethods.total > 0 ? <WinMethodChart methods={winMethods} /> : null}
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <DefenseMeter
              label="Defensa de golpeo"
              value={defenseStats.strikingDefense}
              helper={`${defenseStats.oppSigStrikesLanded} de ${defenseStats.oppSigStrikesAttempted} permitidos`}
            />
            <DefenseMeter
              label="Defensa de derribo"
              value={defenseStats.takedownDefense}
              helper={`${defenseStats.oppTakedownsLanded} de ${defenseStats.oppTakedownsAttempted} permitidos`}
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-6">
        <SectionHeading
          eyebrow="Historial de peleas"
          title="Cada enfrentamiento registrado"
          description="Revisa oponentes, eventos y resultados desde la tabla de peleas."
        />
        {history.length ? (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Fecha
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Oponente
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Resultado
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Método
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Rnd
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Tiempo
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Evento
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Vídeo
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((fight) => {
                    const resultLabel =
                      fight.result === "win"
                        ? "Victoria"
                        : fight.result === "loss"
                          ? "Derrota"
                          : fight.result === "draw"
                            ? "Empate"
                            : "NC";
                    const resultClass =
                      fight.result === "win"
                        ? "bg-win/10 text-win"
                        : fight.result === "loss"
                          ? "bg-loss/10 text-loss"
                          : "bg-muted text-muted-foreground";

                    return (
                      <TableRow key={fight.fightId} className="hover:bg-muted">
                        <TableCell className="tabular text-muted-foreground">
                          {formatDate(fight.eventDate)}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {fight.opponentId ? (
                            <Link
                              href={`/fighters/${fight.opponentId}`}
                              className="transition-colors hover:text-primary"
                            >
                              {fight.opponentName ?? "Oponente desconocido"}
                            </Link>
                          ) : (
                            (fight.opponentName ?? "Oponente desconocido")
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-sm px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-wide ${resultClass}`}
                          >
                            {resultLabel}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatMethod(fight.method)}
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {fight.endRound ?? "—"}
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {fight.endTime ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fight.eventId ? (
                            <Link
                              href={`/eventos/${fight.eventId}`}
                              className="transition-colors hover:text-primary"
                            >
                              {fight.eventName ?? "Evento desconocido"}
                            </Link>
                          ) : (
                            (fight.eventName ?? "Evento desconocido")
                          )}
                        </TableCell>
                        <TableCell>
                          <a
                            href={buildFightVideoSearchUrl(
                              fighter.name,
                              fight.opponentName ?? "",
                              fight.eventName ?? undefined,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Ver el combate ${fighter.name} vs ${fight.opponentName ?? "oponente"} en YouTube`}
                            className="inline-flex items-center gap-1.5 font-medium text-primary transition-colors hover:text-primary/80"
                          >
                            <Play className="size-3.5" />
                            Ver
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <Card className="border-dashed border-border bg-card">
            <CardContent className="px-6 py-16 text-center text-muted-foreground">
              Sin peleas registradas.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-6">
        <SectionHeading
          eyebrow={showUpcoming ? "Calendario" : "Noticias"}
          title={
            showUpcoming
              ? `Próximos combates de ${fighter.name}`
              : `Cobertura más reciente sobre ${fighter.name}`
          }
          description={
            showUpcoming
              ? "Peleas programadas en eventos próximos según el calendario actual."
              : "Artículos vinculados a este luchador desde la tabla de noticias, ordenados por fecha de publicación."
          }
        />
        <div className="grid gap-4">
          {news.length ? (
            news.map((article) => (
              <Card
                key={article.id}
                className="border-border bg-card transition hover:border-primary/30 hover:bg-accent"
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge className="border-primary/20 bg-primary/10 text-primary">
                          {article.category ?? "General"}
                        </Badge>
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          {article.source ?? "Fuente desconocida"}
                        </Badge>
                      </div>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xl font-semibold text-foreground transition hover:text-primary"
                      >
                        {article.headline}
                      </a>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatDate(article.publishedAt)}</p>
                  </div>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {article.summary?.length
                      ? article.summary.length > 180
                        ? `${article.summary.slice(0, 180).trimEnd()}…`
                        : article.summary
                      : "No hay resumen disponible para este artículo."}
                  </p>
                  <div className="border-t border-border pt-4">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-primary transition hover:text-primary/80"
                    >
                      Leer artículo →
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : showUpcoming ? (
            <UpcomingBouts bouts={upcomingBouts} />
          ) : (
            <Card className="border-dashed border-border bg-card">
              <CardContent className="px-6 py-16 text-center text-muted-foreground">
                Aún no hay artículos de noticias relacionados con este luchador.
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}