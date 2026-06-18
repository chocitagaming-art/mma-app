import { cn } from "@/lib/utils";

type ComparisonStatRowProps = {
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: number | null;
  rightValue: number | null;
  leftDisplay: string;
  rightDisplay: string;
  higherIsBetter?: boolean;
};

function getPercentages(leftValue: number, rightValue: number) {
  const total = leftValue + rightValue;

  if (total <= 0) {
    return { left: 50, right: 50 };
  }

  return {
    left: (leftValue / total) * 100,
    right: (rightValue / total) * 100,
  };
}

export function ComparisonStatRow({
  label,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  leftDisplay,
  rightDisplay,
  higherIsBetter = true,
}: ComparisonStatRowProps) {
  const safeLeft = leftValue ?? 0;
  const safeRight = rightValue ?? 0;
  const { left, right } = getPercentages(safeLeft, safeRight);
  const leftWins = higherIsBetter ? safeLeft > safeRight : safeLeft < safeRight;
  const rightWins = higherIsBetter ? safeRight > safeLeft : safeRight < safeLeft;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-left">
          <p
            className={cn(
              "text-lg font-semibold tabular-nums text-foreground transition",
              leftWins && "text-primary",
            )}
          >
            {leftDisplay}
          </p>
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {leftLabel}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {label}
          </p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "text-lg font-semibold tabular-nums text-foreground transition",
              rightWins && "text-primary",
            )}
          >
            {rightDisplay}
          </p>
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {rightLabel}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full bg-muted-foreground/40 transition-all",
              leftWins && "bg-primary",
            )}
            style={{ width: `${left}%`, marginLeft: `${100 - left}%` }}
          />
        </div>
        <div className="rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          VS
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full bg-muted-foreground/40 transition-all",
              rightWins && "bg-primary",
            )}
            style={{ width: `${right}%` }}
          />
        </div>
      </div>
    </div>
  );
}