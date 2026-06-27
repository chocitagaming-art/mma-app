import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Play, Sparkles } from "lucide-react";

import { MarketOnlyCard } from "@/components/market-corner-tile";
import { MarketModelComparison } from "@/components/market-model-comparison";
import { SectionHeading } from "@/components/section-heading";
import { TaleOfTheTape } from "@/components/tale-of-the-tape";
import { Button } from "@/components/ui/button";
import { marketFavorite } from "@/lib/odds";
import { getFightDetail } from "@/lib/queries/fights";
import { parseId } from "@/lib/route-params";
import { resolveFightVideoUrl } from "@/lib/video";

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

  const fight = await getFightDetail(fightId);

  if (!fight) {
    notFound();
  }

  // Combate sin resultado registrado = pendiente -> ofrecer predicción IA (#36).
  const isUpcoming = !fight.winnerId && !fight.method;
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
        description="Resultado oficial y comparación lado a lado de las estadísticas registradas."
      />

      {isUpcoming ? (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-card to-muted/40 p-6 text-center sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full bg-primary/20 blur-3xl"
          />
          <p className="relative font-mono text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Combate por disputarse
          </p>
          {canPredict ? (
            <>
              <h2 className="relative mt-2 font-display text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-3xl">
                ¿Quién se lleva la victoria?
              </h2>
              {showComparison ? (
                <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Compara la probabilidad implícita del mercado con la del modelo
                  justo aquí abajo.
                </p>
              ) : (
                <>
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
                </>
              )}
            </>
          ) : (
            <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              El rival aún está por confirmar. Vuelve cuando se anuncie el
              emparejamiento completo.
            </p>
          )}
        </div>
      ) : null}

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

      {!isUpcoming ? (
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
      ) : null}

      <TaleOfTheTape fight={fight} />
    </div>
  );
}
