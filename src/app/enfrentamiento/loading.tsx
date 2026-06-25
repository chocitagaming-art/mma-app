import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Loading UI for /enfrentamiento. Mirrors the matchup builder card (heading +
// the two corner comboboxes around the VS badge) and the empty-state placeholder
// shown before both corners are picked.
export default function EnfrentamientoLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="space-y-10">
        {/* Builder card */}
        <Card className="overflow-visible border-border bg-card">
          <CardContent className="space-y-8 p-6 sm:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-80 max-w-full" />
                <Skeleton className="h-4 w-full max-w-xl" />
              </div>
              <Skeleton className="h-14 w-64 rounded-2xl" />
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
              <div className="flex justify-center pb-2">
                <Skeleton className="size-12" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Empty-state placeholder */}
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-20 text-center">
            <Skeleton className="size-16 rounded-3xl" />
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-8 w-72 max-w-full" />
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="h-4 w-5/6 max-w-2xl" />
            </div>
            <Skeleton className="h-10 w-40 rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
