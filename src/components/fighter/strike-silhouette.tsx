import { Crosshair, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { formatPercentage } from "@/lib/format";
import type {
  FighterStrikeBreakdown,
  FighterStrikeProfile,
  StrikeZoneStat,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type ZoneKey = "head" | "body" | "leg";
type PositionKey = "distance" | "clinch" | "ground";

const ZONES: { key: ZoneKey; label: string }[] = [
  { key: "head", label: "Cabeza" },
  { key: "body", label: "Cuerpo" },
  { key: "leg", label: "Pierna" },
];

const POSITIONS: { key: PositionKey; label: string }[] = [
  { key: "distance", label: "A distancia" },
  { key: "clinch", label: "Clinch" },
  { key: "ground", label: "Suelo" },
];

function accuracy(zone: StrikeZoneStat): number {
  return zone.attempted > 0 ? zone.landed / zone.attempted : 0;
}

function hasStrikeData(data: FighterStrikeBreakdown): boolean {
  return [...ZONES, ...POSITIONS].some(({ key }) => {
    const zone = data[key];
    return zone.landed > 0 || zone.attempted > 0;
  });
}

// Muñeco SVG: cada región (cabeza/cuerpo/pierna) se tiñe con el rojo de marca a
// una opacidad proporcional al VOLUMEN de golpes de esa zona (normalizado a la
// zona más golpeada → rojo intenso = más golpes).
function Figure({ data }: { data: FighterStrikeBreakdown }) {
  const maxZone = Math.max(data.head.landed, data.body.landed, data.leg.landed, 1);
  const intensity = (zone: StrikeZoneStat) => 0.14 + 0.86 * (zone.landed / maxZone);
  const fill = "var(--primary)";

  return (
    <svg
      viewBox="0 0 120 230"
      className="h-28 w-auto shrink-0"
      role="img"
      aria-label="Silueta de golpes por zona"
    >
      <g stroke="var(--border)" strokeWidth={1.5} strokeLinejoin="round">
        {/* Cabeza */}
        <circle cx="60" cy="26" r="18" fill={fill} fillOpacity={intensity(data.head)} />
        {/* Cuerpo (torso + brazos) */}
        <g fill={fill} fillOpacity={intensity(data.body)}>
          <path d="M 41 50 L 79 50 L 76 132 L 44 132 Z" />
          <path d="M 41 52 L 30 56 L 22 120 L 31 122 L 42 72 Z" />
          <path d="M 79 52 L 90 56 L 98 120 L 89 122 L 78 72 Z" />
        </g>
        {/* Piernas */}
        <g fill={fill} fillOpacity={intensity(data.leg)}>
          <path d="M 45 134 L 59 134 L 57 224 L 46 224 Z" />
          <path d="M 61 134 L 75 134 L 74 224 L 63 224 Z" />
        </g>
      </g>
    </svg>
  );
}

function ZoneLegend({ data }: { data: FighterStrikeBreakdown }) {
  const maxZone = Math.max(data.head.landed, data.body.landed, data.leg.landed, 1);

  return (
    <ul className="flex-1 space-y-2">
      {ZONES.map(({ key, label }) => {
        const zone = data[key];
        const opacity = 0.14 + 0.86 * (zone.landed / maxZone);

        return (
          <li key={key} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: "var(--primary)", opacity }}
            />
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular ml-auto text-xs text-muted-foreground">
              {zone.landed}/{zone.attempted}
            </span>
            <span className="tabular w-9 text-right font-semibold text-foreground">
              {formatPercentage(accuracy(zone))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PositionBars({ data }: { data: FighterStrikeBreakdown }) {
  return (
    <div className="space-y-2.5">
      {POSITIONS.map(({ key, label }) => {
        const zone = data[key];
        const acc = accuracy(zone);

        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="tabular text-xs text-muted-foreground">
                {zone.landed}/{zone.attempted}{" "}
                <span className="font-semibold text-foreground">
                  {formatPercentage(acc)}
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${Math.round(acc * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  data,
}: {
  title: string;
  icon: LucideIcon;
  data: FighterStrikeBreakdown;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Icon className="size-3.5 text-primary" />
          {title}
        </p>
        <p className="tabular text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {data.totalLanded} golpes
        </p>
      </div>
      {hasStrikeData(data) ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Figure data={data} />
            <ZoneLegend data={data} />
          </div>
          <PositionBars data={data} />
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Estadísticas de zona no disponibles
        </p>
      )}
    </div>
  );
}

export function StrikeSilhouette({ profile }: { profile: FighterStrikeProfile }) {
  return (
    <section className={cn(PREMIUM_TILE, "space-y-4 p-5")}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Silueta de golpes
        </p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Intensidad = volumen
        </p>
      </div>
      <div className="grid gap-4">
        <Panel title="Ofensiva" icon={Crosshair} data={profile.offense} />
        <Panel title="Defensiva" icon={Shield} data={profile.defense} />
      </div>
    </section>
  );
}
