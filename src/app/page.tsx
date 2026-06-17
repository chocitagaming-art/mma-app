import Link from "next/link";
import type { Metadata } from "next";

import { FighterCard } from "@/components/fighter-card";
import { SearchHero } from "@/components/search-hero";
import { SectionHeading } from "@/components/section-heading";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { getFeaturedFighters, getHomeStats } from "@/lib/queries/fighters";

export const metadata: Metadata = {
  title: "MMA Stats | UFC fighter profiles and fight analytics",
  description:
    "Browse real fighter profiles, fight history, and performance stats from a live MMA database.",
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
                Live Neon database
              </p>
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                MMA Stats
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-zinc-300">
                A polished fight intelligence hub for exploring UFC and MMA fighter
                profiles, matchup history, and performance trends from real event data.
              </p>
            </div>
            <SearchHero />
            <div className="flex flex-wrap gap-3">
              <Link href="/fighters">
                <Button variant="secondary" className="bg-white/10 text-white hover:bg-white/15">
                  Browse all fighters
                </Button>
              </Link>
              <Link href="/fighters?sort=wins">
                <Button className="bg-red-500 text-white hover:bg-red-400">
                  Top winners
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Fighters"
              value={stats.fighters.toLocaleString()}
              helper="Profiles available to explore"
            />
            <StatCard
              label="Events"
              value={stats.events.toLocaleString()}
              helper="Cards captured in the database"
            />
            <StatCard
              label="Fights"
              value={stats.fights.toLocaleString()}
              helper="Historical matchups with outcomes"
            />
            <StatCard
              label="Fight stats"
              value={stats.fightStats.toLocaleString()}
              helper="Per-fighter stat rows for comparisons"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Featured roster"
            title="Recent and active fighters"
            description="A quick look at fighters with logged activity in the current dataset."
          />
          <Link href="/fighters" className="hidden sm:inline-flex">
            <Button variant="ghost" className="text-zinc-300 hover:bg-white/5 hover:text-white">
              See full roster
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