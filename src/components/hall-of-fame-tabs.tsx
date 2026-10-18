"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";

import { CountryFlag } from "@/components/country-flag";
import { HallOfFameInducteeModal } from "@/components/hall-of-fame-inductee-modal";
import { HofPhoto, useHofPhoto } from "@/components/hof-photo";
import {
  WING_LABEL,
  buildCutoutIndex,
  latestClass,
  orderByClass,
  personPhotoUrl,
  photoMode,
  resolveHofPhotoUrl,
} from "@/lib/hall-of-fame-display";
import { cn } from "@/lib/utils";
import type { HallOfFameData, HofInductee, HofWing } from "@/lib/queries/hall-of-fame";

const WINGS: { key: HofWing; label: string; blurb: string }[] = [
  { key: "modern", label: WING_LABEL.modern, blurb: "Debut desde el 17 nov 2000" },
  { key: "pioneer", label: WING_LABEL.pioneer, blurb: "Debut antes del 17 nov 2000" },
  { key: "contributor", label: WING_LABEL.contributor, blurb: "Aportaciones fuera del octágono" },
  { key: "fight", label: WING_LABEL.fight, blurb: "Peleas históricas" },
];

type CardSize = "default" | "feature";

function YearLine({ year }: { year: number | null }) {
  return (
    <p className="mt-1 flex items-center justify-center gap-1.5 font-mono text-xs text-muted-foreground">
      <Trophy className="size-3 text-amber-600 dark:text-amber-400" aria-hidden />
      {year ? `Clase de ${year}` : "Salón de la Fama"}
    </p>
  );
}

function WingTag({ wing }: { wing: HofWing }) {
  return (
    <span className="mb-1 inline-block rounded-full border border-amber-500/40 px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
      {WING_LABEL[wing]}
    </span>
  );
}

function PersonCard({
  inductee,
  cutouts,
  size = "default",
  onSelect,
}: {
  inductee: HofInductee;
  cutouts: ReadonlyMap<string, boolean>;
  size?: CardSize;
  onSelect: () => void;
}) {
  const url = personPhotoUrl(inductee);
  const photo = useHofPhoto(url, photoMode(url, cutouts));
  const feature = size === "feature";

  const inner = (
    <>
      <div className="hof-card__stage">
        <HofPhoto
          name={inductee.displayName}
          photo={photo}
          focus={inductee.photoFocus}
          variant={feature ? "feature" : "card"}
          priority={feature}
        />
      </div>
      <div className="hof-card__info min-w-0">
        {feature ? <WingTag wing={inductee.wing} /> : null}
        <p
          className={cn(
            "flex items-center justify-center gap-1.5 font-display font-bold uppercase leading-tight tracking-tight text-foreground",
            feature ? "text-lg" : "text-base",
          )}
        >
          {inductee.nationality ? <CountryFlag nationality={inductee.nationality} /> : null}
          <span className="truncate">{inductee.displayName}</span>
        </p>
        <YearLine year={inductee.inducteeYear} />
      </div>
    </>
  );

  const cardClass = cn("hof-card", feature && "hof-card--feature");
  const common = { "data-photo": photo.mode, "data-hof-card": inductee.displayName };

  // Modern/Pioneer: enlazan a la ficha del luchador (comportamiento existente).
  if (inductee.fighterId) {
    return (
      <Link href={`/fighters/${inductee.fighterId}`} className={cardClass} {...common}>
        {inner}
      </Link>
    );
  }
  // Contributor (sin ficha): se expande en un modal con foto + bio. Solo si hay
  // algo que mostrar, para no abrir un modal vacío antes de que el seed lo pueble.
  if (inductee.photoUrl || inductee.bio) {
    return (
      <button type="button" onClick={onSelect} aria-haspopup="dialog" className={cardClass} {...common}>
        {inner}
      </button>
    );
  }
  return (
    <div className={cardClass} {...common}>
      {inner}
    </div>
  );
}

// Una esquina del cartel (sin enlace): la tarjeta entera abre el modal y los
// enlaces a las fichas viven dentro del modal (evita interactivos anidados).
function Corner({
  side,
  name,
  headshot,
  cutouts,
}: {
  side: "a" | "b";
  name: string | null;
  headshot: string | null;
  cutouts: ReadonlyMap<string, boolean>;
}) {
  const url = resolveHofPhotoUrl(name, headshot);
  const photo = useHofPhoto(url, photoMode(url, cutouts));
  return (
    <div className={`hof-fight__corner hof-fight__corner--${side}`} data-corner={side} data-photo={photo.mode}>
      <HofPhoto name={name ?? "?"} photo={photo} variant="corner" />
      <span className="hof-fight__name">{name ?? "—"}</span>
    </div>
  );
}

function FightCard({
  inductee,
  cutouts,
  size = "default",
  onSelect,
}: {
  inductee: HofInductee;
  cutouts: ReadonlyMap<string, boolean>;
  size?: CardSize;
  onSelect: () => void;
}) {
  const feature = size === "feature";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-haspopup="dialog"
      data-hof-fight={inductee.displayName}
      className={cn("hof-fight", feature && "hof-fight--feature")}
    >
      <div className="hof-fight__stage">
        <Corner side="a" name={inductee.cornerAName} headshot={inductee.cornerAHeadshot} cutouts={cutouts} />
        <span className="hof-fight__vs" aria-hidden>
          VS
        </span>
        <Corner side="b" name={inductee.cornerBName} headshot={inductee.cornerBHeadshot} cutouts={cutouts} />
      </div>
      <div className="hof-fight__info">
        {feature ? <WingTag wing="fight" /> : null}
        <p
          className={cn(
            "font-display font-bold uppercase leading-tight tracking-tight text-foreground",
            feature ? "text-base" : "text-sm",
          )}
        >
          {inductee.displayName}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {inductee.subtitle ? `${inductee.subtitle} · ` : ""}Clase de {inductee.inducteeYear}
        </p>
      </div>
    </button>
  );
}

