import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Play, Sparkles } from "lucide-react";

import { BackLink } from "@/components/back-link";
import { FightVideoPlayer } from "@/components/fight-video-player";
import { FightTimeline } from "@/components/fight/fight-timeline";
import { RoundByRound } from "@/components/fight/round-by-round";
import { MarketOnlyCard } from "@/components/market-corner-tile";
import { MarketModelComparison } from "@/components/market-model-comparison";
import { SectionHeading } from "@/components/section-heading";
import { TaleOfTheTape } from "@/components/tale-of-the-tape";
import { Button } from "@/components/ui/button";
import { marketFavorite } from "@/lib/odds";
import { getFightDetail, getFightRoundStats } from "@/lib/queries/fights";
import { getFightSampleSeries } from "@/lib/queries/live";
import { getSkillRadarEntries } from "@/lib/queries/skill-radar";
import { parseId } from "@/lib/route-params";
import { buildFightRadar } from "@/lib/skill-radar";
import { parseYouTubeId, resolveFightVideoUrl } from "@/lib/video";

type FightDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: FightDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const fightId = parseId(id);
  const fight = fightId != null ? await getFightDetail(fightId) : null;

  // Sin combate la página es un "no encontrado" que Next ya marca con noindex:
  // ponerle canónica sería decirle a Google que ESA es la versión buena de algo
  // que no existe.
  if (!fight) {
    return {
      title: "Pelea no encontrada",
    };
  }

  return {
    title: `${fight.red.name} vs ${fight.blue.name}`,
    description: `Resultado de la pelea y comparación de estadísticas para ${fight.red.name} vs ${fight.blue.name}.`,
    // Canónica con el id NUMÉRICO ya parseado, no con el texto de la ruta:
    // /fights/03821 sirve el mismo combate con un 200. Estas fichas NO llevan
    // datos estructurados todavía (son 8.800 páginas y ni siquiera están en el
    // sitemap): eso es un sprint propio.
    alternates: { canonical: `/fights/${fightId}` },
  };
}

