"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  IDLE_VIEW,
  createTurnController,
  type PlayerView,
  type StartResult,
  type TurnController,
  type TurnEnvironment,
} from "@/components/playback/turn-controller";
import type { TurnOwner } from "@/lib/playback-turn";
import { cn } from "@/lib/utils";

// The turn manager in React: ONE provider per document (app/layout.tsx, see
// why there), and a <TurnSlot> per player (the hero short, UFC TV, the
// event's live broadcast).
//
// This file is only wiring: it hands the real browser to the controller
// (turn-controller.ts) and forwards DOM events to it —visibilitychange,
// pagehide/pageshow, window blur, every pointerdown on the page, the
// reduced-motion media query and the header's ResizeObserver—. Who may play
// is decided in lib/playback-turn.ts.
// Both are tested in node (turn-controller.test.ts, playback-turn.test.ts);
// this file is covered by the e2e once it is wired into a page.
//
// No postMessage, no iframe_api, no enablejsapi: to stop a player its <iframe>
// is removed, and each mount is a new <iframe>.
//
// Wired: UFC TV and the event's live broadcast through their shared 16:9
// player (components/playback/live-embed-player.tsx: the home, /en-vivo and
// the event page), the only players that start on their own (autoStart); and
// the home hero's short (components/home/shorts-hero.tsx), which only plays
// when the visitor starts it and is in the turn so that there is still ONE
// player at a time. Nothing else of the site starts a YouTube player on its
// own: the click-to-play facades and the /videos modal mount only on a tap,
// and stay outside the turn for now.

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// Reads `window`/`document` only when called, never while rendering on the
// server: the controller calls it from start(), inside an effect.
function browserEnvironment(headerSelector: string): TurnEnvironment {
  return {
    now: () => performance.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    createIntersectionObserver: (cb, options) => new IntersectionObserver((entries) => cb(entries), options),
    // One evaluation per frame at most, however many boxes change.
    createResizeObserver: (cb) => {
      let queued = false;
      return new ResizeObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          cb();
        });
      });
    },
    isPageVisible: () => document.visibilityState === "visible",
    prefersReducedMotion: () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    headerHeight: () => document.querySelector(headerSelector)?.getBoundingClientRect().height ?? 0,
    activeElement: () => document.activeElement,
  };
}

const TurnContext = createContext<TurnController | null>(null);

export function PlaybackTurnProvider({
  children,
  headerSelector = "header",
}: {
  children: ReactNode;
  // The sticky header, whose band does not count as "visible".
  headerSelector?: string;
}) {
  const [controller] = useState(() => createTurnController(browserEnvironment(headerSelector)));

  useEffect(() => {
    controller.start();

    const onVisibility = () => controller.setPageVisible(document.visibilityState === "visible");
    // pagehide may be the page going into the back/forward cache, to come
    // back as it was: like a hidden tab, only the automatic player goes and
    // the visitor's stays mounted. On a real unload nothing is left to stop.
    const onPageHide = () => controller.setPageVisible(false);
    const onPageShow = () => {
      if (document.visibilityState === "visible") controller.setPageVisible(true);
    };
    const onBlur = () => controller.windowBlurred();
    // Capture phase: it runs before the tap moves the focus out of an iframe.
    const onPointerDown = () => controller.pagePointerDown();
    const motion = window.matchMedia(REDUCED_MOTION_QUERY);
    const onMotion = () => controller.reducedMotionChanged();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointerdown", onPointerDown, true);
    motion.addEventListener("change", onMotion);

    const header = document.querySelector(headerSelector);
    const headerObserver = header ? new ResizeObserver(() => controller.headerResized()) : null;
    if (header) headerObserver?.observe(header);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerdown", onPointerDown, true);
      motion.removeEventListener("change", onMotion);
      headerObserver?.disconnect();
      controller.stop();
    };
  }, [controller, headerSelector]);

  return <TurnContext.Provider value={controller}>{children}</TurnContext.Provider>;
}

