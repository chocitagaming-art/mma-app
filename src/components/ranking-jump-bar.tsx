"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { pickActiveDivision, type DivisionJump } from "@/lib/ranking-jumps";
import { cn } from "@/lib/utils";

// The /clasificacion jump bar (owner, 21-oct-2026): after the big-faces
// redesign the page is 19,644 px tall on a 390 phone (13,832 before) and had
// no index. One link per division card, sticky right under the site header.
//
// Plain <a href="#peso-pluma"> links: they jump with no JavaScript and a
// shared /clasificacion#peso-pluma lands on its card. Where it lands and how
// the bar sticks is CSS (globals.css, .ranking-jumpbar and
// .ranking-jump-target), so it is right before hydration too. JavaScript only
// adds what CSS cannot know:
//   · the header's real height into --site-header-height (59 px below sm and
//     63 from sm today, which the CSS fallback says too; this keeps the bar
//     glued if the header ever changes, or grows with its mobile menu);
//   · which division is being read (aria-current="location"), from an
//     IntersectionObserver on a 1 px line under the bar: it runs only when a
//     card crosses that line, never on every scrolled pixel;
//   · the phone row scrolling itself so the active link is in sight (that row
//     only: the page never moves for it), and the fades that say there is more;
//   · a smooth jump, unless the visitor asked for reduced motion.

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// How long a jump may hold the active link before the reading line takes
// over anyway (a target the page cannot scroll up to the line, say). The
// longest jump of the page, from the top to the last card, took 1.5 s in
// Chromium at 390 and 0.24 s in WebKit (1.3 s and 0.3 s at 1280; measured
// 21-oct). A jump the visitor interrupts (wheel, finger, keys) is released
// at once.
const JUMP_TIMEOUT_MS = 3000;
const INTERRUPTIONS = ["wheel", "touchstart", "keydown"] as const;

// The line sits this far below where a jumped card's top lands (exactly its
// scroll-margin-top): sub-pixel rounding must not leave that card just under
// the line it was sent to.
const LINE_SLACK_PX = 8;

function reducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

// Centres `link` in the phone row when it is not fully in sight, clear of the
// fades (the row's scroll-padding-inline marks them). It scrolls that row
// only, so it can never move the page; scrollIntoView would.
function revealInRow(list: HTMLElement, link: HTMLElement, behavior: ScrollBehavior): void {
  const row = list.getBoundingClientRect();
  const box = link.getBoundingClientRect();
  const fade = parseFloat(getComputedStyle(list).scrollPaddingInlineStart) || 0;
  // Where the row cannot scroll any further (its two ends), a link right at
  // the edge has no fade over it: that counts as in sight.
  const clearLeft = list.scrollLeft <= 0.5 ? row.left : row.left + fade;
  const clearRight = list.scrollLeft >= list.scrollWidth - list.clientWidth - 0.5 ? row.right : row.right - fade;
  if (box.left >= clearLeft - 0.5 && box.right <= clearRight + 0.5) return;
  list.scrollTo({ left: list.scrollLeft + (box.left - row.left) - (row.width - box.width) / 2, behavior });
}

type Jump = { id: string; arrived: boolean };

