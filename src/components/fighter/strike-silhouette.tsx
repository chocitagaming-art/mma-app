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

// % del total de golpes conectados que fue a cada zona (como ufc.com:
// "Sig. Str. by target"). No confundir con la precisión (landed/attempted).
function zoneShare(zone: StrikeZoneStat, totalLanded: number): number {
  return totalLanded > 0 ? zone.landed / totalLanded : 0;
}

// Opacidad del tinte rojo: proporcional al % de golpes de la zona, con un
// mínimo de 0.12 para que toda región sea siempre visible.
function zoneOpacity(share: number): number {
  return 0.12 + 0.88 * share;
}

function hasStrikeData(data: FighterStrikeBreakdown): boolean {
  return [...ZONES, ...POSITIONS].some(({ key }) => {
    const zone = data[key];
    return zone.landed > 0 || zone.attempted > 0;
  });
}

// --- Silueta humana de cuerpo entero (frontal), estilo ufc.com ---
// Tres regiones como paths independientes: cabeza+cuello, torso+brazos
// (tres subtrazados en un mismo path: el winding nonzero evita costuras al
// solaparse hombro y torso) y piernas. Coordenadas simétricas respecto a
// x=110 en un viewBox de 220x520.

const HEAD_PATH = `
  M110 12
  C 95 12 85 24 85 43
  C 85 57 91 69 98 75
  L 98 85
  C 98 92 94 97 87 100
  L 133 100
  C 126 97 122 92 122 85
  L 122 75
  C 129 69 135 57 135 43
  C 135 24 125 12 110 12
  Z`;

const BODY_PATH = `
  M83 103
  L 137 103
  C 142 116 144 132 142 148
  C 139 172 137 190 137 205
  C 137 225 139 243 141 258
  L 79 258
  C 81 243 83 225 83 205
  C 83 190 81 172 78 148
  C 76 132 78 116 83 103
  Z
  M82 105
  C 70 109 62 117 58 129
  C 54 143 51 158 49 175
  C 47 192 44 208 41 224
  C 38 240 35 254 33 268
  C 31 279 32 288 36 294
  C 41 301 49 300 52 292
  C 55 284 56 274 58 263
  C 61 246 64 229 67 212
  C 70 194 73 176 75 158
  C 77 143 79 124 82 105
  Z
  M138 105
  C 150 109 158 117 162 129
  C 166 143 169 158 171 175
  C 173 192 176 208 179 224
  C 182 240 185 254 187 268
  C 189 279 188 288 184 294
  C 179 301 171 300 168 292
  C 165 284 164 274 162 263
  C 159 246 156 229 153 212
  C 150 194 147 176 145 158
  C 143 143 141 124 138 105
  Z`;

const LEGS_PATH = `
  M79 260
  L 141 260
  C 144 288 142 312 138 336
  C 135 358 133 375 133 392
  C 133 418 131 444 129 468
  L 129 484
  C 130 495 128 503 122 505
  L 116 505
  C 113 503 112 497 113 489
  L 114 470
  C 116 448 117 424 117 400
  C 117 375 116 358 116 336
  C 115 315 113 296 110 284
  C 107 296 105 315 104 336
  C 104 358 103 375 103 400
  C 103 424 104 448 106 470
  L 107 489
  C 108 497 107 503 104 505
  L 98 505
  C 92 503 90 495 91 484
  L 91 468
  C 89 444 87 418 87 392
  C 87 375 85 358 82 336
  C 78 312 76 288 79 260
  Z`;

// Silueta: capa base gris clara (tema-aware vía tokens) + tinte rojo por
// región con opacidad proporcional al % de golpes de esa zona.
function Figure({ data }: { data: FighterStrikeBreakdown }) {
  const regions: { key: ZoneKey; path: string }[] = [
    { key: "head", path: HEAD_PATH },
    { key: "body", path: BODY_PATH },
    { key: "leg", path: LEGS_PATH },
  ];

  return (
    <svg
      viewBox="0 0 220 520"
      className="h-44 w-auto shrink-0"
      role="img"
      aria-label="Silueta de golpes por zona: cabeza, cuerpo y pierna"
    >
      {/* Base gris de la silueta completa */}
      <g fill="var(--muted-foreground)" fillOpacity={0.16}>
        {regions.map(({ key, path }) => (
          <path key={`base-${key}`} d={path} />
        ))}
      </g>
      {/* Tinte rojo por región (mín. 0.12 para que siempre se aprecie) */}
      <g fill="var(--primary)" stroke="var(--border)" strokeWidth={1}>
        {regions.map(({ key, path }) => (
          <path
            key={`tint-${key}`}
            d={path}
            fillOpacity={zoneOpacity(zoneShare(data[key], data.totalLanded))}
          />
        ))}
      </g>
    </svg>
  );
}

// Lista estilo ufc.com: "Cabeza · golpes · %" con numerales tabulares.
function ZoneLegend({ data }: { data: FighterStrikeBreakdown }) {
  return (
    <ul className="flex-1 space-y-2.5">
      {ZONES.map(({ key, label }) => {
        const zone = data[key];
        const share = zoneShare(zone, data.totalLanded);

        return (
          <li key={key} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-3 shrink-0 rounded-sm bg-primary"
              style={{ opacity: zoneOpacity(share) }}
            />
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular ml-auto text-xs text-muted-foreground">
              {zone.landed}
            </span>
            <span className="tabular w-11 text-right font-display text-base font-bold text-foreground">
              {formatPercentage(share)}
            </span>
          </li>
        );
      })}
      <li className="border-t border-border/60 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground/85">
        % del total de golpes conectados
      </li>
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
        <p className="tabular text-[10px] uppercase tracking-wide text-muted-foreground/85">
          {data.totalLanded} golpes
        </p>
      </div>
      {hasStrikeData(data) ? (
        <div className="space-y-4">
          <div className="flex items-center gap-5">
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

export function StrikeSilhouette({
  profile,
  // The head-to-head reuses this side by side under a shared section heading, so
  // it hides the internal title to avoid repeating "Silueta de golpes" 3 times.
  showHeader = true,
}: {
  profile: FighterStrikeProfile;
  showHeader?: boolean;
}) {
  return (
    <section className={cn(PREMIUM_TILE, "space-y-4 p-5")}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Silueta de golpes
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/85">
            Intensidad = % de golpes
          </p>
        </div>
      ) : null}
      <div className="grid gap-4">
        <Panel title="Ofensiva" icon={Crosshair} data={profile.offense} />
        <Panel title="Defensiva" icon={Shield} data={profile.defense} />
      </div>
    </section>
  );
}
