import { describe, expect, it } from "vitest";

import {
  FRAME_ZOOM,
  buildCutoutIndex,
  compareByClass,
  fightClip,
  latestClass,
  orderByClass,
  parsePhotoFocus,
  personPhotoUrl,
  photoMode,
  resolveHofPhotoUrl,
} from "@/lib/hall-of-fame-display";
import type { HallOfFameData, HofInductee } from "@/lib/queries/hall-of-fame";

// THE HALL OF FAME'S TWO DECISIONS, pinned down with made-up rows shaped like
// the real ones (the production base has no migration 031 yet):
//   · relief or frame: relief ONLY when the painted photo is the measured one
//     and the measure says cut-out. The 17-oct mockup decided by domain and got
//     two people wrong: Dan Severn (ufc.com, WITH a background) went in relief
//     and Forrest Griffin (a local file, a real cut-out) in the frame.
//   · the order: newest class first, the seed's order inside a class, and the
//     newest class across the four wings above the tabs.

const UFC_HEADSHOT = (who: string) =>
  `https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/${who}.png?itok=x&amp;h=1`;
const SEVERN_GALLERY = "https://ufc.com/images/image/photo_galleries/Archive_01/188125115.jpg?x=1";
const FRYE_PORTRAIT =
  "https://www.ufc.com/images/styles/382x217_2/s3/2023-11/HOF_DFrye_16x9.jpg?h=854a7be2&itok=62V__v7c";

function inductee(over: Partial<HofInductee>): HofInductee {
  return {
    wing: "pioneer",
    displayName: "Nobody",
    inducteeYear: 2020,
    sortOrder: 0,
    subtitle: null,
    photoUrl: null,
    bio: null,
    photoFocus: null,
    videoId: null,
    videoStart: null,
    videoEnd: null,
    photoMeasuredUrl: null,
    photoIsCutout: null,
    fighterId: null,
    headshotUrl: null,
    nationality: null,
    cornerAId: null,
    cornerAName: null,
    cornerAHeadshot: null,
    cornerAMeasuredUrl: null,
    cornerACutout: null,
    cornerBId: null,
    cornerBName: null,
    cornerBHeadshot: null,
    cornerBMeasuredUrl: null,
    cornerBCutout: null,
    ...over,
  };
}

function hall(rows: HofInductee[]): HallOfFameData {
  const data: HallOfFameData = { modern: [], pioneer: [], contributor: [], fight: [] };
  for (const row of rows) data[row.wing].push(row);
  return data;
}

const royce = inductee({
  displayName: "Royce Gracie",
  inducteeYear: 2003,
  headshotUrl: UFC_HEADSHOT("ROYCE"),
  photoMeasuredUrl: UFC_HEADSHOT("ROYCE"),
  photoIsCutout: true,
});
const severn = inductee({
  displayName: "Dan Severn",
  inducteeYear: 2005,
  sortOrder: 2,
  headshotUrl: SEVERN_GALLERY,
  photoMeasuredUrl: SEVERN_GALLERY,
  photoIsCutout: false,
});
const forrest = inductee({
  wing: "modern",
  displayName: "Forrest Griffin",
  inducteeYear: 2013,
  photoUrl: "/fighters/forrest-griffin.webp",
  headshotUrl: "https://ufc.com/bw-forrest.png",
  photoMeasuredUrl: "/fighters/forrest-griffin.webp",
  photoIsCutout: true,
});
const griffinBonnar = inductee({
  wing: "fight",
  displayName: "Forrest Griffin vs. Stephan Bonnar I",
  inducteeYear: 2013,
  cornerAName: "Forrest Griffin",
  cornerAHeadshot: "https://ufc.com/bw-forrest.png",
  cornerAMeasuredUrl: "https://ufc.com/bw-forrest.png",
  cornerACutout: true,
  cornerBName: "Stephan Bonnar",
  cornerBHeadshot: UFC_HEADSHOT("BONNAR"),
  cornerBMeasuredUrl: UFC_HEADSHOT("BONNAR"),
  cornerBCutout: true,
});
const hughesTrigg = inductee({
  wing: "fight",
  displayName: "Matt Hughes vs. Frank Trigg II",
  inducteeYear: 2015,
  sortOrder: 1,
  subtitle: "UFC 52",
  cornerAName: "Matt Hughes",
  cornerAHeadshot: UFC_HEADSHOT("HUGHES"),
  cornerAMeasuredUrl: UFC_HEADSHOT("HUGHES"),
  cornerACutout: true,
  cornerBName: "Frank Trigg",
  videoId: "E2fUq7gT8z4",
  videoStart: 6646,
});