export default async function FightDetailPage({ params }: FightDetailPageProps) {
  const { id } = await params;
  const fightId = parseId(id);

  if (fightId == null) {
    notFound();
  }

  // Detalle + desglose por asaltos (BE4) + percentiles del radar + muestras
  // del directo (timeline, mig. 024) en paralelo: independientes entre sí; el
  // detalle ya está deduplicado con cache() frente a generateMetadata y los
  // percentiles vienen de unstable_cache (24 h).
  const [fight, roundStats, radarEntries, sampleSeries] = await Promise.all([
    getFightDetail(fightId),
    getFightRoundStats(fightId),
    getSkillRadarEntries(),
    getFightSampleSeries([fightId]),
  ]);

  if (!fight) {
    notFound();
  }

  // Radar de habilidades: percentiles de cada esquina (null si TBD o debutante).
  const radar = buildFightRadar(radarEntries, fight.red.id, fight.blue.id);

  // Cancelado: comparte firma con los pendientes (winner/method NULL) pero no
  // debe ofrecer predicción ni vídeo; el aviso lo pinta TaleOfTheTape.
  const isCancelled = fight.status === "cancelled";
  // Combate sin resultado registrado = pendiente -> ofrecer predicción IA (#36).
  const isUpcoming = !isCancelled && !fight.winnerId && !fight.method;
  // Vídeo curado de YouTube -> reproductor embebido; si no, botón (#43, Fase 10).
  const youTubeId = isUpcoming ? null : parseYouTubeId(fight.videoUrl);
  // La predicción necesita ambas fichas; un rival TBD (id null) no es comparable.
  const canPredict = fight.red.id != null && fight.blue.id != null;

  // Favorito del mercado según las cuotas de las casas de apuestas (#41).
  const favorite = marketFavorite(fight.oddsRed, fight.oddsBlue);

  // La comparación inline Mercado vs Modelo es una feature de combates POR
  // DISPUTARSE: necesita cuotas válidas (favorite), ambas fichas (canPredict) y
  // que la pelea siga pendiente (isUpcoming). Cuando se muestra, ella es el CTA
  // de predicción primario, así que el hero no duplica su botón "Predecir con IA".
  // Una pelea ya finalizada con cuotas registradas cae al MarketOnlyCard estático.
  const showComparison =
    isUpcoming &&
    favorite != null &&
    fight.red.id != null &&
    fight.blue.id != null &&
    fight.oddsRed != null &&
    fight.oddsBlue != null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      {/* El padre útil de un combate es SU VELADA, no el listado de eventos: es
          de donde viene el navegante y donde están los otros combates de la
          misma cartelera. Medido antes de tocar nada: esta página tenía 5
          enlaces de contenido y CERO a /eventos/N — la relación existe en los
          datos y solo estaba cableada en un sentido (el evento sí enlaza aquí).
          Se dice "Cartelera" y no el nombre del evento porque el enlace es
          inline-flex con ancho max-content y un nombre largo en mono a 12px con
          tracking se come el ancho útil de un móvil de 390 px. */}
      <BackLink
        href={fight.eventId != null ? `/eventos/${fight.eventId}` : "/eventos"}
        label={fight.eventId != null ? "Cartelera" : "Eventos"}
      />
      <SectionHeading
        eyebrow="Desglose de la pelea"
        title={`${fight.red.name} vs ${fight.blue.name}`}
        description={
          isCancelled
            ? "Este combate fue cancelado y no llegó a disputarse."
            : isUpcoming
              ? "Cara a cara y comparativa de ambos luchadores antes del combate."
              : "Resultado oficial y comparación lado a lado de las estadísticas registradas."
        }
      />

      {favorite && fight.oddsRed != null && fight.oddsBlue != null ? (
        showComparison && fight.red.id != null && fight.blue.id != null ? (
          <MarketModelComparison
            redFighterId={fight.red.id}
            blueFighterId={fight.blue.id}
            redName={fight.red.name}
            blueName={fight.blue.name}
            oddsRed={fight.oddsRed}
            oddsBlue={fight.oddsBlue}
            market={favorite}
          />
        ) : (
          <MarketOnlyCard
            redName={fight.red.name}
            blueName={fight.blue.name}
            oddsRed={fight.oddsRed}
            oddsBlue={fight.oddsBlue}
            market={favorite}
          />
        )
      ) : null}

      {!isUpcoming && !isCancelled ? (
        youTubeId ? (
          <div className="mx-auto w-full max-w-3xl">
            <FightVideoPlayer
              videoId={youTubeId}
              title={`${fight.red.name} vs ${fight.blue.name}`}
            />
          </div>
        ) : (
          <div className="flex justify-center">
            <a
              href={resolveFightVideoUrl(
                fight.videoUrl,
                fight.red.name,
                fight.blue.name,
                fight.eventName ?? undefined,
              )}
              target="_blank"
              rel="noreferrer"
              aria-label={`Ver el combate ${fight.red.name} vs ${fight.blue.name}`}
            >
              <Button variant="default" size="lg" className="h-11 font-semibold">
                <Play className="size-4" />
                {fight.videoUrl ? "Ver combate" : "Buscar combate en YouTube"}
              </Button>
            </a>
          </div>
        )
      ) : null}

      <TaleOfTheTape fight={fight} radar={radar} />

      {/* Timeline del directo (mig. 024): la "película" del combate con las
          muestras capturadas en vivo. Solo pinta si hay serie (eventos desde
          jul-2026 + backfill UFC 329); sin muestras devuelve null. Una
          cancelada JAMÁS pinta película aunque queden muestras huérfanas
          (el bucle pudo morir antes de observar la cancelación). */}
      {!isCancelled ? (
        <FightTimeline
          samples={sampleSeries.get(fightId) ?? []}
          redId={fight.red.id}
          blueId={fight.blue.id}
          redName={fight.red.name}
          blueName={fight.blue.name}
        />
      ) : null}

      {/* BE4 + fase 9: desglose por asaltos, bajo las estadísticas del combate
          (última sección del tale-of-the-tape). El método y el final se pasan
          para marcar el asalto en el que se acabó; en un combate futuro no hay
          método y entonces la sección no se pinta. `eventDate` decide el estado
          vacío: sin ella, un combate recién terminado —con método de ESPN pero
          todavía sin el desglose de ufcstats— diría que es tan antiguo que no
          se registraban asaltos. Ver `estadoDesglose`.
          Y el mismo guard que la película justo encima: una cancelada no pinta
          desglose aunque le queden filas de asaltos. Hoy no hay ninguna
          cancelada con método, así que no se dispara — pero el día que la haya,
          el sitio no va a contar el asalto a asalto de un combate que no se
          celebró. */}
      {!isCancelled ? (
        <RoundByRound
          rounds={roundStats}
          redId={fight.red.id}
          blueId={fight.blue.id}
          redName={fight.red.name}
          blueName={fight.blue.name}
          method={fight.method}
          endRound={fight.endRound}
          endTime={fight.endTime}
          eventDate={fight.eventDate}
        />
      ) : null}

      {/* CTA de predicción para combates futuros SIN cuotas (con cuotas, la
          comparación Mercado vs Modelo de arriba ya es el CTA primario). Vive
          bajo el tale-of-the-tape tras retirar el antiguo banner del hero. */}
      {isUpcoming && !showComparison ? (
        canPredict ? (
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-card to-muted/40 p-6 text-center sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full bg-primary/30 blur-3xl dark:bg-primary/20"
            />
            <h2 className="relative font-display text-xl font-extrabold uppercase tracking-tight text-foreground sm:text-2xl">
              ¿Quién se lleva la victoria?
            </h2>
            <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Deja que nuestro modelo de machine learning analice a ambos
              peleadores y prediga el resultado.
            </p>
            <Link
              href={`/enfrentamiento?red=${fight.red.id}&blue=${fight.blue.id}`}
              className="relative mt-5 inline-flex"
            >
              <Button size="lg" className="h-11">
                <Sparkles className="size-4" />
                Predecir esta pelea con IA
              </Button>
            </Link>
          </div>
        ) : (
          <p className="text-center text-sm leading-6 text-muted-foreground">
            El rival aún está por confirmar. Vuelve cuando se anuncie el
            emparejamiento completo.
          </p>
        )
      ) : null}
    </div>
  );
}
