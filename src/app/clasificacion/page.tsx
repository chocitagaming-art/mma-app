import type { Metadata } from "next";

import { RankingDivisionCard } from "@/components/ranking-division-card";
import { SectionHeading } from "@/components/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { getRankings } from "@/lib/queries/rankings";

export const metadata: Metadata = {
  title: "Clasificación | MMA Stats",
  description: "Rankings oficiales de UFC: libra por libra y clasificación por cada división.",
};

export default async function ClasificacionPage() {
  const { snapshotDate, divisions } = await getRankings();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <SectionHeading
        eyebrow="Rankings oficiales UFC"
        title="Clasificación de los atletas"
        description={
          snapshotDate
            ? `Libra por libra y clasificación por división. Actualizado el ${formatDate(snapshotDate)}.`
            : "Libra por libra y clasificación por división."
        }
      />

      {divisions.length === 0 ? (
        <Card className="mt-8 border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="font-display text-2xl font-bold uppercase tracking-tight text-foreground">
              Clasificación no disponible todavía
            </p>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Estamos recopilando los rankings oficiales de la UFC (libra por libra y por
              división). Vuelve pronto: en cuanto los datos estén listos, aparecerán aquí.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {divisions.map((division) => (
            <RankingDivisionCard key={division.division} division={division} />
          ))}
        </div>
      )}
    </div>
  );
}
