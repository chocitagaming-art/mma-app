import { Skeleton } from "@/components/ui/skeleton";

// Loading UI for /clasificacion. Mirrors the heading plus division groups, each
// group being a labelled row and a grid of ranking cards. The card skeleton
// reuses the real card's structural classes (.ranking-card, .ranking-champion,
// .ranking-champion-grid in globals.css) and its fixed sizes, so every block
// is as tall as the real one when the page swaps in (measured on 21-oct from
// 360 to 1920 px, Chromium and WebKit, with a client navigation held on its
// RSC response: header 53, champion 225.6 narrow / 167 wide, each row 75 + its
// 1 px border; cards land within 0.1 px).
// 🪤 Two things it cannot know: a narrow-card champion whose name takes two
// lines at 28 px (none today; it needs some 25 characters at 360) makes that
// block 26.6 px taller, and a vacant title among the first three men's
// divisions makes that card 225.6 / 167 px shorter. Both sit below the fold
// at every width (the pound-for-pound pair comes first), so they shift
// nothing on screen.
function RankingCardSkeleton({ withChampion = false }: { withChampion?: boolean }) {
  return (
    <div className="ranking-card flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative border-b border-border px-5 py-3">
        <span className="absolute inset-y-0 left-0 w-1 bg-corner-red" />
        <Skeleton className="h-7 w-40" />
      </div>
      {withChampion ? (
        <div className="ranking-champion border-b border-amber-500/40 px-4 pb-4 pt-9 dark:border-amber-400/30">
          <div className="ranking-champion-grid">
            <div className="ranking-champion-frame h-[100px] w-[196px] rounded-lg border-2 border-amber-500/60 dark:border-amber-400/50" />
            <div className="ranking-champion-label space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            {/* One line of the 28 px / 0.95 name; the record bar below it is
                the 24 px record line (beside the photo in a wide card). */}
            <div className="ranking-champion-name h-[1.6625rem]">
              <Skeleton className="h-full w-48 max-w-full" />
            </div>
            <div className="ranking-champion-record">
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        </div>
      ) : null}
      <div className="divide-y divide-border">
        {Array.from({ length: 15 }).map((_, i) => (
          // No height of its own: like the real row, it is the 75 px photo
          // slot plus the divide-y border (an h-[75px] here would put the
          // border INSIDE the 75 and make the list 14 px shorter).
          <div key={i} className="flex items-center gap-2 pl-2 pr-3 sm:gap-3 sm:pr-4">
            <div className="flex w-7 shrink-0 justify-end">
              <Skeleton className="h-5 w-4" />
            </div>
            {/* A bust where the cut-out face will stand. */}
            <div className="flex h-[75px] w-[120px] shrink-0 items-end justify-center self-end">
              <Skeleton className="h-[60px] w-[84px] rounded-b-none rounded-t-full" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex w-9 shrink-0 justify-center">
              <Skeleton className="h-3 w-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The jump bar's labels, as wide as today's real ones (Saira Condensed 14 px
// semibold, uppercase; measured 21-oct): P4P and P4P (F), the eight men's
// divisions, the three women's. `true` opens a group (the bar's divider).
const JUMP_LABELS: [width: number, groupStart: boolean][] = [
  [21, false], [38, false],
  [37, true], [33, false], [37, false], [37, false], [42, false], [35, false], [68, false], [42, false],
  [43, true], [54, false], [50, false],
];

export default function ClasificacionLoading() {
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8 lg:pt-16">
        {/* SectionHeading's boxes: eyebrow 16, title 30 / 36 (sm), description
            two 24 px lines below sm (it wraps at 390) and one from sm. */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-[1.875rem] w-96 max-w-full sm:h-9" />
          <div className="flex h-12 max-w-2xl flex-col justify-center gap-2 sm:h-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3 sm:hidden" />
          </div>
        </div>
      </div>

      {/* The jump bar (ranking-jump-bar.tsx): the same classes, so the same
          44 px and the same 32 px above it; the cards below do not move when
          the page swaps in. */}
      <div
        aria-hidden="true"
        className="ranking-jumpbar mt-8 border-b border-border bg-background/85 backdrop-blur-md"
      >
        <div className="mx-auto h-full max-w-7xl">
          <ul className="ranking-jumpbar-list">
            {JUMP_LABELS.map(([width, groupStart], i) => (
              <li key={i} data-group-start={groupStart ? "" : undefined}>
                <div className="ranking-jumpbar-link">
                  <Skeleton className="h-3.5" style={{ width }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-12 px-4 pb-12 pt-10 sm:px-6 lg:px-8 lg:pb-16">
        {/* Pound for pound: two lists, no champion. Group titles: text-2xl
            (32 px) / sm:text-3xl (36 px) in the page. */}
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-56 sm:h-9" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid items-start gap-5 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <RankingCardSkeleton key={i} />
            ))}
          </div>
        </section>

        {/* Divisions: champion + list */}
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-72 sm:h-9" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <RankingCardSkeleton key={i} withChampion />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
