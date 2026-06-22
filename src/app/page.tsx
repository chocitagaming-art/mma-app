import Link from "next/link";
import type { Metadata } from "next";

import { FighterCard } from "@/components/fighter-card";
import { NewsMarquee } from "@/components/news-marquee";
import { RecentNewsGrid } from "@/components/recent-news-grid";
import { SearchHero } from "@/components/search-hero";
import { SectionHeading } from "@/components/section-heading";
import { UfcVideosColumn } from "@/components/ufc-videos-column";
import { VideoHero } from "@/components/video-hero";
import { Button } from "@/components/ui/button";
import { getFeaturedFighters, getHomeStats } from "@/lib/queries/fighters";
import { getRecentNews } from "@/lib/queries/news";

// Data comes live from the DB; render on each request (no build-time DB call).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "MMA STATUS · Perfiles de peleadores UFC y análisis de peleas" },
  description:
    "Explora perfiles reales de peleadores, historial de peleas y estadísticas de rendimiento desde una base de datos de MMA en vivo.",
};

export default async function HomePage() {
  const [stats, featuredFighters, marqueeNews] = await Promise.all([
    getHomeStats(),
    getFeaturedFighters(),
    getRecentNews(12),
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
      <section className="relative overflow-hidden border-b border-border">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:px-8 lg:py-20">
          {/* Copy */}
          <div className="relative z-10 order-2 lg:order-1">
            <p className="animate-rise flex items-center gap-2.5 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              <span className="live-dot inline-block size-2 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
              Base de datos UFC en vivo
            </p>
            <h1
              className="animate-rise mt-4 font-display text-6xl font-extrabold uppercase leading-[0.86] tracking-tight text-foreground sm:text-7xl lg:text-8xl"
              style={{ animationDelay: "80ms" }}
            >
              Inteligencia
              <br />
              de <span className="text-primary">combate</span>
            </h1>
            <p
              className="animate-rise mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Perfiles de peleadores UFC, historial de peleas, comparativas
              head-to-head y predicción por modelo de machine learning, sobre
              datos reales de eventos.
            </p>
            <div
              className="animate-rise mt-7 max-w-xl"
              style={{ animationDelay: "240ms" }}
            >
              <SearchHero />
            </div>
            <div
              className="animate-rise mt-4 flex flex-wrap gap-3"
              style={{ animationDelay: "320ms" }}
            >
              <Link href="/maestro">
                <Button variant="outline" size="lg" className="h-10">
                  Pregunta al Maestro de la UFC
                </Button>
              </Link>
              <Link href="/enfrentamiento">
                <Button size="lg" className="h-10">
                  Predecir una pelea
                </Button>
              </Link>
            </div>
          </div>

          {/* Hero reel — vídeos de momentos icónicos (sustituye al arte estático) */}
          <div className="order-1 flex items-center justify-center lg:order-2">
            <VideoHero className="animate-rise" />
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {statItems.map((stat, i) => (
            <div
              key={stat.label}
              className="animate-rise group relative overflow-hidden bg-card px-4 py-7 sm:px-6 lg:px-8"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-300 ease-out group-hover:scale-x-100" />
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

      {/* Marquee de noticias (se desplaza derecha→izquierda, clicable) */}
      <NewsMarquee articles={marqueeNews} />

      {/* Noticias recientes + columna de vídeos UFC (estilo ufc.com) */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-7">
            <div className="flex items-end justify-between gap-6">
              <SectionHeading
                eyebrow="Lo último"
                title="Noticias recientes"
                description="Lo más reciente del mundo UFC, con foto y titular."
              />
              <Link href="/news" className="hidden shrink-0 sm:inline-flex">
                <Button variant="ghost" size="lg" className="h-10">
                  Ver todas →
                </Button>
              </Link>
            </div>
            <RecentNewsGrid limit={6} />
          </div>
          <UfcVideosColumn limit={5} />
        </div>
      </section>

      {/* Mejores libra por libra (reubicado más abajo) */}
      <section className="mx-auto max-w-7xl space-y-7 border-t border-border px-4 pt-12 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Libra por libra"
            title="Mejores libra por libra"
            description="Los mejores peleadores del ranking oficial de UFC, sin distinción de categoría."
          />
          <Link href="/clasificacion" className="hidden shrink-0 sm:inline-flex">
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
