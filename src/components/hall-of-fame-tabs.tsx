"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { cn } from "@/lib/utils";
import type { HallOfFameData, HofInductee, HofWing } from "@/lib/queries/hall-of-fame";

const WINGS: { key: HofWing; label: string; blurb: string }[] = [
  { key: "modern", label: "Modern Wing", blurb: "Debut desde el 17 nov 2000" },
  { key: "pioneer", label: "Pioneer Wing", blurb: "Debut antes del 17 nov 2000" },
  { key: "contributor", label: "Contributor Wing", blurb: "Aportaciones fuera del octágono" },
  { key: "fight", label: "Fight Wing", blurb: "Peleas históricas" },
];

function YearLine({ year }: { year: number | null }) {
  return (
    <p className="mt-1 flex items-center justify-center gap-1.5 font-mono text-xs text-muted-foreground">
      <Trophy className="size-3 text-amber-400" aria-hidden />
      {year ? `Clase de ${year}` : "Salón de la Fama"}
    </p>
  );
}

function PersonCard({ inductee }: { inductee: HofInductee }) {
  const body = (
    <div className="group flex h-full flex-col items-center gap-3 rounded-lg border border-border bg-card p-5 text-center transition-colors hover:border-amber-400/40 hover:bg-muted/40">
      <FighterHeadshot
        name={inductee.displayName}
        headshotUrl={inductee.headshotUrl}
        size="lg"
        className="border-2 border-amber-400/60 shadow-[0_0_18px_rgba(251,191,36,0.12)]"
      />
      <div className="min-w-0">
        <p className="flex items-center justify-center gap-1.5 font-display text-base font-bold uppercase leading-tight tracking-tight text-foreground group-hover:text-primary">
          {inductee.nationality ? <CountryFlag nationality={inductee.nationality} /> : null}
          <span className="truncate">{inductee.displayName}</span>
        </p>
        <YearLine year={inductee.inducteeYear} />
      </div>
    </div>
  );

  if (!inductee.fighterId) return body;
  return (
    <Link href={`/fighters/${inductee.fighterId}`} className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  );
}

function Corner({ id, name, headshot }: { id: number | null; name: string | null; headshot: string | null }) {
  const inner = (
    <div className="flex flex-col items-center gap-1.5">
      <FighterHeadshot name={name ?? "?"} headshotUrl={headshot} size="md" className="border border-border" />
      <span className="max-w-[7rem] truncate text-center text-xs font-medium text-foreground">{name ?? "—"}</span>
    </div>
  );
  if (!id) return inner;
  return (
    <Link href={`/fighters/${id}`} className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {inner}
    </Link>
  );
}

function FightCard({ inductee }: { inductee: HofInductee }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-center gap-3">
        <Corner id={inductee.cornerAId} name={inductee.cornerAName} headshot={inductee.cornerAHeadshot} />
        <span className="mt-4 font-display text-lg font-extrabold text-primary">VS</span>
        <Corner id={inductee.cornerBId} name={inductee.cornerBName} headshot={inductee.cornerBHeadshot} />
      </div>
      <div className="mt-auto border-t border-border pt-3 text-center">
        <p className="font-display text-sm font-bold uppercase leading-tight tracking-tight text-foreground">
          {inductee.displayName}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {inductee.subtitle ? `${inductee.subtitle} · ` : ""}Clase de {inductee.inducteeYear}
        </p>
      </div>
    </div>
  );
}

export function HallOfFameTabs({ data }: { data: HallOfFameData }) {
  const [active, setActive] = useState<HofWing>("modern");
  const items = data[active];
  const activeWing = WINGS.find((w) => w.key === active);

  return (
    <div>
      <div role="tablist" aria-label="Alas del Salón de la Fama" className="flex flex-wrap gap-2">
        {WINGS.map((wing) => {
          const selected = wing.key === active;
          return (
            <button
              key={wing.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(wing.key)}
              className={cn(
                "rounded-full border px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {wing.label}
              <span className={cn("ml-2 tabular", selected ? "opacity-80" : "opacity-60")}>{data[wing.key].length}</span>
            </button>
          );
        })}
      </div>

      {activeWing ? (
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {activeWing.blurb}
        </p>
      ) : null}

      <div
        className={cn(
          "mt-6 grid gap-4",
          active === "fight"
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        )}
      >
        {items.map((inductee, index) =>
          active === "fight" ? (
            <FightCard key={`${inductee.displayName}-${index}`} inductee={inductee} />
          ) : (
            <PersonCard key={`${inductee.displayName}-${index}`} inductee={inductee} />
          ),
        )}
      </div>
    </div>
  );
}