function useTurnController(): TurnController {
  const controller = useContext(TurnContext);
  if (!controller) {
    throw new Error("usePlaybackTurn needs a <PlaybackTurnProvider> above it");
  }
  return controller;
}

/** The state of one player and the visitor's actions on it. */
export function usePlaybackTurn(id: string) {
  const controller = useTurnController();
  const view = useSyncExternalStore(
    controller.subscribe,
    () => controller.getView(id),
    () => IDLE_VIEW,
  );
  return {
    view,
    // The poster's ▶ and «Siguiente». Mounts only on "started"; on
    // "too-small" the poster's link opens YouTube instead.
    userStart: useCallback((): StartResult => controller.userStart(id), [controller, id]),
    // The hero short's timer: "stay" | "release", or null.
    timerFired: useCallback(() => controller.timerFired(id), [controller, id]),
  };
}

/**
 * While `active` (the mobile menu is open) the automatic player goes and
 * nothing starts, not even from a poster; the visitor's player stays.
 */
export function useTurnBlocker(name: string, active: boolean) {
  const controller = useTurnController();
  useEffect(() => {
    if (!active) return;
    controller.addBlocker(name);
    return () => controller.removeBlocker(name);
  }, [controller, name, active]);
}

/**
 * For a poster button that fills its TurnSlot box. The box clips
 * (overflow-hidden) and the global :focus-visible ring (globals.css) is drawn
 * 2 px OUTSIDE the element, so on the poster it was clipped away whole: a
 * keyboard user saw no focus at all (WCAG 2.4.7). This draws the same 2 px
 * ring INSIDE the box, with square corners like the player.
 */
export const POSTER_FOCUS_CLASS = "focus-visible:rounded-none focus-visible:outline-offset-[-3px]";

/**
 * One player's box: the poster, or the <iframe> while it holds the turn. The
 * box is what the turn manager measures (visible part, 200x200 minimum), so
 * give it the player's final size.
 */
export function TurnSlot({
  id,
  priority,
  src,
  title,
  poster,
  className,
  autoStart = false,
  onMount,
  onIframeLoad,
}: {
  id: string;
  priority?: number;
  // youtube-nocookie URL (lib/playback-turn.ts shortEmbedUrl / loopEmbedUrl).
  src: string;
  title: string;
  poster: ReactNode;
  className?: string;
  // Starts on its own when it is seen (UFC TV, the event's broadcast). False
  // by default: then it only plays when the visitor starts it (the hero short).
  autoStart?: boolean;
  onMount?: (owner: TurnOwner) => void;
  // The hero starts its short's timer here (duration + 2.5 s, as in the mockup).
  onIframeLoad?: () => void;
}) {
  const controller = useTurnController();
  const boxRef = useRef<HTMLDivElement>(null);
  // The latest callback, without re-registering the player on every render.
  const latest = useRef({ onMount });
  useEffect(() => {
    latest.current = { onMount };
  }, [onMount]);

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    return controller.register({
      id,
      priority,
      element,
      autoStart,
      onMount: (owner) => latest.current.onMount?.(owner),
    });
  }, [controller, id, priority, autoStart]);

  const view: PlayerView = useSyncExternalStore(
    controller.subscribe,
    () => controller.getView(id),
    () => IDLE_VIEW,
  );

  // The focused-iframe check of the "touched" detection needs the element.
  const iframeRef = useCallback(
    (el: HTMLIFrameElement | null) => {
      controller.setIframe(id, el);
      return () => controller.setIframe(id, null);
    },
    [controller, id],
  );

  return (
    <div
      ref={boxRef}
      className={cn("relative", className)}
      data-turn={id}
      data-turn-state={view.mounted ? `playing-${view.owner}` : "poster"}
    >
      {view.mounted ? (
        <iframe
          key={view.mountCount}
          ref={iframeRef}
          src={src}
          title={title}
          // `fullscreen` in allow already covers allowfullscreen (Chrome warns
          // if both are set). Same allow list as the mockup and UFC TV.
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={onIframeLoad}
          className="absolute inset-0 block size-full border-0"
        />
      ) : (
        poster
      )}
    </div>
  );
}
