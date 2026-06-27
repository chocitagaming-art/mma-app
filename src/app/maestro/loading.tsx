import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for /maestro. Mirrors the chat shell: header (avatar + title),
// the centred empty-state with example prompts, and the composer at the bottom.
export default function MaestroLoading() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-13rem)] w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex h-full flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <Skeleton className="size-11 shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>

        {/* Empty-state body */}
        <div className="flex-1 py-6">
          <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-10 text-center">
            <Skeleton className="h-8 w-72 max-w-full" />
            <div className="mt-3 w-full space-y-2">
              <Skeleton className="mx-auto h-4 w-full max-w-md" />
              <Skeleton className="mx-auto h-4 w-5/6 max-w-md" />
            </div>
            <div className="mt-7 grid w-full gap-2.5 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border pt-4">
          <div className="flex items-end gap-2">
            <Skeleton className="h-11 flex-1 rounded-xl" />
            <Skeleton className="h-11 w-12 shrink-0 rounded-md" />
          </div>
          <Skeleton className="mt-2 h-3 w-64" />
        </div>
      </div>
    </div>
  );
}
