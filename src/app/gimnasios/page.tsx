import type { Metadata } from "next";

import { GymDirectory } from "@/components/map/gym-directory";
import { GymsClient } from "@/components/map/gyms-client";
import { SectionHeading } from "@/components/section-heading";
import { getAllGyms } from "@/lib/queries/gyms";

export const metadata: Metadata = {
  title: "Gimnasio en tu zona",
  description:
    "Encuentra gimnasios de MMA, boxeo, muay thai y BJJ cerca de ti sobre el mapa. Datos de OpenStreetMap.",
  alternates: { canonical: "/gimnasios" },
};

// El directorio completo se lee de Neon; los gimnasios se refrescan por cron
// semanal (refresh-gyms.yml), así que ISR diario en vez de consultar la BD en
// cada request. Mismo patrón que /clasificacion.
export const revalidate = 86400;

export default async function GimnasiosPage() {
  const allGyms = await getAllGyms();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <SectionHeading
        eyebrow="Encuentra dónde entrenar"
        title="Gimnasio en tu zona"
        description="Gimnasios de MMA, boxeo, muay thai, BJJ y más cerca de ti. Usa tu ubicación o busca por ciudad."
      />
      <div className="mt-10">
        <GymsClient />
      </div>

      <section className="mt-16 border-t border-border pt-12">
        <SectionHeading
          eyebrow="Directorio completo"
          title="Todos los gimnasios"
          description="Todos los gimnasios de artes marciales registrados, filtrables por disciplina. Busca por nombre o ciudad."
        />
        <div className="mt-8">
          <GymDirectory gyms={allGyms} />
        </div>
      </section>
    </div>
  );
}
