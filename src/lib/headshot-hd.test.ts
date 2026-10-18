import { describe, expect, it } from "vitest";

import { headshotSrcSet, hdHeadshotUrl } from "./headshot-hd";

// Real stored URLs (fighters.headshot_url, read-only query of 18-oct-2026).
const RECENT =
  "https://www.ufc.com/images/styles/event_results_athlete_headshot/s3/2026-05/VOLKOV_ALEXANDER_05-09.png?itok=abc123";
const VOLKANOVSKI =
  "https://www.ufc.com/images/styles/event_results_athlete_headshot/s3/2026-01/VOLKANOVSKI_ALEXANDER_BELT_01-31.png?itok=GscR5oi8";
// Legacy path, with the literal "&amp;" of 643 stored URLs (HTML never unescaped).
const LEGACY_AMP =
  "https://www.ufc.com/images/styles/event_results_athlete_headshot/s3/image/fighter_images/Heath_Herring/Heath_Herring_500x325.png?VersionId=roqOfuvFG8iPT6c3i_uVMNSKovBUgv1e&amp;itok=4HmYck3M";
const DOUBLE_ENCODED =
  "https://www.ufc.com/images/styles/event_results_athlete_headshot/s3/image/2023-11/VARGAS_KAZULA%252F.png?itok=x";
const NO_WWW =
  "https://ufc.com/images/styles/event_results_athlete_headshot/s3/2025-03/SMITH_JOHN.png?itok=q";
const BODY_AS_FACE =
  "https://www.ufc.com/images/styles/athlete_bio_full_body/s3/2025-02/HERRERA_L.png?itok=z";
const STANDING =
  "https://www.ufc.com/images/styles/event_fight_card_upper_body_of_standing_athlete/s3/2026-01/VOLKANOVSKI_R.png?itok=y";
const ESPN = "https://a.espncdn.com/i/headshots/mma/players/full/4064999.png";
const ORIGINAL = "https://ufc.com/images/image/fighter_images/X/X_500x325.png";

describe("hdHeadshotUrl", () => {
  it("drops the style chunk and the query of an event_results_athlete_headshot face", () => {
    expect(hdHeadshotUrl(RECENT)).toBe("https://www.ufc.com/images/2026-05/VOLKOV_ALEXANDER_05-09.png");
    expect(hdHeadshotUrl(VOLKANOVSKI)).toBe(
      "https://www.ufc.com/images/2026-01/VOLKANOVSKI_ALEXANDER_BELT_01-31.png",
    );
  });

  it("strips a literal &amp; query along with VersionId and itok", () => {
    const hd = hdHeadshotUrl(LEGACY_AMP);
    expect(hd).toBe(
      "https://www.ufc.com/images/image/fighter_images/Heath_Herring/Heath_Herring_500x325.png",
    );
    expect(hd).not.toContain("amp;");
    expect(hd).not.toContain("?");
  });

  it("copies the path as is, without decoding %252F", () => {
    expect(hdHeadshotUrl(DOUBLE_ENCODED)).toBe(
      "https://www.ufc.com/images/image/2023-11/VARGAS_KAZULA%252F.png",
    );
  });

  it("accepts ufc.com without www and always answers with www", () => {
    expect(hdHeadshotUrl(NO_WWW)).toBe("https://www.ufc.com/images/2025-03/SMITH_JOHN.png");
  });

  it("leaves every other ufc.com style alone (their originals weigh MB)", () => {
    expect(hdHeadshotUrl(BODY_AS_FACE)).toBeNull();
    expect(hdHeadshotUrl(STANDING)).toBeNull();
    expect(hdHeadshotUrl(ORIGINAL)).toBeNull();
  });

  it("leaves ESPN and local files alone", () => {
    expect(hdHeadshotUrl(ESPN)).toBeNull();
    expect(hdHeadshotUrl("/fighters/josh-hokit.avif")).toBeNull();
    // A lookalike host must not match.
    expect(
      hdHeadshotUrl("https://evil.example/www.ufc.com/images/styles/event_results_athlete_headshot/s3/a.png"),
    ).toBeNull();
  });

  it("answers null for null, undefined and empty", () => {
    expect(hdHeadshotUrl(null)).toBeNull();
    expect(hdHeadshotUrl(undefined)).toBeNull();
    expect(hdHeadshotUrl("")).toBeNull();
  });
});

describe("headshotSrcSet", () => {
  it("offers the stored copy at 256w and the original at 500w", () => {
    expect(headshotSrcSet(RECENT)).toBe(
      `${RECENT} 256w, https://www.ufc.com/images/2026-05/VOLKOV_ALEXANDER_05-09.png 500w`,
    );
  });

  it("keeps the stored URL untouched, &amp; included (it is what already loads today)", () => {
    expect(headshotSrcSet(LEGACY_AMP)?.startsWith(`${LEGACY_AMP} 256w, `)).toBe(true);
  });

  it("is undefined when there is no original to offer", () => {
    expect(headshotSrcSet(ESPN)).toBeUndefined();
    expect(headshotSrcSet(BODY_AS_FACE)).toBeUndefined();
    expect(headshotSrcSet(null)).toBeUndefined();
  });

  it("escapes whitespace and commas so a candidate cannot split the attribute", () => {
    const odd =
      "https://www.ufc.com/images/styles/event_results_athlete_headshot/s3/2026-05/A B,C.png?itok=1";
    const srcSet = headshotSrcSet(odd);
    expect(srcSet).toBe(
      "https://www.ufc.com/images/styles/event_results_athlete_headshot/s3/2026-05/A%20B%2CC.png?itok=1 256w, " +
        "https://www.ufc.com/images/2026-05/A%20B%2CC.png 500w",
    );
  });
});
