import { Progress } from "@/components/ui/progress";

type StatBarProps = {
  label: string;
  value: string;
  progress: number;
  helper?: string;
};

export function StatBar({ label, value, progress, helper }: StatBarProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="tabular text-sm font-semibold text-foreground">{value}</p>
      </div>
      <Progress value={Math.max(0, Math.min(100, progress * 100))} className="h-2" />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}