import { afterEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: el mock se declara antes de que vi.mock (hoisted) lo capture.
const { sqlMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  sql: sqlMock,
}));

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  sqlMock.mockReset();
});

describe("GET /api/health", () => {
  it("responde 200 con ok:true cuando la BD contesta", async () => {
    sqlMock.mockResolvedValueOnce([{ "?column?": 1 }]);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567890");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.db).toBe("up");
    expect(body.version).toBe("abcdef1");
    expect(sqlMock).toHaveBeenCalledWith("select 1");
  });

  it("responde 503 con ok:false cuando la BD falla", async () => {
    sqlMock.mockRejectedValueOnce(new Error("connection refused"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.db).toBe("down");
  });

  it("usa 'dev' como versión fuera de Vercel", async () => {
    sqlMock.mockResolvedValueOnce([]);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);

    const body = await (await GET()).json();
    expect(body.version).toBe("dev");
  });
});
