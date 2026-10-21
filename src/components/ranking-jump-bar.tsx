"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import {
  divisionRow,
  pickActiveDivision,
  READING_BAND_PX,
  type CardBox,
  type DivisionJump,
} from "@/lib/ranking-jumps";
import { cn } from "@/lib/utils";

// The /clasificacion jump bar (owner, 21-oct-2026): after the big-faces
// redesign the page is 19,644 px tall on a 390 phone (13,832 before) and had
// no index. One link per division card, sticky right under the site header.
//
// Plain <a href="#peso-pluma"> links to the cards' ids: a shared
// /clasificacion#peso-pluma lands on its card, and a click before hydration is
// the browser's own jump. Where it lands and how the bar sticks is CSS
// (globals.css, .ranking-jumpbar and .ranking-jump-target), so it is right
// before hydration too. 🪤 Not with JavaScript off, though: the layout reads
// headers() (the CSP nonce), so the route is dynamic, and loading.tsx makes
// it stream: the whole page, bar and cards, arrives in a <div hidden> that an
// inline script reveals. With JS off the skeleton stays, here as on every page
// of the site, production included (measured 21-oct). JavaScript adds what
// CSS cannot know:
//   · the header's real height into --site-header-height (59 px below sm and
//     63 from sm today, which the CSS fallback says too; this keeps the bar
//     glued if the header ever changes);
//   · which division is being read (aria-current="location") and the rest of
//     its grid row (data-in-view), from an IntersectionObserver on a 1 px band
//     under the bar: it runs only when a card crosses that band, never on
//     every scrolled pixel;
//   · the phone row scrolling itself so the active link is in sight (that row
//     only: the page never moves for it), and the fades that say there is more;
//   · a smooth jump, unless the visitor asked for reduced motion;
//   · a #hash in the address only while it says where the visitor is (onMove).

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// How long a jump may hold the active link before the reading line takes
// over anyway (a target the page cannot scroll up to the line, say). The
// longest jump of the page, from the top to the last card, took 1.5 s in
// Chromium at 390 and 0.24 s in WebKit (1.3 s and 0.3 s at 1280; measured
// 21-oct).
const JUMP_TIMEOUT_MS = 3000;

// The visitor moving on their own: a finger, the wheel, a key, a click. A
// jump still in flight is theirs to stop, and the #hash goes: from then on it
// no longer says where they are. 🪤 And it must go before they leave: Chromium
// takes Back to the #hash still in the address, not to where the visitor was
// (jump to «Pluma», read 600 px down, open a fighter, Back: 6,253 → 5,653 at
// 390, the card's top; measured 21-oct). Without the hash it restores the
// exact position, like WebKit and like the page before the bar.
const MOVES = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

// The line sits this far below where a jumped card's top lands (exactly its
// scroll-margin-top): sub-pixel rounding must not leave that card just under
// the line it was sent to.
const LINE_SLACK_PX = 8;

// How far a shared link's card may sit from its landing spot at hydration and
// still count as the browser's own landing, put right again. 🪤 WebKit lands
// it and then lets the page settle under it: the card ended 4 to 8 px lower
// after the load event (12 in one run), at 390 and 1280, where Chromium stays
// put (measured 21-oct). A visitor's own move is far longer: one wheel notch
// is 100 px.
const LANDING_DRIFT_PX = 48;

// Once per document. The first mount is the page's arrival, the only one that
// may fix a shared link's landing; a later one is a client navigation back to
// the page (Back from a fighter), where the browser restores the visitor's
// position and nothing here may move them. 🪤 The Navigation Timing entry
// cannot tell the two apart: it is the document's first load, «navigate» for
// good, so every Back re-ran the landing and dropped the visitor on the card.
let arrivalHandled = false;

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
// What the bar lights: the division being read, and its grid row (the ids,
// space-joined, so an unchanged row does not re-render).
type View = { active: string | null; row: string };

