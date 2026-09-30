"use client";

import {
  useCallback,
  useEffect,
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
  posterIndex,
  posterLabel,
  shortTimerMs,
  shortWatchUrl,
} from "@/components/home/shorts-carousel";
import {
  POSTER_FOCUS_CLASS,
  TurnSlot,
  usePlaybackTurn,
} from "@/components/playback/playback-turn-provider";
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
//   · It autoplays muted (mute=1 accepted) on every device, but only when the
//     turn manager says so: more than half of it in view for 400 ms, one
//     player at a time, nothing with the tab hidden (lib/playback-turn.ts).
//   · Nothing over the iframe: square corners, no mask-feather, no fade and no
//     animate-rise on an ancestor while it plays (the frame drops the class
//     before it may mount). The brand halo BEHIND the frame stays.
//   · Pausar / Seguir and «Siguiente ›» (WCAG 2.2.2) and the attribution go
//     OUTSIDE the frame: below it on mobile, under it (absolute) from md.
//   · The next short is a NEW iframe mounted on a timer: its duration + 2.5 s
//     from the iframe's load. No postMessage, no iframe_api, no enablejsapi
//     (DECISIONS.md, 29-sep-2026): there is no "ended" event to listen to.
//   · A short the visitor touched (a tap INSIDE the iframe: sound, pause, full
//     screen) is theirs: the timer never changes it, «Siguiente ›» goes on.
//     Theirs too, with a tap on the poster: out of view (PiP), with the tab
//     hidden or under the menu it stays (DECISIONS.md, 30-sep-2026) until it
//     ends; if they never touched it inside, the timer then goes on as ever.
//   · prefers-reduced-motion: only the poster with ▶; nothing starts alone.
//   · The poster is the short's own i.ytimg.com thumbnail, WHOLE (object-
//     contain, not cropped: the thumbnail may not be altered) with the ▶
//     below it, not on it. With no list at all: our own poster, no player.

export type HeroShort = { id: string; title: string; seconds: number; thumbnail: string };

const HERO_ID = "hero";
// The intro animation (animate-rise, 0.7 s) must be over before the player
// may mount; this is the net if its animationend never arrives.
const INTRO_FALLBACK_MS = 1_500;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The frame's column: the halo behind, the 9:16 box (what the e2e measures:
 * data-testid="hero-short") and what goes under it.
 */
function HeroFrame({
  rising,
  onIntroEnd,
  boxRef,
  children,
  below,
}: {
  rising: boolean;
  onIntroEnd?: () => void;
  boxRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div
      className={cn("relative mx-auto w-full md:max-w-[280px] lg:max-w-[330px]", rising && "animate-rise")}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onIntroEnd?.();
      }}
    >
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

/** Our own poster: no clip and no image of anyone else's. */
function OwnPoster() {
  return (
    <div
      aria-hidden
      className="relative flex aspect-[9/16] w-full items-center justify-center overflow-hidden bg-brand-ink"
    >
      <span className="absolute inset-0 [background:radial-gradient(90%_55%_at_50%_0%,color-mix(in_oklch,var(--brand-ink-primary)_30%,transparent),transparent_72%)]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/hero-watermark.webp"
        alt=""
        className="pointer-events-none absolute left-1/2 top-[14%] w-[115%] max-w-none -translate-x-1/2 opacity-[0.16]"
      />
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

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
    </svg>
  );
}

const CONTROL_CLASS =
  "inline-flex h-8 items-center rounded-lg border border-border bg-card px-2.5 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