describe("relief or frame (photoMode)", () => {
  const data = hall([royce, severn, forrest, griffinBonnar, hughesTrigg]);
  const cutouts = buildCutoutIndex(data);

  it("a measured cut-out goes in relief", () => {
    expect(photoMode(personPhotoUrl(royce), cutouts)).toBe("cut");
  });

  it("Dan Severn: ufc.com but WITH a background → frame (the mockup's mistake)", () => {
    expect(photoMode(personPhotoUrl(severn), cutouts)).toBe("framed");
  });

  it("Forrest Griffin: a local file, measured as a cut-out → relief (the other mistake)", () => {
    expect(personPhotoUrl(forrest)).toBe("/fighters/forrest-griffin.webp");
    expect(photoMode(personPhotoUrl(forrest), cutouts)).toBe("cut");
  });

  it("his fight corner paints the local override, not the measured B/W headshot, and still gets its verdict", () => {
    const painted = resolveHofPhotoUrl(griffinBonnar.cornerAName, griffinBonnar.cornerAHeadshot);
    expect(painted).toBe("/fighters/forrest-griffin.webp");
    expect(photoMode(painted, cutouts)).toBe("cut");
  });

  it("the painted photo is not the measured one → frame, even if the measured one was a cut-out", () => {
    const only = buildCutoutIndex(hall([griffinBonnar]));
    const painted = resolveHofPhotoUrl("Forrest Griffin", "https://ufc.com/bw-forrest.png");
    expect(only.get("https://ufc.com/bw-forrest.png")).toBe(true);
    expect(photoMode(painted, only)).toBe("framed");
  });

  it("Frank Trigg: a local fallback nobody measured → frame", () => {
    const painted = resolveHofPhotoUrl(hughesTrigg.cornerBName, hughesTrigg.cornerBHeadshot);
    expect(painted).toBe("/fighters/frank-trigg.webp");
    expect(photoMode(painted, cutouts)).toBe("framed");
  });

  it("no photo at all (the silhouette) → frame", () => {
    const pete = resolveHofPhotoUrl("Pete Williams", null);
    expect(pete).toBeNull();
    expect(photoMode(pete, cutouts)).toBe("framed");
  });

  it("without the photo_cutout table (migration 031 pending) everything is framed", () => {
    const before = hall(
      [royce, forrest, griffinBonnar].map((i) => ({
        ...i,
        photoMeasuredUrl: null,
        photoIsCutout: null,
        cornerAMeasuredUrl: null,
        cornerACutout: null,
        cornerBMeasuredUrl: null,
        cornerBCutout: null,
      })),
    );
    const none = buildCutoutIndex(before);
    expect(none.size).toBe(0);
    expect(photoMode(personPhotoUrl(royce), none)).toBe("framed");
    expect(photoMode("/fighters/forrest-griffin.webp", none)).toBe("framed");
  });

  it("the match is on the EXACT stored string ('&amp;' included)", () => {
    const url = UFC_HEADSHOT("ROYCE");
    expect(url).toContain("&amp;");
    expect(photoMode(url, cutouts)).toBe("cut");
    expect(photoMode(url.replace("&amp;", "&"), cutouts)).toBe("framed");
  });

  it("a contributor's curated photo_url wins over the (empty) fighter headshot", () => {
    const frye = inductee({ displayName: "Don Frye", photoUrl: FRYE_PORTRAIT, photoFocus: "50% 28%" });
    expect(personPhotoUrl(frye)).toBe(FRYE_PORTRAIT);
  });
});

