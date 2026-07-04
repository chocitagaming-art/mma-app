type StatCardProps = {
  label: string;
  value: string;
  helper: string;
};

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-[0_1px_2px_rgba(190,30,20,0.05),0_10px_28px_-14px_rgba(140,35,25,0.16)] transition-shadow hover:shadow-[0_2px_5px_rgba(190,30,20,0.08),0_16px_36px_-16px_rgba(140,35,25,0.24)] dark:shadow-none dark:hover:shadow-none">
      <p className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="tabular mt-2 font-display text-4xl font-extrabold leading-none text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}
