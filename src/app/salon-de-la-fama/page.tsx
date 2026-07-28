import type { Metadata } from "next";
import { Suspense } from "react";

import { HallOfFameTabs } from "@/components/hall-of-fame-tabs";
import { SectionHeading } from "@/components/section-heading";
import { getHallOfFame } from "@/lib/queries/hall-of-fame";

// El Salón de la Fama es una lista curada casi estática (se actualiza ~1 vez al
// año con la nueva clase). ISR: servir estático y revalidar a diario.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Salón de la Fama",
  description:
    "El UFC Hall of Fame: las leyendas del octágono por alas (Moderna, Pionera, Contribuidora y de Combate).",
  alternates: { canonical: "/salon-de-la-fama" },
};

export default async function SalonDeLaFamaPage() {
  const data = await getHallOfFame();
  const total =
    data.modern.length + data.pioneer.length + data.contributor.length + data.fight.length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <SectionHeading
        eyebrow="UFC Hall of Fame"
        title="Salón de la Fama"
        description="Las leyendas del octágono, organizadas por alas: Moderna, Pionera, Contribuidora y de Combate."
      />

      {total === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center text-sm leading-6 text-muted-foreground">
          El Salón de la Fama aún no está disponible. Vuelve pronto: en cuanto los datos estén
          listos, aparecerán aquí.
        </p>
      ) : (
        <div className="mt-10">
          <Suspense fallback={<div className="min-h-[420px]" />}>
            <HallOfFameTabs data={data} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
