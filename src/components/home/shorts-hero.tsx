"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";

import { ShortsAttribution } from "@/components/home/shorts-attribution";
import {
  createShortsCarousel,
  posterLabel,
  shortTimerMs,
  shortWatchUrl,
} from "@/components/home/shorts-carousel";
import {
  POSTER_FOCUS_CLASS,
  TurnSlot,
  usePlaybackTurn,
} from "@/components/playback/playback-turn-provider";
import { PosterLink, useKeyboardStartFocus } from "@/components/playback/poster-link";
import type { StartResult } from "@/components/playback/turn-controller";
import { fitsMinimum, shortEmbedUrl } from "@/lib/playback-turn";
import { cn } from "@/lib/utils";

// The home hero: the UFC channel's shorts, one youtube-nocookie <iframe> at a
// time (t5-9-2; it replaced the six local mp4 of the old video-hero.tsx).
//
// Ported from the owner's mockup (maqueta-shorts, index.html #hero-marco and
// escena.js), with the owner's decisions of the mockup review:
//   · Sizes: 330 px on desktop, 280 on tablet, 200 on mobile next to the
//     headline (variant A; the grid lives in app/page.tsx). Under 340 px of
//     screen the column is 120 px: no legal inline player there (200x200), so
//     the poster opens the short on YouTube instead.
//   · It never starts on its own (the owner's decision, 30-sep-2026, night):
//     the hero shows the poster of the most recent short, and a short plays
//     only when the visitor taps its ▶ or «Siguiente ›». When one ends, no
//     other one starts: the poster shows the next short, for a tap (its ▶,
//     or «Siguiente ›», which plays that same one). The player is still in
//     the turn manager (lib/playback-turn.ts), so there is ONE player at a
//     time: UFC TV makes way when the visitor puts a short on.
//   · Muted (mute=1), as UFC TV. Measured on 30-sep-2026 with the real
//     YouTube: under a strict autoplay policy (Chromium's
//     user-gesture-required) the tap on this page does not carry into the new
//     iframe, and without mute the short the visitor tapped stayed black and
//     stopped until a second tap inside. With it, it plays at once; the sound
//     is YouTube's speaker, inside the player.
//   · Nothing over the iframe: square corners, no mask-feather, no fade and no
//     animate-rise on an ancestor while it plays (the frame drops the class at
//     its first mount, for good). The brand halo BEHIND the frame stays.
//   · «Siguiente ›» and the attribution go OUTSIDE the frame: below it on
//     mobile, under it (absolute) from md. No «Pausar»: nothing moves on its
//     own (WCAG 2.2.2 is about what starts by itself), and YouTube's own
//     player pauses.
//   · The end of a short is a timer: its duration + 2.5 s from the iframe's
//     load. No postMessage, no iframe_api, no enablejsapi (DECISIONS.md,
//     29-sep-2026): there is no "ended" event to listen to. A short the
//     visitor touched (a tap INSIDE the iframe: sound, pause, full screen) is
//     theirs: the timer leaves it as they left it, «Siguiente ›» goes on. One
//     they did not touch goes back to its poster, and the turn is free. Until
//     then it stays out of view (PiP), with the tab hidden or under the menu
//     (DECISIONS.md, 30-sep-2026).
//   · A tap never waits for the page. The player used to wait for the
//     headline's font and the entrance animation (up to 1.5 s, or the font's
//     download), and the ▶ did nothing meanwhile. Now it mounts at once and
//     the frame drops its entrance class.
//   · The poster is the short's own i.ytimg.com thumbnail, WHOLE (object-
//     contain, not cropped: the thumbnail may not be altered) with the ▶
//     below it, not on it. With no list at all: our own poster, no player.
//   · Under 340 px of screen (the 120 px column) it is OUR poster, not the
//     thumbnail: the RMF wants any thumbnail that starts a playback at least
//     120x70, and there it measured 99x74 (under 70 high while the headline's
//     font loaded). Still the link to the short, with «Ver en YouTube». CSS
//     does it before React runs (max-[339px]); React, once it has measured
//     the box (tooSmall). From 340 px the thumbnail is 200 px wide or more.
//   · The poster is a real link to that short on YouTube (poster-link.tsx):
//     without the page's JavaScript, and under 200x200, it opens it there.
//     Started with the keyboard, the focus goes into the short it mounts.
//     «Siguiente ›» is a button only React understands: until the page
//     hydrates it is not shown (it would do nothing).

export type HeroShort = { id: string; title: string; seconds: number; thumbnail: string };

const HERO_ID = "hero";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function subscribeToNothing() {
  return () => {};
}

