import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Play, Sparkles, TrendingUp } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
import { TaleOfTheTape } from "@/components/tale-of-the-tape";
import { Button } from "@/components/ui/button";
import { formatPercentage } from "@/lib/format";
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
              <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Deja que nuestro modelo de machine learning analice a ambos peleadores
                y prediga el resultado.
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
          ) : (
            <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              El rival aún está por confirmar. Vuelve cuando se anuncie el
              emparejamiento completo.
            </p>
          )}
        </div>
      ) : null}

      {favorite ? (
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center justify-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Favorito del mercado
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div
              className={`rounded-xl border p-4 text-center ${favorite.favorite === "red" ? "border-primary/40 bg-primary/5" : "border-border"}`}
            >
              <p className="truncate font-display text-lg font-bold uppercase text-foreground">
                {fight.red.name}
              </p>
              <p className="tabular mt-1 text-2xl font-bold text-foreground">
                {formatPercentage(favorite.redImplied)}
              </p>
              <p className="font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                Cuota {fight.oddsRed?.toFixed(2)}
                {favorite.favorite === "red" ? " · favorito" : ""}
              </p>
            </div>
            <div
              className={`rounded-xl border p-4 text-center ${favorite.favorite === "blue" ? "border-primary/40 bg-primary/5" : "border-border"}`}
            >
              <p className="truncate font-display text-lg font-bold uppercase text-foreground">
                {fight.blue.name}
              </p>
              <p className="tabular mt-1 text-2xl font-bold text-foreground">
                {formatPercentage(favorite.blueImplied)}
              </p>
              <p className="font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                Cuota {fight.oddsBlue?.toFixed(2)}
                {favorite.favorite === "blue" ? " · favorito" : ""}
              </p>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Probabilidad implícita de las casas de apuestas (sin margen).
          </p>
        </div>
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
