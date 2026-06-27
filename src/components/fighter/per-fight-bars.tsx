import { PREMIUM_TILE } from "@/components/fighter/premium-tile";

type PerFightBarsProps = {
  landedPerFight: number;
  absorbedPerFight: number;
};

export function PerFightBars({
  landedPerFight,
  absorbedPerFight,
}: PerFightBarsProps) {
  const max = Math.max(landedPerFight, absorbedPerFight, 1);
  const rows = [
    {
      label: "Golpes sig. conectados / pelea",
      value: landedPerFight,
      color: "bg-chart-1",
    },
    {
      label: "Golpes sig. recibidos / pelea",
      value: absorbedPerFight,
      color: "bg-chart-3",
    },
  ];

  return (
    <div className={`space-y-4 p-5 ${PREMIUM_TILE}`}>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Volumen de golpeo
      </p>
      {rows.map((row) => (
        <div key={row.label} className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{row.label}</p>
            <p className="tabular text-sm font-semibold text-foreground">
              {row.value.toFixed(1)}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full ${row.color} transition-[width] duration-500 ease-out`}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground/85">
        Promedio por pelea registrada (la BD no almacena la duración exacta del
        combate).
      </p>
    </div>
  );
}