describe("the face in a 16:9 portrait (parsePhotoFocus)", () => {
  it("x% y% → that point, with the default zoom", () => {
    expect(parsePhotoFocus("68% 22%")).toEqual({ position: "68% 22%", zoom: FRAME_ZOOM });
    expect(FRAME_ZOOM).toBeCloseTo(1.7);
  });

  it("an explicit zoom is taken within 1-3", () => {
    expect(parsePhotoFocus("50% 30% 1.4")).toEqual({ position: "50% 30%", zoom: 1.4 });
    expect(parsePhotoFocus("50% 30% 4")).toBeNull();
  });

  it("anything that is not two percentages is ignored (it ends in an inline style)", () => {
    for (const bad of [null, "", "center", "50%", "120% 10%", "50% 20%; color:red", "50px 20px"]) {
      expect(parsePhotoFocus(bad)).toBeNull();
    }
  });
});

describe("the order by class", () => {
  it("newest class first, then the seed's order inside it", () => {
    const rows = [
      inductee({ displayName: "Royce Gracie", inducteeYear: 2003, sortOrder: 0 }),
      inductee({ displayName: "Ken Shamrock", inducteeYear: 2003, sortOrder: 1 }),
      inductee({ displayName: "Mark Kerr", inducteeYear: 2025, sortOrder: 21 }),
      inductee({ displayName: "Vitor Belfort", inducteeYear: 2025, sortOrder: 20 }),
      inductee({ displayName: "Dan Severn", inducteeYear: 2005, sortOrder: 2 }),
      inductee({ displayName: "Sin año", inducteeYear: null, sortOrder: -1 }),
    ];
    expect(orderByClass(rows).map((r) => r.displayName)).toEqual([
      "Vitor Belfort",
      "Mark Kerr",
      "Dan Severn",
      "Royce Gracie",
      "Ken Shamrock",
      "Sin año",
    ]);
  });

  it("does not touch its input", () => {
    const rows = [inductee({ inducteeYear: 2003 }), inductee({ inducteeYear: 2026 })];
    orderByClass(rows);
    expect(rows[0].inducteeYear).toBe(2003);
  });

  it("compareByClass is a proper comparator (antisymmetric)", () => {
    const a = inductee({ inducteeYear: 2026, sortOrder: 3 });
    const b = inductee({ inducteeYear: 2026, sortOrder: 5 });
    expect(Math.sign(compareByClass(a, b))).toBe(-Math.sign(compareByClass(b, a)));
  });

  it("latestClass: the newest year across all wings, people first and the fight last", () => {
    const data = hall([
      inductee({ wing: "fight", displayName: "Zhang vs. Jędrzejczyk", inducteeYear: 2026, sortOrder: 10 }),
      inductee({ wing: "contributor", displayName: "Thomas Gerbasi", inducteeYear: 2026, sortOrder: 8 }),
      inductee({ wing: "modern", displayName: "Chris Weidman", inducteeYear: 2026, sortOrder: 18 }),
      inductee({ wing: "modern", displayName: "Dominick Cruz", inducteeYear: 2026, sortOrder: 16 }),
      inductee({ wing: "modern", displayName: "Robbie Lawler", inducteeYear: 2025, sortOrder: 14 }),
      inductee({ wing: "pioneer", displayName: "Royce Gracie", inducteeYear: 2003, sortOrder: 0 }),
    ]);
    const latest = latestClass(data);
    expect(latest?.year).toBe(2026);
    expect(latest?.items.map((i) => i.displayName)).toEqual([
      "Dominick Cruz",
      "Chris Weidman",
      "Thomas Gerbasi",
      "Zhang vs. Jędrzejczyk",
    ]);
  });

  it("latestClass: nothing without years", () => {
    expect(latestClass(hall([]))).toBeNull();
    expect(latestClass(hall([inductee({ inducteeYear: null })]))).toBeNull();
  });
});

describe("the fight's video (fightClip)", () => {
  it("a stored, valid id with its start", () => {
    expect(fightClip(hughesTrigg)).toEqual({ videoId: "E2fUq7gT8z4", start: 6646, end: null });
  });

  it("no video, a broken id, or not a fight → null (the YouTube search stays)", () => {
    expect(fightClip(griffinBonnar)).toBeNull();
    expect(fightClip({ ...hughesTrigg, videoId: "nope" })).toBeNull();
    expect(fightClip({ ...hughesTrigg, wing: "modern" })).toBeNull();
  });

  it("a bad range is dropped, the video stays", () => {
    expect(fightClip({ ...hughesTrigg, videoStart: 3909, videoEnd: 3016 })).toEqual({
      videoId: "E2fUq7gT8z4",
      start: 3909,
      end: null,
    });
  });
});
