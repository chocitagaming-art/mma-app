"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { useState } from "react";

import { CountryFlag } from "@/components/country-flag";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { HallOfFameInducteeModal } from "@/components/hall-of-fame-inductee-modal";
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

function PersonCard({ inductee, onSelect }: { inductee: HofInductee; onSelect: () => void }) {
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

  // Modern/Pioneer: enlazan a la ficha del luchador (comportamiento existente).
  if (inductee.fighterId) {
    return (
      <Link href={`/fighters/${inductee.fighterId}`} className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {body}
      </Link>
    );
  }
  // Contributor (sin ficha): se expande en un modal con foto + bio. Solo si hay
  // algo que mostrar, para no abrir un modal vacío antes de que el seed lo pueble.
  if (inductee.photoUrl || inductee.bio) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-haspopup="dialog"
        className="block h-full w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </button>
    );
  }
  return body;
}

// Esquina estática de la card de Fight (sin enlace): la card entera abre el modal
// y los enlaces a las fichas viven dentro del modal (evita interactivos anidados).
function CornerStatic({ name, headshot }: { name: string | null; headshot: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <FighterHeadshot name={name ?? "?"} headshotUrl={headshot} size="md" className="border border-border" />
      <span className="max-w-[7rem] truncate text-center text-xs font-medium text-foreground">{name ?? "—"}</span>
    </div>
  );
}

function FightCard({ inductee, onSelect }: { inductee: HofInductee; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-haspopup="dialog"
      className="flex h-full w-full flex-col gap-3 rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-amber-400/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-center gap-3">
        <CornerStatic name={inductee.cornerAName} headshot={inductee.cornerAHeadshot} />
        <span className="mt-4 font-display text-lg font-extrabold text-primary">VS</span>
        <CornerStatic name={inductee.cornerBName} headshot={inductee.cornerBHeadshot} />
      </div>
      <div className="mt-auto border-t border-border pt-3 text-center">
        <p className="font-display text-sm font-bold uppercase leading-tight tracking-tight text-foreground">
          {inductee.displayName}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {inductee.subtitle ? `${inductee.subtitle} · ` : ""}Clase de {inductee.inducteeYear}
        </p>
      </div>
    </button>
  );
}

export function HallOfFameTabs({ data }: { data: HallOfFameData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Inductee abierto en el modal (Contributor/Fight). null = cerrado.
  const [selected, setSelected] = useState<HofInductee | null>(null);
  // El ala activa se DERIVA de la URL (?wing=), no de estado local, para que el
  // botón "atrás" del navegador (tras abrir el perfil de un luchador) devuelva al
  // ala correcta en vez de resetear siempre a "modern".
  const wingParam = searchParams.get("wing");
  const active: HofWing = WINGS.some((w) => w.key === wingParam)
    ? (wingParam as HofWing)
    : "modern";

  function selectWing(wing: HofWing) {
    const next = new URLSearchParams(searchParams.toString());
    if (wing === "modern") next.delete("wing");
    else next.set("wing", wing);
    const qs = next.toString();
    router.replace(`${pathname ?? "/salon-de-la-fama"}${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  }

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
              onClick={() => selectWing(wing.key)}
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
            <FightCard
              key={`${inductee.displayName}-${index}`}
              inductee={inductee}
              onSelect={() => setSelected(inductee)}
            />
          ) : (
            <PersonCard
              key={`${inductee.displayName}-${index}`}
              inductee={inductee}
              onSelect={() => setSelected(inductee)}
            />
          ),
        )}
      </div>

      {selected ? (
        <HallOfFameInducteeModal inductee={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
