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

// --- Silueta humana v2 (frontal, atlética, estilo ufc.com) ---
// La mitad IZQUIERDA de cada región se define con curvas Bézier y la derecha se
// genera espejada respecto a x=CX, garantizando simetría perfecta con un único
// path cerrado por región (sin costuras). Tres regiones tintables por separado:
// cabeza+cuello, torso+brazos y piernas. Proporciones ~7.5 cabezas de alto y
// hombros ~2 cabezas de ancho, afinadas con iteración visual (Ronda B).

const CX = 110;

type Pt = readonly [number, number];
type Seg = { c1: Pt; c2: Pt; p: Pt };

const seg = (c1: Pt, c2: Pt, p: Pt): Seg => ({ c1, c2, p });
const mirror = ([x, y]: Pt): Pt => [2 * CX - x, y];

// Baja por la mitad izquierda (start y el punto final del último segmento deben
// estar en x=CX) y vuelve por la derecha espejando los segmentos en orden
// inverso (controles intercambiados), cerrando la silueta.
function symmetricPath(start: Pt, segs: Seg[]): string {
  let d = `M ${start[0]} ${start[1]}`;
  for (const s of segs) {
    d += ` C ${s.c1[0]} ${s.c1[1]}, ${s.c2[0]} ${s.c2[1]}, ${s.p[0]} ${s.p[1]}`;
  }
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const end = i === 0 ? start : segs[i - 1].p;
    const [c1x, c1y] = mirror(segs[i].c2);
    const [c2x, c2y] = mirror(segs[i].c1);
    const [ex, ey] = mirror(end);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
  }
  return `${d} Z`;
}

// Cabeza + cuello (y=12..87): cráneo redondeado, mejilla fundida en un cuello
// recto y grueso; el ensanche hacia los hombros lo pone el trapecio del torso.
const HEAD_PATH = symmetricPath(
  [110, 12],
  [
    seg([99, 12], [89, 19], [88, 34]),
    seg([88, 45], [92, 56], [97, 62]),
    seg([97, 70], [98, 78], [99, 86]),
    seg([103, 86.5], [106, 87], [110, 87]),
  ],
);

// Torso + brazos (y=87..264): trapecio alto, deltoides anchos, brazos separados
// del torso con codo y antebrazo marcados, puño compacto, torso en V con
// cintura y cadera.
const BODY_PATH = symmetricPath(
  [110, 87],
  [
    seg([107, 87], [103, 87], [99, 87]), // base del cuello
    seg([90, 89], [77, 93], [64, 102]), // trapecio
    seg([49, 107], [40, 114], [38, 127]), // deltoides
    seg([38, 140], [40, 155], [43, 172]), // brazo exterior hasta el codo
    seg([45, 182], [40, 190], [39, 202]), // codo y bulto del antebrazo
    seg([38, 216], [41, 228], [45, 240]), // antebrazo a la muñeca
    seg([43, 246], [43, 258], [49, 266]), // puño exterior/inferior
    seg([55, 270], [59, 264], [58, 252]), // puño interior
    seg([57, 240], [56, 226], [58, 208]), // antebrazo interior
    seg([59, 196], [60, 186], [62, 176]), // codo interior
    seg([64, 162], [66, 148], [72, 138]), // bíceps interior hasta la axila
    seg([74, 132], [78, 134], [79, 142]), // axila
    seg([82, 166], [84, 190], [83, 214]), // dorsal/costado a la cintura
    seg([82, 234], [79, 250], [77, 264]), // cintura a la cadera
    seg([88, 264], [99, 264], [110, 264]), // bajo del torso al centro
  ],
);

// Piernas (y=264..492): muslos con masa, rodilla, gemelo más ancho que la
// rodilla, tobillo fino y pie con planta apuntando ligeramente hacia fuera.
const LEGS_PATH = symmetricPath(
  [110, 264],
  [
    seg([99, 264], [88, 264], [77, 264]), // línea de cadera
    seg([72, 288], [73, 318], [78, 346]), // muslo exterior a la rodilla
    seg([79, 356], [74, 366], [74, 380]), // rodilla y salida del gemelo
    seg([75, 404], [81, 430], [84, 452]), // gemelo exterior al tobillo
    seg([84, 462], [79, 468], [73, 474]), // tobillo al empeine
    seg([66, 480], [68, 490], [80, 491]), // punta y planta del pie
    seg([94, 492], [98, 486], [97, 470]), // talón e interior del tobillo
    seg([97, 452], [99, 430], [99, 404]), // gemelo interior
    seg([99, 382], [99, 362], [101, 346]), // rodilla interior
    seg([102, 322], [104, 300], [108, 288]), // muslo interior a la entrepierna
    seg([109, 286], [110, 286], [110, 286]), // entrepierna (centro)
  ],
);

// Silueta: capa base clara (tema-aware vía tokens) + tinte rojo por región con
// opacidad proporcional al % de golpes de esa zona.
function Figure({ data }: { data: FighterStrikeBreakdown }) {
  const regions: { key: ZoneKey; path: string }[] = [
    { key: "head", path: HEAD_PATH },
    { key: "body", path: BODY_PATH },
    { key: "leg", path: LEGS_PATH },
  ];

  return (
    <svg
      viewBox="0 0 220 500"
      className="h-44 w-auto shrink-0"
      role="img"
      aria-label="Silueta de golpes por zona: cabeza, cuerpo y pierna"
    >
      {/* Base de la silueta completa: un único path con las tres regiones
          (winding nonzero) para que las uniones no generen costuras. */}
      <path
        d={`${HEAD_PATH} ${BODY_PATH} ${LEGS_PATH}`}
        fill="var(--muted-foreground)"
        fillOpacity={0.16}
      />
      {/* Tinte rojo por región (mín. 0.12 para que siempre se aprecie) */}
      <g fill="var(--primary)">
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
