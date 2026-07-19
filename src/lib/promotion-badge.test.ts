import { describe, expect, it } from "vitest";

import { promotionBadge } from "@/lib/promotion-badge";

describe("promotionBadge", () => {
  it("maps rows without origin (UFC, tabla `fights`) to the red UFC badge", () => {
    expect(promotionBadge({})).toEqual({
      label: "UFC",
      className: "bg-primary/10 text-primary",
    });
  });

  it("ignores a stray promotion on non-espn rows", () => {
    // Las filas UFC no llevan promotion, pero si llegara una no debe pintarse.
    expect(promotionBadge({ promotion: "Bellator" })).toEqual({
      label: "UFC",
      className: "bg-primary/10 text-primary",
    });
  });

  it("maps Bellator to the amber badge with the light-mode contrast fix", () => {
    expect(promotionBadge({ origin: "espn", promotion: "Bellator" })).toEqual({
      label: "Bellator",
      className:
        "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-400",
    });
  });

  it("maps other regionals to the muted badge with their short name", () => {
    expect(promotionBadge({ origin: "espn", promotion: "CFFC" })).toEqual({
      label: "CFFC",
      className: "bg-muted text-muted-foreground",
    });
  });

  it("falls back to 'Otra' when an espn row has no promotion", () => {
    expect(promotionBadge({ origin: "espn", promotion: null })).toEqual({
      label: "Otra",
      className: "bg-muted text-muted-foreground",
    });
  });
});
