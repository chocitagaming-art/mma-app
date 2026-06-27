import { formatPercentage } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProbabilityBar({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="tabular text-base font-semibold text-foreground">
          {formatPercentage(value)}
        </p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        />
      </div>
    </div>
  );
}
