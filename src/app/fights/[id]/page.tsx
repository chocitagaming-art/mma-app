import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Play, Sparkles } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
import { TaleOfTheTape } from "@/components/tale-of-the-tape";
import { Button } from "@/components/ui/button";
import { getFightDetail } from "@/lib/queries/fights";
import { resolveFightVideoUrl } from "@/lib/video";

type FightDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: FightDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const fight = await getFightDetail(Number(id));

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
  const fight = await getFightDetail(Number(id));

  if (!fight) {
    notFound();
  }

  // Combate sin resultado registrado = pendiente -> ofrecer predicción IA (#36).
  const isUpcoming = !fight.winnerId && !fight.method;

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