function ShortsCarouselHero({ shorts }: { shorts: HeroShort[] }) {
  const [carousel] = useState(() => createShortsCarousel(shorts.length));
  const snapshot = useSyncExternalStore(carousel.subscribe, carousel.getSnapshot, carousel.getSnapshot);
  const { view, userStart, pause, timerFired } = usePlaybackTurn(HERO_ID);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

  // The player waits for the headline's font (the column widths depend on
  // it) and for the intro animation: nothing may animate over the iframe.
  const [ready, setReady] = useState(false);
  const introDone = useRef<(() => void) | null>(null);
  useEffect(() => {
    let alive = true;
    const intro = new Promise<void>((resolve) => {
      introDone.current = resolve;
      window.setTimeout(resolve, INTRO_FALLBACK_MS);
    });
    void Promise.all([document.fonts.ready, intro]).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

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

  // The carousel timer: armed on the iframe's load, dropped whenever that
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
      // "stay" (touched: theirs), "next" (a new automatic start) or
      // "release" (back to the poster). The turn manager applies it.
      timerFired();
    }, shortTimerMs(short.seconds));
  }, [carousel, clearTimer, shorts, timerFired]);

  // Every mount, automatic or the visitor's, picks its short here.
  const onMount = useCallback(() => {
    carousel.take();
  }, [carousel]);

  // The visitor's ▶, «Seguir» and «Siguiente ›».
  const start = useCallback(
    (index: number) => {
      carousel.queue(index);
      const result = userStart();
      if (result === "started") return;
      carousel.clearQueue();
      if (result === "too-small") {
        window.open(shortWatchUrl(shorts[index].id), "_blank", "noopener,noreferrer");
      }
    },
    [carousel, shorts, userStart],
  );

  const onPoster = () => start(view.paused ? carousel.resumeIndex() : carousel.nextIndex());
  const onPauseToggle = () => (view.paused ? start(carousel.resumeIndex()) : pause());
  const onNext = () => start(carousel.nextIndex());

  const playing = shorts[snapshot.current ?? 0];
  const shown = shorts[posterIndex(snapshot, view.paused)];
  const label = posterLabel({
    tooSmall,
    paused: view.paused,
    reducedMotion,
  });

  const poster = (
    <button
      type="button"
      onClick={onPoster}
      aria-label={`${label}. Short de la UFC: ${shown.title}`}
      className={cn(
        "group absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden bg-brand-ink text-brand-ink-foreground md:gap-4",
        POSTER_FOCUS_CLASS,
      )}
    >
      {/* The official thumbnail, whole and untouched (4:3 with the short in
          the middle); the ▶ goes under it, never on it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shown.thumbnail}
        alt=""
        width={480}
        height={360}
        decoding="async"
        className="block aspect-[4/3] w-full shrink-0 bg-black object-contain"
      />
      <span className="octagon relative grid size-12 shrink-0 place-items-center bg-brand-ink-primary text-brand-ink shadow-[0_0_30px_6px_color-mix(in_oklch,var(--brand-ink-primary)_45%,transparent)] transition-transform duration-200 group-hover:scale-105 md:size-16">
        <PlayIcon className="ml-0.5 size-5 md:ml-1 md:size-7" />
      </span>
      <span className="px-2 text-center font-mono text-[0.625rem] uppercase tracking-[0.14em] text-brand-ink-foreground/70">
        {label}
      </span>
    </button>
  );

  return (
    <HeroFrame
      rising={!ready}
      onIntroEnd={() => introDone.current?.()}
      boxRef={setBox}
      below={
        <div
          className={cn(
            "mt-2 max-[339px]:hidden md:absolute md:inset-x-0 md:top-full md:mt-3",
            tooSmall && "hidden",
          )}
        >
          <div className="flex items-center gap-2 md:justify-center">
            <button type="button" onClick={onPauseToggle} className={cn(CONTROL_CLASS, "gap-1.5")}>
              {view.paused ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}
              <span>{view.paused ? "Seguir" : "Pausar"}</span>
            </button>
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
              (app/page.tsx): under the 200 px frame only the buttons fit
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
        ready={ready}
        onMount={onMount}
        onIframeLoad={onIframeLoad}
        className="aspect-[9/16] w-full overflow-hidden bg-black"
      />
    </HeroFrame>
  );
}
