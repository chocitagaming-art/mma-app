import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Play, Sparkles } from "lucide-react";

import { FightVideoPlayer } from "@/components/fight-video-player";
import { RoundByRound } from "@/components/fight/round-by-round";
import { MarketOnlyCard } from "@/components/market-corner-tile";
import { MarketModelComparison } from "@/components/market-model-comparison";
import { SectionHeading } from "@/components/section-heading";
import { TaleOfTheTape } from "@/components/tale-of-the-tape";
import { Button } from "@/components/ui/button";
import { marketFavorite } from "@/lib/odds";
import { getFightDetail, getFightRoundStats } from "@/lib/queries/fights";
import { parseId } from "@/lib/route-params";
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

  if (!fight) {
    return {
      title: "Pelea no encontrada",
    };
  }

  return {
    title: `${fight.red.name} vs ${fight.blue.name}`,
    description: `Resultado de la pelea y comparación de estadísticas para ${fight.red.name} vs ${fight.blue.name}.`,
  };
}

export default async function FightDetailPage({ params }: FightDetailPageProps) {
  const { id } = await params;
  const fightId = parseId(id);

  if (fightId == null) {
    notFound();
  }

  // Detalle + desglose por asaltos (BE4) en paralelo: son independientes y el
  // detalle ya está deduplicado con cache() frente a generateMetadata.
  const [fight, roundStats] = await Promise.all([
    getFightDetail(fightId),
    getFightRoundStats(fightId),
  ]);

  if (!fight) {
    notFound();
  }

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
              <Button variant="secondary" size="lg" className="h-11">
                <Play className="size-4" />
                {fight.videoUrl ? "Ver combate" : "Buscar combate en YouTube"}
              </Button>
            </a>
          </div>
        )
      ) : null}

      <TaleOfTheTape fight={fight} />

      {/* BE4: desglose por asaltos, bajo las estadísticas del combate (última
          sección del tale-of-the-tape). No pinta nada sin filas por asalto. */}
      <RoundByRound
        rounds={roundStats}
        redId={fight.red.id}
        blueId={fight.blue.id}
        redName={fight.red.name}
        blueName={fight.blue.name}
      />

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
