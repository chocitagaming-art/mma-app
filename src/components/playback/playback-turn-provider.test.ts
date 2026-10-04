import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PlaybackTurnProvider,
  TurnSlot,
  usePlaybackTurn,
} from "@/components/playback/playback-turn-provider";

// The server render of the turn manager (no DOM needed: effects do not run on
// the server). What must hold before any JavaScript runs: every slot is its
// poster, and no <iframe> reaches the HTML — a player is only ever mounted by
// the controller in the browser, after the visibility rules. The browser
// behaviour is in turn-controller.test.ts.

function slot(id: string) {
  return createElement(TurnSlot, {
    id,
    src: `https://www.youtube-nocookie.com/embed/IuRvqcEmJr0?autoplay=1&mute=1&playsinline=1`,
    title: "Short de la UFC",
    poster: createElement("button", { type: "button" }, "Toca para ver"),
    className: "aspect-[9/16] w-[330px]",
  });
}

describe("PlaybackTurnProvider · server render", () => {
  it("every slot renders its poster and no iframe", () => {
    const html = renderToStaticMarkup(
      createElement(PlaybackTurnProvider, null, slot("hero"), slot("tv-bucle")),
    );
    expect(html).not.toContain("<iframe");
    expect(html.match(/Toca para ver/g)).toHaveLength(2);
    expect(html).toContain('data-turn="hero"');
    expect(html).toContain('data-turn="tv-bucle"');
    expect(html.match(/data-turn-state="poster"/g)).toHaveLength(2);
  });

  it("a slot or the hook outside the provider fails loudly instead of autoplaying unmanaged", () => {
    expect(() => renderToStaticMarkup(slot("hero"))).toThrow(/PlaybackTurnProvider/);
    function Orphan() {
      usePlaybackTurn("hero");
      return null;
    }
    expect(() => renderToStaticMarkup(createElement(Orphan))).toThrow(/PlaybackTurnProvider/);
  });
});
