import type { Metadata } from "next";

import { RankingDivisionCard } from "@/components/ranking-division-card";
import { RankingJumpBar } from "@/components/ranking-jump-bar";
import { SectionHeading } from "@/components/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { getRankings } from "@/lib/queries/rankings";
import { divisionGroup, divisionJump } from "@/lib/ranking-jumps";
import { cn } from "@/lib/utils";
import type { DivisionRanking } from "@/lib/types";

// Los rankings oficiales se actualizan por snapshots (cadencia diaria/semanal),
// no en vivo. ISR: servir estático y revalidar cada hora en vez de consultar la BD
// en cada request (#33).
export const revalidate = 3600;

function DivisionGroup({
  label,
  divisions,
  threeCols = false,
}: {
  label: string;
  divisions: DivisionRanking[];
  threeCols?: boolean;
}) {
  if (divisions.length === 0) return null;
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-4">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-3xl">
          {label}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className={cn("grid items-start gap-5 md:grid-cols-2", threeCols && "xl:grid-cols-3")}>
        {divisions.map((division, i) => (
          // The jump bar's target is the grid cell, which never moves; the
          // card inside rises in (.ranking-jump-target in globals.css).
          <div
            key={division.division}
            id={divisionJump(division.division, division.label).anchor}
            className="ranking-jump-target"
          >
            {/* 🪤 ranking-rise: the entrance fills `backwards`, not the global
                `both`. The end state is the element's own (opacity 1, no
                transform), so it looks the same, but an animation still
                filling forwards kept WebKit from painting a 32×32 px tile at
                each card's corner around the faces' drop-shadow (globals.css). */}
            <div className="animate-rise ranking-rise" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <RankingDivisionCard division={division} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const metadata: Metadata = {
  title: "Clasificación",
  description: "Rankings oficiales de UFC: libra por libra y clasificación por cada división.",
  alternates: { canonical: "/clasificacion" },
};

export default async function ClasificacionPage() {
  const { snapshotDate, divisions } = await getRankings();

  const p4p = divisions.filter((d) => divisionGroup(d.division) === "p4p");
  const men = divisions.filter((d) => divisionGroup(d.division) === "men");
  const women = divisions.filter((d) => divisionGroup(d.division) === "women");
  // The bar lists the cards in the order the page shows them.
  const jumps = [...p4p, ...men, ...women].map((d) => divisionJump(d.division, d.label));

  // Three blocks and not one padded box: the jump bar between the heading
  // and the cards is full-bleed like the site header it sticks to, and its
  // sticky containing block is <main>, so it stays up for the whole page.
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8 lg:pt-16">
        <SectionHeading
          eyebrow="Rankings oficiales UFC"
          title="Clasificación de los atletas"
          description={
            snapshotDate
              ? `Libra por libra y clasificación por división. Actualizado el ${formatDate(snapshotDate)}.`
              : "Libra por libra y clasificación por división."
          }
        />
      </div>

      {divisions.length === 0 ? (
        <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
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
        </div>
      ) : (
        <>
          <RankingJumpBar jumps={jumps} />
          <div className="mx-auto max-w-7xl space-y-12 px-4 pb-12 pt-10 sm:px-6 lg:px-8 lg:pb-16">
            <DivisionGroup label="Libra por libra" divisions={p4p} />
            <DivisionGroup label="Categorías masculinas" divisions={men} threeCols />
            <DivisionGroup label="Categorías femeninas" divisions={women} threeCols />
          </div>
        </>
      )}
    </>
  );
}
