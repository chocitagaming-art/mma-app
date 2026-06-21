"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import type { FighterWinMethods } from "@/lib/types";

const SLICES = [
  { key: "koTko", label: "KO/TKO", color: "var(--chart-1)" },
  { key: "submission", label: "Sumisión", color: "var(--chart-2)" },
  { key: "decision", label: "Decisión", color: "var(--chart-3)" },
  { key: "other", label: "Otro", color: "var(--chart-5)" },
] as const;

export function WinMethodChart({ methods }: { methods: FighterWinMethods }) {
  const data = SLICES.map((slice) => ({
    ...slice,
    value: methods[slice.key],
  })).filter((slice) => slice.value > 0);

  return (
    <div className="rounded-2xl border border-border bg-muted p-5">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Victorias por método
      </p>
      <div className="mt-4 flex items-center gap-6">
        <div className="relative h-32 w-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius="60%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((slice) => (
                  <Cell key={slice.key} fill={slice.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="tabular font-display text-3xl font-extrabold leading-none text-foreground">
              {methods.total}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              victorias
            </span>
          </div>
        </div>
        <ul className="flex-1 space-y-2">
          {data.map((slice) => (
            <li key={slice.key} className="flex items-center gap-2.5 text-sm">
              <span
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-muted-foreground">{slice.label}</span>
              <span className="tabular ml-auto font-semibold text-foreground">
                {slice.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
