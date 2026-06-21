import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRightLeft } from "lucide-react";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { SectionHeading } from "@/components/section-heading";
import { StatBar } from "@/components/stat-bar";
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
  formatHeight,
  formatPercentage,
  formatReach,
  formatRecord,
  formatWeight,
  formatWeightClass,
} from "@/lib/format";
import { getFighterDetail } from "@/lib/queries/fighters";

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
      title: "Luchador no encontrado | MMA Stats",
    };
  }

  return {
    title: `${detail.fighter.name} | MMA Stats`,
    description: `Historial de peleas y estadísticas agregadas de rendimiento de ${detail.fighter.name}.`,
  };
}

export default async function FighterDetailPage({
  params,
}: FighterDetailPageProps) {
  const { id } = await params;
  const detail = await getFighterDetail(Number(id));

  if (!detail) {
    notFound();
  }

  const { fighter, aggregateStats, history, news } = detail;

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
                    <Badge className="border-primary/20 bg-primary/10 text-primary">
                      {detail.latestWeightClass
                        ? formatWeightClass(detail.latestWeightClass)
                        : "Categoría no disponible"}
                    </Badge>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      {fighter.stance ?? "Unknown stance"}
                    </Badge>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      <CountryFlag nationality={fighter.nationality} className="mr-1.5" />
                      {fighter.nationality ?? "Nationality unavailable"}
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
                  {fighter.nationality ?? "Unknown"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Resumen de rendimiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatBar
              label="Precisión de golpes significativos"
              value={formatPercentage(aggregateStats.sigStrikeAccuracy)}
              progress={aggregateStats.sigStrikeAccuracy}
              helper={`${aggregateStats.sigStrikesLanded}/${aggregateStats.sigStrikesAttempted} conectados`}
            />
            <StatBar
              label="Precisión de derribos"
              value={formatPercentage(aggregateStats.takedownAccuracy)}
              progress={aggregateStats.takedownAccuracy}
              helper={`${aggregateStats.takedownsLanded}/${aggregateStats.takedownsAttempted} conectados`}
            />
            <StatBar
              label="Tiempo de control"
              value={formatControlTime(aggregateStats.controlTimeSeconds)}
              progress={Math.min(1, aggregateStats.controlTimeSeconds / 1800)}
              helper={`${aggregateStats.totalFightStats} registros de estadísticas`}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-muted p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  Intentos de sumisión
                </p>
                <p className="tabular mt-2 text-2xl font-semibold text-foreground">
                  {aggregateStats.submissionAttempts}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Derribos por golpe</p>
                <p className="tabular mt-2 text-2xl font-semibold text-foreground">
                  {aggregateStats.knockdowns}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

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
                          {fight.method ?? "—"}
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {fight.endRound ?? "—"}
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {fight.endTime ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <Link
                            href={`/fights/${fight.fightId}`}
                            className="transition-colors hover:text-primary"
                          >
                            {fight.eventName ?? "Evento desconocido"}
                          </Link>
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
          eyebrow="Noticias"
          title={`Cobertura más reciente sobre ${fighter.name}`}
          description="Artículos vinculados a este luchador desde la tabla de noticias, ordenados por fecha de publicación."
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
                          {article.source ?? "Unknown source"}
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