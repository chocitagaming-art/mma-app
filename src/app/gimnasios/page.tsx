import type { Metadata } from "next";

import { GymsClient } from "@/components/map/gyms-client";
import { SectionHeading } from "@/components/section-heading";

export const metadata: Metadata = {
  title: "Gimnasio en tu zona",
  description:
    "Encuentra gimnasios de MMA, boxeo, muay thai y BJJ cerca de ti sobre el mapa. Datos de OpenStreetMap.",
};

export default function GimnasiosPage() {
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
    </div>
  );
}
