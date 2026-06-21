"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

type StatDonutProps = {
  label: string;
  value: number; // 0..1
  helper?: string;
  colorVar?: string; // CSS var string, e.g. "var(--chart-1)"
};

export function StatDonut({
  label,
  value,
  helper,
  colorVar = "var(--chart-1)",
}: StatDonutProps) {
  const pct = Math.max(0, Math.min(1, value));
  const data = [
    { name: "value", value: pct },
    { name: "rest", value: 1 - pct },
  ];

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-muted p-4">
      <div className="relative h-28 w-28">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={colorVar} />
              <Cell fill="var(--border)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="tabular font-display text-2xl font-extrabold leading-none text-foreground">
            {Math.round(pct * 100)}%
          </span>
        </div>
      </div>
      <p className="text-center font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      {helper ? (
        <p className="tabular text-center text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}