/**
 * The frame's column: the halo behind, the 9:16 box (what the e2e measures:
 * data-testid="hero-short") and what goes under it.
 */
function HeroFrame({
  rising,
  boxRef,
  children,
  below,
}: {
  rising: boolean;
  boxRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className={cn("relative mx-auto w-full md:max-w-[280px] lg:max-w-[330px]", rising && "animate-rise")}>
      {/* Soft brand glow BEHIND the frame (-z-10): never over the player. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/35 blur-[80px] dark:bg-primary/25"
      />
      <div ref={boxRef} data-testid="hero-short">
        {children}
      </div>
      {below}
    </div>
  );
}

/** Our poster's background: the brand glow and watermark, no image of anyone else's. */
function OwnPosterArt({ className }: { className?: string }) {
  return (
    <span aria-hidden data-own-poster className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <span className="absolute inset-0 [background:radial-gradient(90%_55%_at_50%_0%,color-mix(in_oklch,var(--brand-ink-primary)_30%,transparent),transparent_72%)]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/hero-watermark.webp"
        alt=""
        className="absolute left-1/2 top-[14%] w-[115%] max-w-none -translate-x-1/2 opacity-[0.16]"
      />
    </span>
  );
}

/** Our own poster: no clip and no image of anyone else's. */
function OwnPoster() {
  return (
    <div
      aria-hidden
      className="relative flex aspect-[9/16] w-full items-center justify-center overflow-hidden bg-brand-ink"
    >
      <OwnPosterArt />
      <span className="octagon relative size-12 bg-brand-ink-primary/80 shadow-[0_0_30px_6px_color-mix(in_oklch,var(--brand-ink-primary)_45%,transparent)] md:size-16" />
    </div>
  );
}

/**
 * While the list is on its way (Suspense) and when there is none: our poster,
 * no player. On mobile it keeps the room of the buttons row, so the search
 * box below does not jump when the real hero streams in.
 */
export function ShortsHeroPlaceholder() {
  return (
    <HeroFrame
      rising
      below={<div aria-hidden className="invisible mt-2 h-8 max-[339px]:hidden md:hidden" />}
    >
      <OwnPoster />
    </HeroFrame>
  );
}

export function ShortsHero({ shorts }: { shorts: HeroShort[] }) {
  if (shorts.length === 0) return <ShortsHeroPlaceholder />;
  // A different list is a different carousel (its length is fixed).
  return <ShortsCarouselHero key={shorts.map((s) => s.id).join(",")} shorts={shorts} />;
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

const CONTROL_CLASS =
  "inline-flex h-8 items-center rounded-lg border border-border bg-card px-2.5 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

function ShortsCarouselHero({ shorts }: { shorts: HeroShort[] }) {
  const [carousel] = useState(() => createShortsCarousel(shorts.length));
  const snapshot = useSyncExternalStore(carousel.subscribe, carousel.getSnapshot, carousel.getSnapshot);
  const { view, userStart, timerFired } = usePlaybackTurn(HERO_ID);
  const focusShort = useKeyboardStartFocus(view);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
  // False on the server and while hydrating, true once React runs (the same
  // pattern as PosterLink): «Siguiente ›» only works from then on.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  // Under 200x200 (a screen under 340 px): no inline player, no buttons.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const subscribeToBox = useCallback(
    (onChange: () => void) => {
      if (!box) return () => {};
      const observer = new ResizeObserver(onChange);
      observer.observe(box);
      return () => observer.disconnect();
    },
    [box],
  );
  const tooSmall = useSyncExternalStore(
    subscribeToBox,
    () => (box ? !fitsMinimum(box.getBoundingClientRect()) : false),
    () => false,
  );

  // The short's timer: armed on the iframe's load, dropped whenever that
  // iframe goes (unmounted, or replaced by the next mount).
  const timer = useRef<number | null>(null);
  const clearTimer = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  useLayoutEffect(() => clearTimer, [view.mounted, view.mountCount, clearTimer]);

  const onIframeLoad = useCallback(() => {
    clearTimer();
    const short = shorts[carousel.getSnapshot().current ?? 0];
    timer.current = window.setTimeout(() => {
      timer.current = null;
      // "stay" (touched: theirs) or "release" (back to the poster, which
      // shows the next short). The turn manager applies it.
      timerFired();
    }, shortTimerMs(short.seconds));
  }, [carousel, clearTimer, shorts, timerFired]);

  // Every mount is the visitor's start: it picks the short they asked for.
  const onMount = useCallback(() => {
    carousel.take();
  }, [carousel]);

  // The visitor's ▶ and «Siguiente ›»: the turn manager's answer.
  const start = useCallback(
    (index: number): StartResult => {
      carousel.queue(index);
      const result = userStart();
      if (result !== "started") carousel.clearQueue();
      return result;
    },
    [carousel, userStart],
  );

  // «Siguiente ›» is a button, not a link: under 200x200 (where it is hidden
  // anyway) it opens the short on YouTube itself. The poster needs none of
  // this: it is a link to that short.
  const startFromControl = useCallback(
    (index: number) => {
      if (start(index) === "too-small") {
        window.open(shortWatchUrl(shorts[index].id), "_blank", "noopener,noreferrer");
      }
    },
    [shorts, start],
  );

  // The short the poster shows (the cursor) is the one its ▶ starts;
  // «Siguiente ›», the one after the last one played: once a short has
  // ended, the one its poster shows (none is skipped).
  const onPoster = () => start(snapshot.cursor);
  const onNext = () => startFromControl(carousel.nextIndex());

  const playing = shorts[snapshot.current ?? 0];
  const shown = shorts[snapshot.cursor];
  const label = posterLabel({ tooSmall, reducedMotion });

  const poster = (
    <PosterLink
      href={shortWatchUrl(shown.id)}
      label={`${label}. Short de la UFC: ${shown.title}`}
      playsHere={!tooSmall}
      onStart={onPoster}
      onKeyboardStart={focusShort}
      className={cn(
        "group absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden bg-brand-ink text-brand-ink-foreground md:gap-4",
        POSTER_FOCUS_CLASS,
      )}
    >
      {/* Under 200x200 (a screen under 340 px): our poster, never the
          thumbnail, which would be under YouTube's 120x70 there. CSS hides the
          thumbnail before React runs; tooSmall drops it once it has measured. */}
      <OwnPosterArt className={cn("hidden max-[339px]:block", tooSmall && "block")} />
      {tooSmall ? null : (
        <>
          {/* The official thumbnail, whole and untouched (4:3 with the short
              in the middle); the ▶ goes under it, never on it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shown.thumbnail}
            alt=""
            width={480}
            height={360}
            decoding="async"
            className="block aspect-[4/3] w-full shrink-0 bg-black object-contain max-[339px]:hidden"
          />
        </>
      )}
      <span className="octagon relative grid size-12 shrink-0 place-items-center bg-brand-ink-primary text-brand-ink shadow-[0_0_30px_6px_color-mix(in_oklch,var(--brand-ink-primary)_45%,transparent)] transition-transform duration-200 group-hover:scale-105 md:size-16">
        <PlayIcon className="ml-0.5 size-5 md:ml-1 md:size-7" />
      </span>
      <span className="relative px-2 text-center font-mono text-[0.625rem] uppercase tracking-[0.14em] text-brand-ink-foreground/70">
        {/* Before React has measured, CSS says where a tap goes under 340 px. */}
        <span className={cn(!tooSmall && "max-[339px]:hidden")}>{label}</span>
        {tooSmall ? null : <span className="hidden max-[339px]:inline">Ver en YouTube</span>}
      </span>
    </PosterLink>
  );

  return (
    <HeroFrame
      // The entrance animation, until a short is mounted: nothing may animate
      // over the player. mountCount only grows, so the class never comes
      // back (and the animation never replays) when a short ends.
      rising={view.mountCount === 0}
      boxRef={setBox}
      below={
        <div
          className={cn(
            "mt-2 max-[339px]:hidden md:absolute md:inset-x-0 md:top-full md:mt-3",
            tooSmall && "hidden",
          )}
        >
          {/* Invisible, not absent, until React runs: it keeps its room (the
              search box below does not jump) and it is out of the tab order
              and of screen readers while it would do nothing. */}
          <div className={cn("flex items-center gap-2 md:justify-center", !hydrated && "invisible")}>
            <button
              type="button"
              onClick={onNext}
              aria-label="Siguiente short"
              className={cn(CONTROL_CLASS, "gap-1")}
            >
              Siguiente <span aria-hidden className="text-sm leading-none">›</span>
            </button>
          </div>
          {/* On mobile the attribution goes at the foot of the text column
              (app/page.tsx): under the 200 px frame only the button fits
              without the hero growing past 844 px. */}
          <ShortsAttribution className="mt-1.5 max-md:hidden md:text-center" />
        </div>
      }
    >
      <TurnSlot
        id={HERO_ID}
        src={shortEmbedUrl(playing.id, { mute: true })}
        title={`Short de la UFC: ${playing.title}`}
        poster={poster}
        onMount={onMount}
        onIframeLoad={onIframeLoad}
        className="aspect-[9/16] w-full overflow-hidden bg-black"
      />
    </HeroFrame>
  );
}
