import {
  radarAxisPoint,
  radarPoint,
  radarPolygonPoints,
  SKILL_AXES,
  type FightSkillRadar,
} from "@/lib/skill-radar";

// Pentágono de habilidades del tale-of-the-tape (maqueta aprobada 19-jul).
// SVG server-rendered sin librerías (patrón stat-donut/ranking-trajectory):
// colores vía var(--corner-red)/var(--corner-blue) (theme-aware) y tooltip
// nativo <title> por vértice. Vértices rojos = círculo, azules = rombo
// (identidad no solo por color).
// viewBox con márgenes laterales (-30 y hasta 490) para que las etiquetas
// GRAPPLING/EXPERIENCIA, ancladas fuera del pentágono, no se recorten.
const VIEW_MIN_X = -30;
const VIEW_W = 520;
const VIEW_H = 400;
const CX = 230;
const CY = 194;
const RADIUS = 138;
// Radio de las etiquetas en px (18% fuera del pentágono). Va por
// radarAxisPoint (radio absoluto, sin clamp): radarPoint acota valores a 100.
const LABEL_RADIUS = RADIUS * 1.18;

const GRID_LEVELS = [20, 40, 60, 80, 100];

type Corner = {
  name: string;
  axes: NonNullable<FightSkillRadar["red"]>;
  colorVar: string;
  marker: "circle" | "diamond";
};

function axisValues(axes: Corner["axes"]): number[] {
  return SKILL_AXES.map((axis) => axes[axis.key]);
}

function CornerSeries({ corner }: { corner: Corner }) {
  const values = axisValues(corner.axes);

  return (
    <g>
      <polygon
        points={radarPolygonPoints(values, CX, CY, RADIUS)}
        fill={corner.colorVar}
        fillOpacity={0.14}
        stroke={corner.colorVar}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {values.map((value, index) => {
        const { x, y } = radarPoint(index, values.length, value, CX, CY, RADIUS);
        const title = `${SKILL_AXES[index].label} — ${corner.name}: percentil ${value}`;
        return corner.marker === "diamond" ? (
          <rect
            key={SKILL_AXES[index].key}
            x={x - 4}
            y={y - 4}
            width={8}
            height={8}
            transform={`rotate(45 ${x} ${y})`}
            fill={corner.colorVar}
          >
            <title>{title}</title>
          </rect>
        ) : (
          <circle key={SKILL_AXES[index].key} cx={x} cy={y} r={4.5} fill={corner.colorVar}>
            <title>{title}</title>
          </circle>
        );
      })}
    </g>
  );
}

export function SkillRadarChart({
  radar,
  redName,
  blueName,
}: {
  radar: FightSkillRadar;
  redName: string;
  blueName: string;
}) {
  const corners: Corner[] = [];
  if (radar.red) {
    corners.push({
      name: redName,
      axes: radar.red,
      colorVar: "var(--corner-red)",
      marker: "circle",
    });
  }
  if (radar.blue) {
    corners.push({
      name: blueName,
      axes: radar.blue,
      colorVar: "var(--corner-blue)",
      marker: "diamond",
    });
  }

  if (corners.length === 0) {
    return null;
  }

  const described = corners
    .map(
      (corner) =>
        `${corner.name}: ${SKILL_AXES.map(
          (axis, i) => `${axis.label} ${axisValues(corner.axes)[i]}`,
        ).join(", ")}`,
    )
    .join(". ");

  return (
    <svg
      viewBox={`${VIEW_MIN_X} 0 ${VIEW_W} ${VIEW_H}`}
      className="mx-auto h-auto w-full max-w-md"
      role="img"
      aria-label={`Radar de habilidades (percentil 0-100). ${described}`}
    >
      {/* Rejilla: pentágonos concéntricos + radios, en trazo recesivo. */}
      {GRID_LEVELS.map((level) => (
        <polygon
          key={level}
          points={radarPolygonPoints(
            SKILL_AXES.map(() => level),
            CX,
            CY,
            RADIUS,
          )}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray={level === 100 ? undefined : "2 4"}
        />
      ))}
      {SKILL_AXES.map((axis, index) => {
        const outer = radarAxisPoint(index, SKILL_AXES.length, CX, CY, RADIUS);
        return (
          <line
            key={axis.key}
            x1={CX}
            y1={CY}
            x2={outer.x}
            y2={outer.y}
            stroke="var(--border)"
            strokeWidth={1}
          />
        );
      })}

      {/* Marcas 50/100 sobre el eje superior, discretas. */}
      {[50, 100].map((level) => {
        const { x, y } = radarPoint(0, SKILL_AXES.length, level, CX, CY, RADIUS);
        return (
          <text
            key={level}
            x={x + 6}
            y={y + 3}
            fill="var(--muted-foreground)"
            fontSize={10}
            className="font-mono tabular-nums"
          >
            {level}
          </text>
        );
      })}

      {/* Etiquetas de eje fuera del pentágono, ancla según el lado. */}
      {SKILL_AXES.map((axis, index) => {
        const { x, y } = radarAxisPoint(
          index,
          SKILL_AXES.length,
          CX,
          CY,
          LABEL_RADIUS,
        );
        const anchor =
          Math.abs(x - CX) < 8 ? "middle" : x > CX ? "start" : "end";
        return (
          <text
            key={axis.key}
            x={x}
            y={y + 4}
            textAnchor={anchor}
            fill="var(--foreground)"
            fontSize={12}
            fontWeight={700}
            className="font-mono uppercase"
            style={{ letterSpacing: "0.08em" }}
          >
            {axis.label}
          </text>
        );
      })}

      {corners.map((corner) => (
        <CornerSeries key={corner.marker} corner={corner} />
      ))}
    </svg>
  );
}