export function RankingJumpBar({ jumps }: { jumps: DivisionJump[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [view, setView] = useState<View>({ active: null, row: "" });
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

    // replaceState with the current state: it carries Next's __NA mark, so
    // the router lets it through untouched instead of re-rendering.
    const clearHash = () => {
      if (!window.location.hash) return;
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    };

    let timer: number | undefined;
    let armed = false;
    const disarm = () => {
      window.clearTimeout(timer);
      if (!armed) return;
      armed = false;
      for (const type of MOVES) window.removeEventListener(type, onMove, true);
    };
    const arm = () => {
      if (armed) return;
      armed = true;
      for (const type of MOVES) window.addEventListener(type, onMove, { capture: true, passive: true });
    };

    const show = (active: string | null, boxes: CardBox[]) => {
      const row = active ? divisionRow(boxes, active).join(" ") : "";
      setView((prev) => (prev.active === active && prev.row === row ? prev : { active, row }));
    };

    const update = () => {
      const line = readingLine();
      const boxes = targets.map((el) => {
        const box = el.getBoundingClientRect();
        return { id: el.id, top: box.top, bottom: box.bottom };
      });
      const jump = jumpRef.current;
      const picked = pickActiveDivision(boxes, line, jump?.id ?? null);
      if (jump && !jump.arrived) {
        if (picked !== jump.id) {
          show(jump.id, boxes);
          return;
        }
        jump.arrived = true;
        window.clearTimeout(timer);
      } else if (jump && picked !== jump.id) {
        // Arrived, and the visitor has read on past its row with no MOVES
        // event (the scrollbar, find in page): the hash goes all the same.
        jumpRef.current = null;
        disarm();
        clearHash();
      }
      show(picked, boxes);
    };

    function onMove(event: Event) {
      // Ctrl+L, Cmd+C… are the browser's, not a move.
      if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey || event.altKey)) return;
      disarm();
      clearHash();
      if (jumpRef.current && !jumpRef.current.arrived) {
        jumpRef.current = null;
        update();
      }
    }

    holdRef.current = (id: string) => {
      disarm();
      jumpRef.current = { id, arrived: false };
      timer = window.setTimeout(() => {
        // A jump that never gets there: the reading line takes over.
        if (!jumpRef.current || jumpRef.current.arrived) return;
        jumpRef.current = null;
        update();
      }, JUMP_TIMEOUT_MS);
      arm();
      update();
    };

    let band: IntersectionObserver | null = null;
    const observe = () => {
      band?.disconnect();
      const line = readingLine();
      // A 1 px band at the line: a card enters or leaves it exactly when it
      // crosses the line, and only then does the callback run.
      const below = Math.max(0, window.innerHeight - line - READING_BAND_PX);
      band = new IntersectionObserver(update, {
        rootMargin: `${-line}px 0px ${-below}px 0px`,
      });
      for (const target of targets) band.observe(target);
    };
    // 🪤 A jump from one gap to another crosses no card at the line, so the
    // band has nothing to report: End from the top (instant in WebKit) left
    // «P4P» lit at the foot of the page. A card entering or leaving the
    // screen always comes with such a jump; this observer runs only then.
    const screen = new IntersectionObserver(update);
    for (const target of targets) screen.observe(target);

    // The header's own strip: from its top to the bottom of its first row,
    // plus its bottom border. 🪤 Not the whole <header>: the mobile menu opens
    // inside it (424 px tall at 390), and the bar went down with it, left
    // floating under the open menu like a second strip of links (measured
    // 21-oct). Measured this way it stays where it is, and the menu (the
    // header's z-40) covers it (the bar's z-30).
    const measureHeader = () => {
      if (!header) return;
      const row = header.firstElementChild ?? header;
      const strip =
        row.getBoundingClientRect().bottom -
        header.getBoundingClientRect().top +
        (parseFloat(getComputedStyle(header).borderBottomWidth) || 0);
      root.style.setProperty("--site-header-height", `${strip}px`);
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

    // A hash later on (typed in the address bar, or Back and Forward between
    // two native jumps made before hydration): the browser has jumped; mark
    // it. 🪤 The ids are plain ASCII, so the hash is compared as it comes:
    // decodeURIComponent threw a URIError on a broken %-escape (#%), and React
    // took the whole page down to error.tsx.
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (ids.includes(id)) holdRef.current(id);
    };
    const landing = window.location.hash.slice(1);
    const target = ids.includes(landing) ? document.getElementById(landing) : null;
    const first = !arrivalHandled;
    arrivalHandled = true;
    // (Without a hash, the observers' first callback marks the active link.)
    if (target && first) {
      const offset = () =>
        target.getBoundingClientRect().top - (parseFloat(getComputedStyle(target).scrollMarginTop) || 0);
      const arrival = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      // A shared link. 🪤 WebKit does not always land it: the cards stream in
      // after the skeleton, and when the load event came before they were
      // revealed it stayed at the top (scrollY 0); Chromium always landed
      // (measured 21-oct). So a page STILL AT THE TOP, or a landing that has
      // drifted (LANDING_DRIFT_PX), is sent there now, instantly. Nothing
      // else: a visitor who scrolled before a late hydration (a slow phone)
      // is not dragged back to the card (8,153 → 5,653 at 390, measured), and
      // on a reload the browser's restored position wins.
      const off = offset();
      const fresh = (arrival?.type ?? "navigate") === "navigate";
      if (fresh && Math.abs(off) > 2 && (window.scrollY < 1 || Math.abs(off) <= LANDING_DRIFT_PX)) {
        target.scrollIntoView({ block: "start" });
      }
      const atBottom = window.scrollY >= root.scrollHeight - window.innerHeight - 1;
      const now = offset();
      if (Math.abs(now) <= 2 || (now > 0 && atBottom)) holdRef.current(landing);
      // Elsewhere already: the hash no longer says where the visitor is.
      else clearHash();
    }
    window.addEventListener("hashchange", fromHash);

    return () => {
      disarm();
      cancelAnimationFrame(frame);
      resizes?.disconnect();
      band?.disconnect();
      screen.disconnect();
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
  const { active } = view;
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
    // The address says where the visitor is, ready to share, until they move
    // on (MOVES). replaceState and not a push: ten jumps are not ten Back
    // presses away from leaving.
    window.history.replaceState(window.history.state, "", `#${id}`);
    // Keyboard and screen-reader users carry on from the card, as after a
    // native jump: its heading (tabIndex -1) takes the focus, not the page.
    target.querySelector<HTMLElement>("[data-jump-heading]")?.focus({ preventScroll: true });
  };

  const row = view.row ? view.row.split(" ") : [];

  // The header's own glass (bg-background/85, backdrop-blur-md), so stuck
  // under it the two read as one block. The muted labels keep their contrast
  // over whatever scrolls behind: 7.25:1 (light) and 7.67:1 (dark) on the
  // plain background, and with pure black under the 15 % that shows through
  // (light) or pure white (dark), still 5.13:1 and 5.17:1, before the blur
  // softens it. The lit labels (foreground) are 12.7:1 or more.
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
          {jumps.map((jump, i) => {
            const current = view.active === jump.anchor;
            // On a desktop a row of two or three cards is read at once: the
            // rest of it lights too, in the foreground colour; the red line
            // (and aria-current, one link only) marks the one being read.
            const inView = !current && row.includes(jump.anchor);
            return (
              <li
                key={jump.anchor}
                data-group-start={i > 0 && jumps[i - 1].group !== jump.group ? "" : undefined}
              >
                <a
                  href={`#${jump.anchor}`}
                  aria-label={jump.name}
                  aria-current={current ? "location" : undefined}
                  data-in-view={inView ? "" : undefined}
                  onClick={(event) => onJump(event, jump.anchor)}
                  className={cn(
                    "ranking-jumpbar-link font-display text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:-outline-offset-2",
                    current || inView ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {jump.short}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
