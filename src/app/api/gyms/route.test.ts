import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: el mock se declara antes de que vi.mock (hoisted) lo capture.
const { getGymsNearbyMock } = vi.hoisted(() => ({
  getGymsNearbyMock: vi.fn(),
}));

// Neon mockeado: los tests no tocan BD real.
vi.mock("@/lib/queries/gyms", () => ({
  getGymsNearby: getGymsNearbyMock,
}));

import { _resetRateLimitStore } from "@/lib/maestro/security";

import { GET } from "./route";

const OK_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

// fetch global (Nominatim) mockeado: los tests no tocan red real.
const fetchMock = vi.fn();

// IP única por petición (salvo que el test fije una): así el rate-limit en
// memoria (fallback sin Upstash, mismo store que en rate-limit.test.ts) no
// interfiere entre tests.
let ipCounter = 0;
function makeRequest(params: Record<string, string>, ip?: string): Request {
  ipCounter += 1;
  const search = new URLSearchParams(params).toString();
  return new Request(`http://localhost/api/gyms${search ? `?${search}` : ""}`, {
    headers: { "x-real-ip": ip ?? `10.0.${Math.floor(ipCounter / 200)}.${ipCounter % 200}` },
  });
}

function nominatimResponse(results: { lat: string; lon: string }[]): Response {
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  getGymsNearbyMock.mockReset();
  _resetRateLimitStore();
});

describe("GET /api/gyms — validación de entrada (antes de cualquier trabajo)", () => {
  it("responde 400 con city demasiado corta", async () => {
    const response = await GET(makeRequest({ city: "a" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "bad_request" });
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getGymsNearbyMock).not.toHaveBeenCalled();
  });

  it("responde 400 con city demasiado larga (>100 tras trim)", async () => {
    const response = await GET(makeRequest({ city: "x".repeat(101) }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_request");
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 400 con city de solo espacios", async () => {
    const response = await GET(makeRequest({ city: "   " }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 400 con lat fuera de rango", async () => {
    const response = await GET(makeRequest({ lat: "90.5", lon: "0" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_request");
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(getGymsNearbyMock).not.toHaveBeenCalled();
  });

  it("responde 400 con lon fuera de rango", async () => {
    const response = await GET(makeRequest({ lat: "40", lon: "-180.01" }));

    expect(response.status).toBe(400);
    expect(getGymsNearbyMock).not.toHaveBeenCalled();
  });

  it("responde 400 con coordenadas no numéricas", async () => {
    const response = await GET(makeRequest({ lat: "abc", lon: "1" }));

    expect(response.status).toBe(400);
    expect(getGymsNearbyMock).not.toHaveBeenCalled();
  });

  it("responde 400 sin parámetros", async () => {
    const response = await GET(makeRequest({}));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_request");
  });
});

describe("GET /api/gyms — rate-limit por IP", () => {
  it("responde 429 con Retry-After al agotar la ráfaga (5/10s)", async () => {
    getGymsNearbyMock.mockResolvedValue([]);
    const ip = "203.0.113.7";

    for (let i = 0; i < 5; i += 1) {
      const ok = await GET(makeRequest({ lat: "40.4", lon: "-3.7" }, ip));
      expect(ok.status).toBe(200);
    }

    const blocked = await GET(makeRequest({ lat: "40.4", lon: "-3.7" }, ip));
    const body = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(body.error).toBe(
      "Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo.",
    );
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect(blocked.headers.get("Cache-Control")).toBeNull();
    // La 6ª petición no llegó a la BD.
    expect(getGymsNearbyMock).toHaveBeenCalledTimes(5);
  });

  it("no penaliza a IPs distintas", async () => {
    getGymsNearbyMock.mockResolvedValue([]);

    const a = await GET(makeRequest({ lat: "40.4", lon: "-3.7" }, "198.51.100.1"));
    const b = await GET(makeRequest({ lat: "40.4", lon: "-3.7" }, "198.51.100.2"));

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });
});

describe("GET /api/gyms — camino feliz", () => {
  it("responde 200 con Cache-Control por coordenadas, sin geocodificar", async () => {
    const gyms = [{ id: "node/1", name: "Fight Club Test" }];
    getGymsNearbyMock.mockResolvedValueOnce(gyms);

    const response = await GET(makeRequest({ lat: "40.4168", lon: "-3.7038" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ center: [40.4168, -3.7038], gyms });
    expect(response.headers.get("Cache-Control")).toBe(OK_CACHE_CONTROL);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getGymsNearbyMock).toHaveBeenCalledWith(40.4168, -3.7038);
  });

  it("responde 200 por ciudad y normaliza la clave de geocoding (trim + minúsculas)", async () => {
    fetchMock.mockResolvedValueOnce(
      nominatimResponse([{ lat: "40.4168", lon: "-3.7038" }]),
    );
    getGymsNearbyMock.mockResolvedValueOnce([]);

    const response = await GET(makeRequest({ city: "  Madrid  " }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.center).toEqual([40.4168, -3.7038]);
    expect(response.headers.get("Cache-Control")).toBe(OK_CACHE_CONTROL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("q=madrid");
    expect(url).not.toContain("Madrid");
  });

  it("responde 404 city_not_found sin Cache-Control si Nominatim no encuentra la ciudad", async () => {
    fetchMock.mockResolvedValueOnce(nominatimResponse([]));

    const response = await GET(makeRequest({ city: "villaquenoexiste" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "city_not_found" });
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(getGymsNearbyMock).not.toHaveBeenCalled();
  });

  it("responde 502 sin Cache-Control si la BD falla", async () => {
    getGymsNearbyMock.mockRejectedValueOnce(new Error("neon down"));

    const response = await GET(makeRequest({ lat: "40.4", lon: "-3.7" }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "upstream" });
    expect(response.headers.get("Cache-Control")).toBeNull();
  });
});
