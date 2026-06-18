import Link from "next/link";
import type { Metadata } from "next";

import { FighterCard } from "@/components/fighter-card";
import { SearchHero } from "@/components/search-hero";
import { SectionHeading } from "@/components/section-heading";
import { StatCard } from "@/components/stat-card";
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

  return (
    <div className="space-y-20 pb-20">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.22),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.18),_transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-28">
          <div className="space-y-8">
            <div className="space-y-5">
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-red-300">
                Base de datos Neon en vivo
              </p>
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                MMA Stats
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-zinc-300">
                Un centro de inteligencia de combate para explorar perfiles de peleadores de UFC y MMA,
                historial de enfrentamientos y tendencias de rendimiento a partir de datos reales de eventos.
              </p>
            </div>
            <SearchHero />
            <div className="flex flex-wrap gap-3">
              <Link href="/fighters">
                <Button variant="secondary" className="bg-white/10 text-white hover:bg-white/15">
                  Ver todos los luchadores
                </Button>
              </Link>
              <Link href="/fighters?sort=wins">
                <Button className="bg-red-500 text-white hover:bg-red-400">
                  Más victorias
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Luchadores"
              value={stats.fighters.toLocaleString()}
              helper="Perfiles disponibles para explorar"
            />
            <StatCard
              label="Eventos"
              value={stats.events.toLocaleString()}
              helper="Carteleras registradas en la base de datos"
            />
            <StatCard
              label="Peleas"
              value={stats.fights.toLocaleString()}
              helper="Enfrentamientos históricos con resultados"
            />
            <StatCard
              label="Estadísticas de pelea"
              value={stats.fightStats.toLocaleString()}
              helper="Filas de estadísticas por peleador para comparaciones"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Plantilla destacada"
            title="Peleadores recientes y activos"
            description="Un vistazo rápido a los peleadores con actividad registrada en el conjunto de datos actual."
          />
          <Link href="/fighters" className="hidden sm:inline-flex">
            <Button variant="ghost" className="text-zinc-300 hover:bg-white/5 hover:text-white">
              Ver plantilla completa
            </Button>
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {featuredFighters.map((fighter) => (
            <FighterCard key={fighter.id} fighter={fighter} />
          ))}
        </div>
      </section>
    </div>
  );
}