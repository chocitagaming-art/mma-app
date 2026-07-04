import { Crosshair, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

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

// --- Silueta humana v3 (máscara CSS sobre PNG profesional) ---
// La anatomía la pone public/brand/strike-silhouette-mask.png (silueta CC0,
// svgsilh.com/image/154300, dominio público) en lugar de un path dibujado a
// mano. El div enmascarado se rellena con bandas horizontales — cabeza, torso
// y piernas — teñidas según el % de golpes de cada zona. El PNG y los cortes
// anatómicos salen de scripts/prepare-silhouette-mask.mjs.

const MASK_URL = "/brand/strike-silhouette-mask.png";
// Dimensiones del PNG; el contenedor replica su proporción para que
// mask-size 100% 100% no deforme la figura.
const MASK_RATIO = "334 / 1000";
// Cortes medidos sobre el PNG: cuello al 12.5%; piernas al 60% para que los
// puños (llegan hasta el 60% de altura) queden en la banda del torso y no
// reciban el tinte de pierna (la separación visual de los muslos empieza ~62%).
const BANDS: { key: ZoneKey; from: number; to: number }[] = [
  { key: "head", from: 0, to: 12.5 },
  { key: "body", from: 12.5, to: 60 },
  { key: "leg", from: 60, to: 100 },
];

const MASK_STYLE: CSSProperties = {
  maskImage: `url(${MASK_URL})`,
  maskSize: "100% 100%",
  maskRepeat: "no-repeat",
  WebkitMaskImage: `url(${MASK_URL})`,
  WebkitMaskSize: "100% 100%",
  WebkitMaskRepeat: "no-repeat",
  // En Windows Alto Contraste los background se fuerzan a Canvas y los
  // gradientes se eliminan, borrando la figura; se preserva como gráfica.
  forcedColorAdjust: "none",
};

// Silueta: capa base clara (tema-aware vía tokens) + bandas de tinte rojo con
// opacidad proporcional al % de golpes de cada zona. Bordes de zona duros,
// como el mapa de golpes de ufc.com.
function Figure({ data }: { data: FighterStrikeBreakdown }) {
  const gradient = `linear-gradient(to bottom, ${BANDS.map(
    ({ key, from, to }) => {
      const tint = Math.round(
        zoneOpacity(zoneShare(data[key], data.totalLanded)) * 100,
      );
      const color = `color-mix(in srgb, var(--primary) ${tint}%, transparent)`;
      return `${color} ${from}%, ${color} ${to}%`;
    },
  ).join(", ")})`;

  return (
    <div
      className="relative h-44 shrink-0"
      style={{ aspectRatio: MASK_RATIO }}
      role="img"
      aria-label="Silueta de golpes por zona: cabeza, cuerpo y pierna"
    >
      <div
        className="absolute inset-0"
        style={{
          ...MASK_STYLE,
          backgroundColor: "var(--muted-foreground)",
          opacity: 0.16,
        }}
      />
      <div
        className="absolute inset-0"
        style={{ ...MASK_STYLE, backgroundImage: gradient }}
      />
    </div>
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
              style={{ opacity: zoneOpacity(share), forcedColorAdjust: "none" }}
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
    <div className="rounded-xl border border-border/60 bg-muted/70 p-4 dark:bg-muted/40">
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
