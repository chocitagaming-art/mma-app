import { ROW_LAYOUTS, rowGeometry } from "@/components/event-bout-row-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Loading UI for /eventos/[id], drawn with the page's own boxes so the card
// lands where the skeleton was (page.tsx): the back link, the poster big and
// centred above the title, the header's text block (eyebrow, name, tagline,
// meta, schedule and buttons) and the bout rows with the big faces.
//
// 🪤 It cannot know which event is coming, and the real header changes with
// it: measured on 30-oct-2026 over the six upcoming events, the first row lands
// between y=692 and y=785 at 390 px and between 869 and 897 at 1280. The text
// block is drawn as a Fight Night with prelims, the shape of almost every week:
// line for line, the heights below are those of /eventos/1099 and /1095.
// e2e/evento-caras.spec.ts measures skeleton against page.
//
// The rows share ROW_LAYOUTS.large with EventBoutRow (its geometry only: a
// skeleton row is not a link and must not light up on hover), inside the frame
// of EventBoutDisclosure: the row plus its chevron column.

const L = ROW_LAYOUTS.large;
const ROW = rowGeometry(L);

/** A line of text: a box as tall as the real line, with a bar inside. */
function Line({ className, bar }: { className: string; bar: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <Skeleton className={bar} />
    </div>
  );
}

function BoutRowSkeleton() {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">
          <div className={ROW}>
            <div className={L.redCorner}>
              <Skeleton className={cn(L.headshot, "rounded-md")} />
              <div className={L.text}>
                {/* The name (text-sm, 20 px) and the record (text-xs, 16 px). */}
                <Line className="h-5" bar="h-3.5 w-28 max-w-full" />
                <Line className="h-4" bar="h-3 w-16" />
              </div>
            </div>
            <div className={L.centre}>
              <Skeleton className="h-3 w-6" />
            </div>
            <div className={L.blueCorner}>
              <Skeleton className={cn(L.headshot, "rounded-md")} />
              <div className={L.text}>
                <Line className="h-5 justify-end" bar="h-3.5 w-28 max-w-full" />
                <Line className="h-4 justify-end" bar="h-3 w-16" />
              </div>
            </div>
          </div>
        </div>
        {/* The chevron's column (EventBoutDisclosure): 36 px, 40 from sm. */}
        <div className="w-9 shrink-0 border-l border-border/60 sm:w-10" />
      </div>
    </div>
  );
}

export default function EventDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      {/* BackLink: an inline text-xs link in the page's 24 px line. */}
      <Line className="h-6" bar="h-4 w-24" />

      {/* Header */}
      <div className="mt-4 flex flex-col gap-6 border-b border-border pb-6">
        {/* The poster, big and centred above the title. */}
        <div className="mx-auto w-full max-w-3xl">
          <Skeleton className="aspect-[16/9] w-full rounded-lg" />
        </div>

        <div className="min-w-0">
          {/* «Próximo evento» (text-xs). */}
          <Skeleton className="h-4 w-32" />
          {/* The name (font-display, leading-[0.95]): two lines of 28.5 px on
              a phone, one of 34.2 from sm (text-4xl). */}
          <div className="mt-1">
            <Line className="h-[28.5px] sm:h-[34.2px]" bar="h-6 w-72 max-w-full sm:h-7 sm:w-96" />
            <Line className="h-[28.5px] sm:hidden" bar="h-6 w-44" />
          </div>
          {/* The tagline (text-sm): two lines on a phone, one from sm. */}
          <div className="mt-2">
            <Line className="h-5" bar="h-3.5 w-80 max-w-full" />
            <Line className="h-5 sm:hidden" bar="h-3.5 w-52" />
          </div>
          {/* Date, time, venue, bouts and broadcast (whose «estimada» badge
              makes its line 19 px): four lines on a phone (79 px), two at sm
              (39) and one from lg (19). */}
          <div className="mt-3 flex flex-col gap-1">
            <Line className="h-4 lg:h-[19px]" bar="h-3 w-56 max-w-full lg:w-[36rem]" />
            <Line className="h-4 sm:hidden" bar="h-3 w-64 max-w-full" />
            <Line className="h-4 sm:hidden" bar="h-3 w-20" />
            <Line className="h-[19px] lg:hidden" bar="h-3 w-72 max-w-full" />
          </div>
          {/* The schedule by segment (EventScheduleLine, text-xs). */}
          <Line className="mt-3 h-4" bar="h-3 w-64 max-w-full" />
          {/* The buttons: follow the event, tickets, where to watch it. */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Skeleton className="h-[34px] w-28" />
            <Skeleton className="h-[34px] w-40" />
          </div>
        </div>
      </div>

      {/* Bout sections */}
      <div className="mt-8 space-y-8">
        {Array.from({ length: 2 }).map((_, s) => (
          <section key={s}>
            {/* The section's h2 (font-display text-sm): a 20 px line. */}
            <Line className="mb-3 h-5" bar="h-4 w-40" />
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {Array.from({ length: 5 }).map((_, i) => (
                <BoutRowSkeleton key={i} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
