// Geometry for rendering donut / pie rings as static (server-renderable) SVG,
// matching a recharts <Pie stroke="none"> with inner/outer radius. A ring is
// drawn as a single stroked <circle>: the stroke spans innerRadius..outerRadius,
// so its mid-line radius is their average and strokeWidth is their difference.
// Arc segments are produced with stroke-dasharray; butt-capped dashes give
// radial edges identical to recharts slices, and rotating the circle -90deg
// makes arcs start at 12 o'clock and sweep clockwise (recharts' default here).

export type DonutRing = {
  radius: number;
  strokeWidth: number;
  circumference: number;
};

export function donutRing(innerRadius: number, outerRadius: number): DonutRing {
  const radius = (innerRadius + outerRadius) / 2;
  return {
    radius,
    strokeWidth: outerRadius - innerRadius,
    circumference: 2 * Math.PI * radius,
  };
}

export function clampFraction(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export type DonutArc = {
  dashArray: string;
  dashOffset: number;
};

// A single arc covering `fraction` of the ring, starting at the ring origin.
export function donutArc(fraction: number, circumference: number): DonutArc {
  const length = clampFraction(fraction) * circumference;
  return {
    dashArray: `${length} ${circumference - length}`,
    dashOffset: 0,
  };
}

// Consecutive pie arcs: each segment starts where the previous one ended, sized
// by its share of the total. Negative values count as 0; a zero total yields
// empty arcs. The clockwise offset is encoded as a negative stroke-dashoffset.
export function donutSegments(
  values: number[],
  circumference: number,
): DonutArc[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  let cumulative = 0;

  return values.map((value) => {
    const fraction = total > 0 ? Math.max(0, value) / total : 0;
    const length = fraction * circumference;
    const arc: DonutArc = {
      dashArray: `${length} ${circumference - length}`,
      dashOffset: -cumulative,
    };
    cumulative += length;
    return arc;
  });
}
