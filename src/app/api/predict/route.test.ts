import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: the mock is declared before the hoisted vi.mock captures it.
const { explanationMock } = vi.hoisted(() => ({ explanationMock: vi.fn() }));

// The AI explanation is not what these tests are about, and it must never reach
// Anthropic from a unit test.
vi.mock("@/lib/prediction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/prediction")>()),
  generatePredictionExplanation: explanationMock,
}));

import contract from "@/lib/__fixtures__/predict-response.json";
import { _resetRateLimitStore } from "@/lib/maestro/security";

import { POST } from "./route";

// The microservice (Render) is mocked: these tests never touch the network.
const fetchMock = vi.fn();

// One IP per request so the in-memory rate limiter (5 per 10 s) never trips.
let ipCounter = 0;
function makeRequest(body: unknown): Request {
  ipCounter += 1;
  return new Request("http://localhost:3000/api/predict", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Loopback origin: accepted outside production (NODE_ENV is "test").
      origin: "http://localhost:3000",
      "x-real-ip": `10.1.${Math.floor(ipCounter / 200)}.${ipCounter % 200}`,
    },
    body: JSON.stringify(body),
  });
}

// What the web sent to the service on its n-th call.
function serviceBody(call: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubEnv("PREDICTION_SERVICE_URL", "https://prediction.test");
  vi.stubEnv("PREDICTION_SERVICE_API_KEY", "");
  // Force the in-memory limiter even if the shell exports Upstash credentials.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubGlobal("fetch", fetchMock);
  // A fresh Response per call: a body can only be read once.
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify(contract), { status: 200 }),
  );
  explanationMock.mockResolvedValue({
    explanation: "Explicación de prueba.",
    explanationSource: "anthropic",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
  explanationMock.mockReset();
  _resetRateLimitStore();
});

// The prediction cache lives at module level and survives between tests, so
// every test uses its own pair of fighter ids.
describe("POST /api/predict — fightId", () => {
  it("without fightId the service gets exactly what it got before: red and blue", async () => {
    const response = await POST(makeRequest({ redFighterId: 101, blueFighterId: 102 }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(serviceBody(0)).toEqual({ red: 101, blue: 102 });
    expect(serviceBody(0)).not.toHaveProperty("fightId");
  });

  it("with fightId it forwards it to the service as fightId", async () => {
    const response = await POST(
      makeRequest({ redFighterId: 103, blueFighterId: 104, fightId: 555 }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(serviceBody(0)).toEqual({ red: 103, blue: 104, fightId: 555 });
  });

  // null is rejected on purpose: "no fight" is spelled by leaving the key out,
  // which is what /enfrentamiento does.
  it.each([
    ["zero", 0],
    ["negative", -3],
    ["a string", "555"],
    ["a float", 5.5],
    ["null", null],
  ])("rejects a fightId that is %s with 400, before calling the service", async (_case, fightId) => {
    const response = await POST(
      makeRequest({ redFighterId: 105, blueFighterId: 106, fightId }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a fight-anchored answer and a pair answer never share a cache entry", async () => {
    // The service answers something different for each request, so a shared
    // entry would show up as the wrong probability.
    const redProbabilityFor = (fightId: unknown) =>
      fightId === 700 ? 0.71 : fightId === 701 ? 0.72 : 0.6;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const { fightId } = JSON.parse(init.body as string) as { fightId?: number };
      const redProbability = redProbabilityFor(fightId);
      return new Response(
        JSON.stringify({ ...contract, redProbability, blueProbability: 1 - redProbability }),
        { status: 200 },
      );
    });

    const requests = [
      { redFighterId: 107, blueFighterId: 108 },
      { redFighterId: 107, blueFighterId: 108, fightId: 700 },
      { redFighterId: 107, blueFighterId: 108, fightId: 701 },
    ];

    for (const round of ["first", "repeated"]) {
      for (const body of requests) {
        const response = await POST(makeRequest(body));
        expect(response.status, `${round} ${JSON.stringify(body)}`).toBe(200);
        const payload = (await response.json()) as { redProbability: number };
        expect(payload.redProbability, `${round} ${JSON.stringify(body)}`).toBe(
          redProbabilityFor((body as { fightId?: number }).fightId),
        );
      }
    }

    // One service call per distinct entry; the repeated round is all cache hits.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((call) => serviceBody(call).fightId)).toEqual([
      undefined,
      700,
      701,
    ]);
  });
});
