import Link from "next/link";
import type { Metadata } from "next";

import { FighterCard } from "@/components/fighter-card";
import { SearchHero } from "@/components/search-hero";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { getFeaturedFighters, getHomeStats } from "@/lib/queries/fighters";

export const metadata: Metadata = {
  title: "MMA Stats | Perfiles de peleadores UFC y análisis de peleas",
  description:
    "Explora perfiles reales de peleadores, historial de peleas y estadísticas de rendimiento desde una base de datos de MMA en vivo.",
};

export default async function HomePage() {
  const [stats, featuredFighters] = await Promise.all([
    getHomeStats(),
    getFeaturedFighters(),
  ]);

  const statItems = [
    { value: stats.fighters.toLocaleString(), label: "Luchadores" },
    { value: stats.fights.toLocaleString(), label: "Peleas" },
    { value: stats.events.toLocaleString(), label: "Eventos" },
    { value: stats.fightStats.toLocaleString(), label: "Registros de stats" },
  ];

  return (
    <div className="pb-16">
      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Base de datos UFC en vivo
          </p>
          <h1 className="mt-3 max-w-4xl font-display text-5xl font-extrabold uppercase leading-[0.92] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Inteligencia
            <br />
            de combate
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Perfiles de peleadores UFC, historial de peleas, comparativas head-to-head
            y predicción por modelo de machine learning, sobre datos reales de eventos.
          </p>
          <div className="mt-7 max-w-2xl">
            <SearchHero />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/fighters">
              <Button variant="outline" size="lg" className="h-10">
                Ver todos los luchadores
              </Button>
            </Link>
            <Link href="/predict">
              <Button size="lg" className="h-10">
                Predecir una pelea
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {statItems.map((stat) => (
            <div key={stat.label} className="bg-card px-4 py-7 sm:px-6 lg:px-8">
              <p className="tabular font-display text-4xl font-extrabold leading-none text-foreground sm:text-5xl">
                {stat.value}
              </p>
              <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured fighters */}
      <section className="mx-auto max-w-7xl space-y-7 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Élite del momento"
            title="Mejores libra por libra"
            description="Los mejores peleadores del ranking oficial de UFC, sin distinción de categoría."
          />
          <Link href="/clasificacion" className="hidden sm:inline-flex">
            <Button variant="ghost" size="lg" className="h-10">
              Ver clasificación →
            </Button>
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {featuredFighters.map((fighter) => (
            <FighterCard key={fighter.id} fighter={fighter} />
          ))}
        </div>
      </section>
    </div>
  );
}
