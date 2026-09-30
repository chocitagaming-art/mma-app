import { ShortsAttribution } from "@/components/home/shorts-attribution";
import { ShortsHero, type HeroShort } from "@/components/home/shorts-hero";
import type { UfcShortsList } from "@/lib/ufc-shorts";

// The server half of the home hero. app/page.tsx starts getUfcShorts() BEFORE
// its database queries and hands the promise to these two, each inside its own
// <Suspense>: on a warm cache the list is there by the time the page renders
// them, and on a cold one (up to 5 s of YouTube) the rest of the home does not
// wait for it, as with the live slot (home-live-slot.tsx).
//
// Only what the client needs crosses to it: id, title, duration, thumbnail.

function toHeroShorts(list: UfcShortsList): HeroShort[] {
  return list.shorts.map(({ id, title, seconds, thumbnail }) => ({ id, title, seconds, thumbnail }));
}

export async function ShortsHeroSlot({ shorts }: { shorts: Promise<UfcShortsList> }) {
  return <ShortsHero shorts={toHeroShorts(await shorts)} />;
}

/** The mobile attribution, in the text column: only when there are shorts. */
export async function ShortsAttributionSlot({
  shorts,
  className,
}: {
  shorts: Promise<UfcShortsList>;
  className?: string;
}) {
  const list = await shorts;
  return list.shorts.length > 0 ? <ShortsAttribution className={className} /> : null;
}
