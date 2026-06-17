import { Card, CardContent } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: string;
  helper: string;
};

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <Card className="border-white/10 bg-white/5 shadow-2xl shadow-black/20 backdrop-blur">
      <CardContent className="space-y-3 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
          {label}
        </p>
        <p className="text-3xl font-semibold text-white">{value}</p>
        <p className="text-sm text-zinc-400">{helper}</p>
      </CardContent>
    </Card>
  );
}