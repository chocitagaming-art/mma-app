"use client";

import { useEffect, useId, type ReactNode } from "react";

import {
  POSTER_FOCUS_CLASS,
  TurnSlot,
  usePlaybackTurn,
} from "@/components/playback/playback-turn-provider";
import { PosterLink, useKeyboardStartFocus } from "@/components/playback/poster-link";
import { clipEmbedUrl, clipWatchUrl } from "@/lib/playback-turn";
import { cn } from "@/lib/utils";

// A click-to-play YouTube player INSIDE the turn manager: our own poster, and
// nothing from Google (no thumbnail, no player, no cookie-less storage) until
// the visitor taps it. Then the player mounts here, as the visitor's, and the
// turn manager takes away whatever else was playing: one player at a time.
//
// The pieces are the turn's own (the hero short is the same idea): TurnSlot
// renders the poster or the iframe, PosterLink is a real link to YouTube that
// becomes a ▶ button once React runs, useKeyboardStartFocus sends the focus
// into the player after Enter or Space.
//
// Used by the Hall of Fame's fight wing and by the videos modal
// (video-modal.tsx: the home's «Noticias y vídeos», /videos, /tendencias),
// which mounts it with `startOnMount`: the tap that opened the modal is the
// start, and the poster only stays if the turn manager refused it (then it is
// a link to the video on YouTube). Built to serve the face-off and weigh-in
// facades too (pass `poster` to show a thumbnail instead).
//
// 🪤 Two traps, both measured:
//   · A useTurnBlocker around it refuses every start, the visitor's too
//     ("blocked", turn-controller.ts userStart), and the ▶ would do nothing.
//     A modal that must block (VideoModal) passes its blocker's name as
//     `ownBlocker`: only that one is let through.
//   · The box needs min-h-[202px]: inside a 360 px phone's modal 16:9 alone
//     gives ~157 px, under the 200x200 minimum, and the turn manager answers
//     "too-small" (the link then opens YouTube instead of playing here).

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

export type ClickToPlayTone = "brand" | "gold";

export function ClickToPlay({
  videoId,
  start,
  end,
  title,
  label,
  hint = "Toca para ver",
  note,
  poster,
  tone = "brand",
  startOnMount = false,
  ownBlocker,
  className,
}: {
  // An 11-character YouTube id (check it with isYouTubeVideoId first).
  videoId: string;
  // Whole seconds; the clip of a marathon upload.
  start?: number | null;
  end?: number | null;
  // The iframe's accessible name.
  title: string;
  // What the poster says it plays («Ver combate · UFC 52»).
  label: string;
  hint?: string;
  // A small line under the hint (the channel, «Pelea completa»…).
  note?: string;
  // Replaces the drawn poster's inside (a thumbnail). It goes INSIDE the link:
  // no links of its own.
  poster?: ReactNode;
  tone?: ClickToPlayTone;
  // Start as the visitor's as soon as it mounts: for a player mounted BY a
  // tap (the videos modal), never for one that is just on the page.
  startOnMount?: boolean;
  // The blocker the surrounding modal puts up, which must not stop this one.
  ownBlocker?: string;
  className?: string;
}) {
  // Unique per mount: two of these on a page are two players for the turn.
  const id = `clip-${useId()}`;
  const { view, userStart } = usePlaybackTurn(id);
  const focusPlayer = useKeyboardStartFocus(view);
  const range = { start, end };

  // After TurnSlot's own effect (a child's effects run first): it is
  // registered by now. A refused start leaves the poster, a link to YouTube.
  useEffect(() => {
    if (startOnMount) userStart();
  }, [startOnMount, userStart]);

  const gold = tone === "gold";
  const drawn = (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute inset-0",
          gold
            ? "[background:radial-gradient(60%_80%_at_50%_100%,rgb(212_160_23/0.32),transparent_70%),radial-gradient(40%_60%_at_15%_0%,color-mix(in_oklch,var(--corner-red)_22%,transparent),transparent_70%),radial-gradient(40%_60%_at_85%_0%,color-mix(in_oklch,var(--corner-blue)_22%,transparent),transparent_70%)]"
            : "[background:radial-gradient(65%_75%_at_50%_100%,color-mix(in_oklch,var(--brand-ink-primary)_22%,transparent),transparent_70%)]",
        )}
      />
      <span
        className={cn(
          "octagon relative grid size-14 place-items-center transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none",
          gold
            ? "bg-[#f5c542] text-[#1a1406] shadow-[0_0_30px_6px_rgb(245_190_60/0.4)]"
            : "bg-brand-ink-primary text-brand-ink shadow-[0_0_30px_6px_color-mix(in_oklch,var(--brand-ink-primary)_40%,transparent)]",
        )}
      >
        <PlayIcon className="ml-1 size-6" />
      </span>
      <span className="relative px-4 text-center font-display text-base font-bold uppercase tracking-[0.12em]">
        {label}
      </span>
      <span className="relative font-mono text-[0.625rem] uppercase tracking-[0.14em] text-brand-ink-foreground/70">
        {hint}
        {note ? ` · ${note}` : ""}
      </span>
    </>
  );

  const posterLink = (
    <PosterLink
      href={clipWatchUrl(videoId, range)}
      label={`${hint}. ${label}`}
      onStart={userStart}
      onKeyboardStart={focusPlayer}
      className={cn(
        "group absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden bg-brand-ink text-brand-ink-foreground",
        POSTER_FOCUS_CLASS,
      )}
    >
      {poster ?? drawn}
    </PosterLink>
  );

  return (
    <TurnSlot
      id={id}
      src={clipEmbedUrl(videoId, range)}
      title={title}
      poster={posterLink}
      ownBlocker={ownBlocker}
      className={cn("aspect-video min-h-[202px] w-full overflow-hidden bg-black", className)}
    />
  );
}