export function RankingJumpBar({ jumps }: { jumps: DivisionJump[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState<string | null>(null);
  // The jump in flight. While the page travels to it, it stays the active
  // link (the cards it passes would light up one after another otherwise);
  // once there, it wins its grid row (pickActiveDivision).
  const jumpRef = useRef<Jump | null>(null);
  // Set by the effect below, which owns the observers: start a jump.
  const holdRef = useRef<(id: string) => void>(() => {});
  const anchors = jumps.map((jump) => jump.anchor).join(" ");

  useEffect(() => {
    const list = listRef.current;
    const nav = list?.closest("nav");
    const ids = anchors.split(" ");
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (!nav || targets.length === 0) return;
    const root = document.documentElement;
    const header = document.querySelector<HTMLElement>("[data-site-header]");

    // Where a jumped card's top lands, read from its own scroll-margin-top
    // (header + bar + gap, resolved by CSS): the line and the jump cannot
    // disagree.
    const readingLine = () =>
      (parseFloat(getComputedStyle(targets[0]).scrollMarginTop) || 0) + LINE_SLACK_PX;

    let timer: number | undefined;
    const release = () => {
      window.clearTimeout(timer);
      for (const type of INTERRUPTIONS) window.removeEventListener(type, interrupt);
    };

    const update = () => {
      const line = readingLine();
      const boxes = targets.map((el) => {
        const box = el.getBoundingClientRect();
        return { id: el.id, top: box.top, bottom: box.bottom };
      });
      const jump = jumpRef.current;
      const picked = pickActiveDivision(boxes, line, jump?.id ?? null);
      if (jump && picked === jump.id && !jump.arrived) {
        jump.arrived = true;
        release();
      } else if (jump && !jump.arrived) {
        setActive(jump.id);
        return;
      } else if (jump && picked !== jump.id) {
        // Arrived, and the visitor has read on past it.
        jumpRef.current = null;
      }
      setActive(picked);
    };

    // The visitor taking over mid-flight, or a jump that never gets there.
    function interrupt() {
      if (!jumpRef.current || jumpRef.current.arrived) return;
      release();
      jumpRef.current = null;
      update();
    }

    holdRef.current = (id: string) => {
      release();
      jumpRef.current = { id, arrived: false };
      timer = window.setTimeout(interrupt, JUMP_TIMEOUT_MS);
      for (const type of INTERRUPTIONS) window.addEventListener(type, interrupt, { passive: true });
      update();
    };

    let observer: IntersectionObserver | null = null;
    const observe = () => {
      observer?.disconnect();
      const line = readingLine();
      // A 1 px band at the line: a card enters or leaves it exactly when it
      // crosses the line, and only then does the callback run.
      const below = Math.max(0, window.innerHeight - line - 1);
      observer = new IntersectionObserver(update, {
        rootMargin: `${-line}px 0px ${-below}px 0px`,
      });
      for (const target of targets) observer.observe(target);
    };

    const measureHeader = () => {
      if (header) {
        root.style.setProperty("--site-header-height", `${header.getBoundingClientRect().height}px`);
      }
    };
    let frame = 0;
    const remeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measureHeader();
        observe();
      });
    };
    const resizes = header ? new ResizeObserver(remeasure) : null;
    if (header) resizes?.observe(header);
    window.addEventListener("resize", remeasure);
    measureHeader();
    observe();

    // A hash later on (Back to a native jump made before hydration, a hash
    // typed in the address bar): the browser has jumped; mark it.
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (ids.includes(id)) holdRef.current(id);
    };
    // A hash on arrival: a shared link. 🪤 WebKit does not always land it:
    // the cards stream in after the skeleton, and at 1280 it stayed at the
    // top (scrollY 0, 1.5 s after load) where at 390 it landed; Chromium
    // landed both (measured 21-oct). So a target that is not where its
    // scroll-margin puts it is sent there now, instantly. Only on a fresh
    // load: on a reload or Back the browser restores the visitor's own
    // position, and that one wins.
    const arrival = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const landing = decodeURIComponent(window.location.hash.slice(1));
    const target = ids.includes(landing) ? document.getElementById(landing) : null;
    // (Without a hash, the observer's first callback marks the active link.)
    if (target && (arrival?.type ?? "navigate") === "navigate") {
      const off = target.getBoundingClientRect().top - (parseFloat(getComputedStyle(target).scrollMarginTop) || 0);
      if (Math.abs(off) > 2) target.scrollIntoView({ block: "start" });
      holdRef.current(landing);
    }
    window.addEventListener("hashchange", fromHash);

    return () => {
      release();
      cancelAnimationFrame(frame);
      resizes?.disconnect();
      observer?.disconnect();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("hashchange", fromHash);
      root.style.removeProperty("--site-header-height");
      holdRef.current = () => {};
    };
  }, [anchors]);

  // The phone row follows the active link as the page is read. Not while the
  // keyboard is in the row: there the focused link is the one to keep in
  // sight (onFocus below). 🪤 Without that check, the observer's first
  // callback after hydration lit «P4P» and pulled the row back to the start
  // from under a visitor already tabbing through it (measured 21-oct: focus
  // on «Medio», row at 0, the link 100 px out of sight).
  useEffect(() => {
    const list = listRef.current;
    if (!active || !list || list.contains(document.activeElement)) return;
    const link = list.querySelector<HTMLElement>(`a[href="#${CSS.escape(active)}"]`);
    if (link) revealInRow(list, link, reducedMotion() ? "auto" : "smooth");
  }, [active]);

  // The fades at the row's ends, only where there is more to scroll to. With
  // no JavaScript there are none: the row is just clipped at the edge.
  useEffect(() => {
    const list = listRef.current;
    const first = list?.firstElementChild;
    const last = list?.lastElementChild;
    if (!list || !first || !last) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const hidden = entry.intersectionRatio < 0.98;
          if (entry.target === first) list.toggleAttribute("data-more-before", hidden);
          if (entry.target === last) list.toggleAttribute("data-more-after", hidden);
        }
      },
      { root: list, threshold: [0, 0.98, 1] },
    );
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, [anchors]);

  const onJump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    // A new tab, a modified click: the browser's own, untouched.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    holdRef.current(id);
    target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    // The address says where the visitor is, ready to share. replaceState and
    // not a push: ten jumps are not ten Back presses away from leaving. The
    // current state goes along (it carries Next's __NA mark), so the router
    // lets it through untouched instead of re-rendering for a hash.
    window.history.replaceState(window.history.state, "", `#${id}`);
    // Keyboard and screen-reader users carry on from the card, as after a
    // native jump: its heading (tabIndex -1) takes the focus, not the page.
    target.querySelector<HTMLElement>("[data-jump-heading]")?.focus({ preventScroll: true });
  };

  // The header's own glass (bg-background/85, backdrop-blur-md), so stuck
  // under it the two read as one block. The muted labels keep their contrast
  // over whatever scrolls behind: 7.25:1 (light) and 7.67:1 (dark) on the
  // plain background, and with pure black under the 15 % that shows through
  // (light) or pure white (dark), still 5.13:1 and 5.17:1, before the blur
  // softens it. The active label (foreground) is 12.7:1 or more.
  return (
    <nav
      aria-label="Divisiones"
      className="ranking-jumpbar mt-8 border-b border-border bg-background/85 backdrop-blur-md"
    >
      <div className="mx-auto h-full max-w-7xl">
        <ul
          ref={listRef}
          className="ranking-jumpbar-list"
          // A focused link is never left under a fade: browsers only scroll
          // a focused element that is out of sight, and «Ligero» at 390 is in
          // sight but faded. Instant, like the browser's own focus scroll.
          onFocus={(event) => {
            if (event.target instanceof HTMLElement && listRef.current) {
              revealInRow(listRef.current, event.target, "auto");
            }
          }}
        >
          {jumps.map((jump, i) => (
            <li
              key={jump.anchor}
              data-group-start={i > 0 && jumps[i - 1].group !== jump.group ? "" : undefined}
            >
              <a
                href={`#${jump.anchor}`}
                aria-current={active === jump.anchor ? "location" : undefined}
                onClick={(event) => onJump(event, jump.anchor)}
                className={cn(
                  "ranking-jumpbar-link font-display text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:-outline-offset-2",
                  active === jump.anchor ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {jump.short}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
