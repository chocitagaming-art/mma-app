import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { SectionHeading } from "@/components/section-heading";
import { TaleOfTheTape } from "@/components/tale-of-the-tape";
import { getFightDetail } from "@/lib/queries/fights";

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

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <SectionHeading
        eyebrow="Desglose de la pelea"
        title={`${fight.red.name} vs ${fight.blue.name}`}
        description="Resultado oficial y comparación lado a lado de las estadísticas registradas."
      />
      <TaleOfTheTape fight={fight} />
    </div>
  );
}
