import { PREMIUM_TILE } from "@/components/fighter/premium-tile";

type DefenseMeterProps = {
  label: string;
  value: number; // 0..1
  helper?: string;
};

export function DefenseMeter({ label, value, helper }: DefenseMeterProps) {
  const pct = Math.max(0, Math.min(100, value * 100));

  return (
    <div className={`space-y-3 p-4 ${PREMIUM_TILE}`}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="tabular text-sm font-semibold text-foreground">
          {Math.round(pct)}%
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-win transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
