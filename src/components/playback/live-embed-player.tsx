"use client";

import { useSyncExternalStore } from "react";

import {
  POSTER_FOCUS_CLASS,
  TurnSlot,
  usePlaybackTurn,
} from "@/components/playback/playback-turn-provider";
import { PosterLink, useKeyboardStartFocus } from "@/components/playback/poster-link";
import { cn } from "@/lib/utils";

// The 16:9 player of UFC TV (components/home/ufc-tv.tsx) and of the event's
// live broadcast (components/event-live-embed.tsx: home, /en-vivo and the
// event page). ONE component for both on purpose: the home slot must not
// change size when it goes from UFC TV's loop to the event's broadcast, and
// with a single frame it cannot.
//
// It is only the client half: the server wrappers keep the data, the labels
// and the column, and hand over a finished youtube-nocookie URL built by the
// tested builders of lib/ufc-tv.ts (liveEmbedUrl / loopEmbedUrl). This file
// never writes a YouTube URL of its own.
//
// The <iframe> is TurnSlot's (playback-turn-provider.tsx), so it obeys the
// same turn manager as the hero short (ported from the owner's
// mockup, maqueta-shorts/index.html #tv-media and escena.js):
//   · It mounts on its own only when MORE than half of it is visible below
//     the sticky header for 400 ms and nobody else holds the turn; it is
//     removed (back to the poster) when it drops to half or less. Before
//     this, UFC TV played muted 700-850 px below the fold (measured on
//     29-sep-2026), which YouTube's policies forbid.
//   · prefers-reduced-motion: nothing starts on its own; the poster's ▶ does.
//     (The event's broadcast did not honour it until now.)
//   · A tap on the poster makes it the visitor's: it stays while any part of
//     it is on screen. Hidden tab → removed; back, the poster says «Seguir».
//   · The poster is a real link to the video on YouTube (poster-link.tsx):
//     without the page's JavaScript it opens it there; with it, the click is
//     intercepted and the player mounts here. Started with the keyboard, the
//     focus goes into the player (it used to fall on <body>).
//   · The same URL for every mount, automatic or the visitor's: autoplay=1,
//     mute=1 (without it nothing starts, measured), playsinline=1.
//
// No postMessage, no iframe_api, no enablejsapi (DECISIONS.md, 29-sep-2026).

export type LiveEmbedId = "evento" | "tv-directo" | "tv-bucle";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

export function LiveEmbedPlayer({
  id,
  src,
  title,
  label,
  watchUrl,
}: {
  // The turn manager's id: it also sets the tie-break (PRIORITY in
  // lib/playback-turn.ts). One per page.
  id: LiveEmbedId;
  // youtube-nocookie URL from lib/ufc-tv.ts, with autoplay=1&mute=1&playsinline=1.
  src: string;
  // The iframe's accessible name.
  title: string;
  // What the poster says the player is («UFC TV · Peleas completas»…).
  label: string;
  // youtube.com (youtubeWatchUrl): the poster's link. It is what a visitor
  // without the page's JavaScript gets, and what a tap opens when the box is
  // under 200x200 (no legal inline player there; with the 202 px minimum
  // height, a screen under ~232 px wide).
  watchUrl: string;
}) {
  const { view, userStart } = usePlaybackTurn(id);
  const focusPlayer = useKeyboardStartFocus(view);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

  const hint = view.waiting ? "Seguir" : reducedMotion ? "Toca para reproducir" : "Toca para ver";

  const poster = (
    <PosterLink
      href={watchUrl}
      label={`${hint}. ${label}`}
      onStart={userStart}
      onKeyboardStart={focusPlayer}
      className={cn(
        "group absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden bg-brand-ink text-brand-ink-foreground",
        POSTER_FOCUS_CLASS,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 [background:radial-gradient(65%_75%_at_50%_100%,color-mix(in_oklch,var(--brand-ink-primary)_22%,transparent),transparent_70%)]"
      />
      <span className="octagon relative grid size-14 place-items-center bg-brand-ink-primary text-brand-ink shadow-[0_0_30px_6px_color-mix(in_oklch,var(--brand-ink-primary)_40%,transparent)] transition-transform duration-200 group-hover:scale-105">
        <PlayIcon className="ml-1 size-6" />
      </span>
      <span className="relative px-3 text-center font-display text-sm font-bold uppercase tracking-[0.14em]">
        {label}
      </span>
      <span className="relative font-mono text-[0.625rem] uppercase tracking-[0.14em] text-brand-ink-foreground/70">
        {hint}
      </span>
    </PosterLink>
  );

  // The box is what the turn manager measures, so it carries the final size:
  // the column's width, 16:9, and at least 200 px high INSIDE the 1 px border
  // (min-h-[202px]: border-box, so 200 would leave a 198 px viewer; on a
  // 360 px phone 16:9 alone gave 183). The iframe fills the inside
  // (TurnSlot: absolute inset-0, no border of its own).
  //
  // Square corners and nothing over the player, as in the mockup.
  return (
    <TurnSlot
      id={id}
      src={src}
      title={title}
      poster={poster}
      className="aspect-video min-h-[202px] w-full overflow-hidden border border-border bg-muted"
    />
  );
}
