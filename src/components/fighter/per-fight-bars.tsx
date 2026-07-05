import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { formatControlTime } from "@/lib/format";
import type { FighterRateStats } from "@/lib/types";

type PerFightBarsProps = {
  landedPerFight: number;
  absorbedPerFight: number;
  // Tasas por minuto (FE4): calculadas sobre las peleas con duración conocida.
  rateStats: FighterRateStats;
};

export function PerFightBars({
  landedPerFight,
  absorbedPerFight,
  rateStats,
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

  const perMinuteItems = [
    { label: "SLpM", value: rateStats.slpm },
    { label: "SApM", value: rateStats.sapm },
    { label: "Derribos / 15 min", value: rateStats.takedownsPer15Min },
    { label: "Sum. / 15 min", value: rateStats.submissionAttemptsPer15Min },
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
        Promedio sobre las peleas con estadísticas registradas.
      </p>
      {/* POR MINUTO (FE4): solo cuando hay peleas con duración registrada
          (end_round/end_time); si no, se omite sin dejar hueco. */}
      {rateStats.timedFightsCount > 0 ? (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Por minuto
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {perMinuteItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4"
              >
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="tabular text-sm font-semibold text-foreground">
                  {item.value.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/85">
            Pelea media {formatControlTime(Math.round(rateStats.avgFightSeconds))}{" "}
            · sobre {rateStats.timedFightsCount}{" "}
            {rateStats.timedFightsCount === 1 ? "pelea" : "peleas"} con duración
            registrada.
          </p>
        </div>
      ) : null}
    </div>
  );
}
