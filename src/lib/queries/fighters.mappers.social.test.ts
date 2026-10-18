import { describe, expect, it } from "vitest";

import { mapSocialProfiles } from "@/lib/queries/fighters.mappers";

// R6: Instagram and X arrive through `select f.*`. Before mma-ingesta's
// migration 032 the keys are not in the row at all, and the fighter page must
// keep rendering (no 500, no link).

describe("mapSocialProfiles", () => {
  it("passes the stored shape through", () => {
    expect(
      mapSocialProfiles({
        instagram_url: "https://www.instagram.com/alexvolkanovski/",
        x_url: "https://x.com/alexvolkanovski",
      }),
    ).toEqual({
      instagramUrl: "https://www.instagram.com/alexvolkanovski/",
      xUrl: "https://x.com/alexvolkanovski",
    });
  });

  it("a row from a database without the columns: both null", () => {
    expect(mapSocialProfiles({})).toEqual({ instagramUrl: null, xUrl: null });
  });

  it("NULL (no profile, or ufc.com stopped listing it): null", () => {
    expect(mapSocialProfiles({ instagram_url: null, x_url: null })).toEqual({
      instagramUrl: null,
      xUrl: null,
    });
  });

  it("a value that is not the stored shape degrades to null, never to a broken link", () => {
    expect(
      mapSocialProfiles({
        instagram_url: "https://www.instagram.com/TheNotoriousMMA/",
        x_url: "https://twitter.com/TheNotoriousMMA",
      }),
    ).toEqual({ instagramUrl: null, xUrl: null });
  });
});
