import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for /videos. Mirrors the section heading and the category sections,
// each a 3-column grid of video cards (player + title + channel).
export default function VideosLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      {Array.from({ length: 2 }).map((_, section) => (
        <section key={section} className="space-y-6">
          <Skeleton className="h-7 w-56" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((__, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-video w-full rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