function Card({
  inductee,
  cutouts,
  size,
  onSelect,
}: {
  inductee: HofInductee;
  cutouts: ReadonlyMap<string, boolean>;
  size?: CardSize;
  onSelect: (inductee: HofInductee) => void;
}) {
  return inductee.wing === "fight" ? (
    <FightCard inductee={inductee} cutouts={cutouts} size={size} onSelect={() => onSelect(inductee)} />
  ) : (
    <PersonCard inductee={inductee} cutouts={cutouts} size={size} onSelect={() => onSelect(inductee)} />
  );
}

// La última promoción, destacada ENCIMA de las pestañas (decisión del dueño,
// 18-oct): sus tarjetas más grandes (4 columnas como mucho, frente a las 5 de
// la pestaña), con la etiqueta de su ala. La pelea ocupa dos columnas; si las
// personas llenan sus filas, va centrada debajo.
function LatestClassBlock({
  year,
  items,
  cutouts,
  onSelect,
}: {
  year: number;
  items: HofInductee[];
  cutouts: ReadonlyMap<string, boolean>;
  onSelect: (inductee: HofInductee) => void;
}) {
  const headingId = useId();
  const people = items.filter((i) => i.wing !== "fight").length;
  return (
    <section
      aria-labelledby={headingId}
      data-hof-latest-class={year}
      className="mb-10 rounded-xl border border-amber-500/30 bg-[linear-gradient(180deg,color-mix(in_oklch,#d4a017_9%,var(--card)),transparent_70%)] p-4 sm:p-6"
    >
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
        La promoción más reciente
      </p>
      <h2 id={headingId} className="mt-1 font-display text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-3xl">
        Clase de {year}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {items.length === 1 ? "1 nuevo miembro" : `${items.length} nuevos miembros`} del Salón de la Fama.
      </p>
      <ul className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((inductee) => (
          <li
            key={`${inductee.wing}-${inductee.displayName}`}
            className={cn(
              "min-w-0",
              inductee.wing === "fight" ? "col-span-2" : "col-span-1",
              inductee.wing === "fight" && people % 4 === 0 && "lg:col-start-2",
            )}
          >
            <Card inductee={inductee} cutouts={cutouts} size="feature" onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HallOfFameTabs({ data }: { data: HallOfFameData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const baseId = useId();
  // Inductee abierto en el modal (Contributor/Fight). null = cerrado.
  const [selected, setSelected] = useState<HofInductee | null>(null);
  // El ala activa se DERIVA de la URL (?wing=), no de estado local, para que el
  // botón "atrás" del navegador (tras abrir el perfil de un luchador) devuelva al
  // ala correcta en vez de resetear siempre a "modern".
  const wingParam = searchParams.get("wing");
  const active: HofWing = WINGS.some((w) => w.key === wingParam)
    ? (wingParam as HofWing)
    : "modern";

  const cutouts = useMemo(() => buildCutoutIndex(data), [data]);
  const latest = useMemo(() => latestClass(data), [data]);

  function selectWing(wing: HofWing) {
    const next = new URLSearchParams(searchParams.toString());
    if (wing === "modern") next.delete("wing");
    else next.set("wing", wing);
    const qs = next.toString();
    router.replace(`${pathname ?? "/salon-de-la-fama"}${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  }

  // De la promoción más nueva a la más vieja (decisión del dueño, 18-oct).
  const items = useMemo(() => orderByClass(data[active]), [data, active]);
  const activeWing = WINGS.find((w) => w.key === active);
  const tabId = (wing: HofWing) => `${baseId}-tab-${wing}`;
  const panelId = `${baseId}-panel`;

  // Estable: el modal reengancha Escape, el scroll y el foco cuando cambia.
  const closeModal = useCallback(() => setSelected(null), []);

  return (
    <div>
      {latest ? (
        <LatestClassBlock year={latest.year} items={latest.items} cutouts={cutouts} onSelect={setSelected} />
      ) : null}

      <div role="tablist" aria-label="Alas del Salón de la Fama" className="flex flex-wrap gap-2">
        {WINGS.map((wing) => {
          const isActive = wing.key === active;
          return (
            <button
              key={wing.key}
              id={tabId(wing.key)}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              onClick={() => selectWing(wing.key)}
              className={cn(
                "rounded-full border px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {wing.label}
              {/* Sin opacidad: con ella el contador no llegaba a 4,5:1 (axe, 18-oct). */}
              <span className="ml-2 font-normal tabular">{data[wing.key].length}</span>
            </button>
          );
        })}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId(active)}>
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
          {items.map((inductee) => (
            <Card
              key={`${inductee.wing}-${inductee.displayName}`}
              inductee={inductee}
              cutouts={cutouts}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>

      {selected ? (
        <HallOfFameInducteeModal inductee={selected} cutouts={cutouts} onClose={closeModal} />
      ) : null}
    </div>
  );
}
