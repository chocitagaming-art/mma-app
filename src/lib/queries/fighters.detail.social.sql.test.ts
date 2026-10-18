import { beforeEach, describe, expect, it, vi } from "vitest";

// R6 — getFighterDetail carries the fighter's Instagram and X to the page.
//
// The mapper (fighters.mappers.social.test.ts) and the component
// (fighter-social-links.test.ts) are pinned on their own; this pins the JOIN
// between them: the row that comes out of `fighters` reaches
// `detail.socialProfiles`. Pass `mapSocialProfiles({})` in fighters.detail.ts,
// or drop `f.*` from the query, and this goes red.
//
// Same technique as espn-history.sql.test.ts: `sql()` answers by the TEXT of
// the query.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import { getFighterDetail } from "@/lib/queries/fighters";

const sqlMock = vi.mocked(sql);

type Row = Record<string, unknown>;

const VOLKANOVSKI = 7029;
const CHOVANCEK = 6782;
const PEREZ = 4361;

// What the database had on 18-oct-2026 (read-only query), plus the bare
// minimum for the page's first query.
const FIGHTERS: Record<number, Row> = {
  [VOLKANOVSKI]: {
    id: VOLKANOVSKI,
    name: "Alexander Volkanovski",
    wins: 27,
    losses: 4,
    draws: 0,
    ufc_fight_count: "17",
    instagram_url: "https://www.instagram.com/alexvolkanovski/",
    x_url: "https://x.com/alexvolkanovski",
  },
  [CHOVANCEK]: {
    id: CHOVANCEK,
    name: "Cody Chovancek",
    wins: 1,
    losses: 0,
    draws: 0,
    ufc_fight_count: "1",
    instagram_url: "https://www.instagram.com/chovancekmma/",
    x_url: null,
  },
  [PEREZ]: {
    id: PEREZ,
    name: "Cristian Perez",
    wins: 1,
    losses: 0,
    draws: 0,
    ufc_fight_count: "0",
    instagram_url: null,
    x_url: null,
  },
};

const isFighterQuery = (query: string) => /from fighters f\s+where f\.id = \$1/.test(query);

beforeEach(() => {
  sqlMock.mockReset();
  sqlMock.mockImplementation(((query: string, params?: unknown[]) => {
    if (isFighterQuery(query)) {
      const row = FIGHTERS[Number(params?.[0])];
      return Promise.resolve(row ? [row] : []);
    }
    // Stats, history, news, rankings: nothing that matters here.
    return Promise.resolve([]);
  }) as never);
});

describe("getFighterDetail → socialProfiles", () => {
  it("the fighter query brings every column of `fighters` (f.*), the new ones included", async () => {
    await getFighterDetail(VOLKANOVSKI);
    const query = sqlMock.mock.calls.map(([text]) => String(text)).find(isFighterQuery);
    expect(query, "getFighterDetail no longer reads `fighters f where f.id = $1`").toBeDefined();
    expect(query).toMatch(/\bf\.\*/);
  });

  it("Volkanovski (7029): Instagram and X", async () => {
    const detail = await getFighterDetail(VOLKANOVSKI);
    expect(detail?.socialProfiles).toEqual({
      instagramUrl: "https://www.instagram.com/alexvolkanovski/",
      xUrl: "https://x.com/alexvolkanovski",
    });
  });

  it("Chovancek (6782): only Instagram", async () => {
    const detail = await getFighterDetail(CHOVANCEK);
    expect(detail?.socialProfiles).toEqual({
      instagramUrl: "https://www.instagram.com/chovancekmma/",
      xUrl: null,
    });
  });

  it("Cristian Perez (4361): none", async () => {
    const detail = await getFighterDetail(PEREZ);
    expect(detail?.socialProfiles).toEqual({ instagramUrl: null, xUrl: null });
  });
});
