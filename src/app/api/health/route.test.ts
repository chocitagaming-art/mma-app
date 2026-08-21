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

// El chequeo profundo (?deep=1) es el único que puede tocar Neon. El superficial
// tiene que ser gratis: si volviera a consultar la BD, el monitor la despertaría
// en cada sonda y se repetiría el apagón de cuota del 18-ago-2026.
const peticion = (url: string) => new Request(url);

describe("GET /api/health?deep=1", () => {
  it("responde 200 con ok:true cuando la BD contesta", async () => {
    sqlMock.mockResolvedValueOnce([{ "?column?": 1 }]);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567890");

    const response = await GET(peticion("https://mmastatus.app/api/health?deep=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.db).toBe("up");
    expect(body.version).toBe("abcdef1");
    expect(sqlMock).toHaveBeenCalledWith("select 1");
  });

  it("responde 503 con ok:false cuando la BD falla", async () => {
    sqlMock.mockRejectedValueOnce(new Error("connection refused"));

    const response = await GET(peticion("https://mmastatus.app/api/health?deep=1"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.db).toBe("down");
  });

  it("usa 'dev' como versión fuera de Vercel", async () => {
    sqlMock.mockResolvedValueOnce([]);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);

    const body = await (
      await GET(peticion("https://mmastatus.app/api/health?deep=1"))
    ).json();
    expect(body.version).toBe("dev");
  });
});

describe("GET /api/health (superficial)", () => {
  it("responde 200 SIN tocar la base de datos", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567890");

    const response = await GET(peticion("https://mmastatus.app/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    // "skipped" y no "up": este 200 no afirma nada sobre Neon.
    expect(body.db).toBe("skipped");
    expect(body.version).toBe("abcdef1");
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("tampoco toca la BD con deep distinto de 1", async () => {
    const response = await GET(peticion("https://mmastatus.app/api/health?deep=0"));

    expect(response.status).toBe(200);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
