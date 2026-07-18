import { afterEach, describe, expect, it } from "vitest";

import { _resetRateLimitStore } from "@/lib/maestro/security";
import { checkRateLimit, combineLimitResults } from "@/lib/rate-limit";

describe("combineLimitResults", () => {
  const NOW = 1_000_000;

  it("permite si todos los limitadores tienen success", () => {
    expect(
      combineLimitResults(
        [
          { success: true, reset: 0 },
          { success: true, reset: 0 },
        ],
        NOW,
      ),
    ).toEqual({ allowed: true, retryAfter: 0 });
  });

  it("bloquea si alguno falla y calcula retryAfter en segundos (redondeo arriba)", () => {
    const r = combineLimitResults(
      [
        { success: false, reset: NOW + 3200 },
        { success: true, reset: 0 },
      ],
      NOW,
    );
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBe(4); // ceil(3.2s)
  });

  it("usa el mayor reset entre los limitadores que fallan", () => {
    const r = combineLimitResults(
      [
        { success: false, reset: NOW + 1000 },
        { success: false, reset: NOW + 9000 },
      ],
      NOW,
    );
    expect(r.retryAfter).toBe(9);
  });

  it("retryAfter mínimo 1s aunque el reset ya haya pasado", () => {
    const r = combineLimitResults([{ success: false, reset: NOW - 5000 }], NOW);
    expect(r.retryAfter).toBe(1);
  });
});

describe("checkRateLimit — fallback en memoria (sin Upstash configurado)", () => {
  afterEach(() => _resetRateLimitStore());

  it("permite las primeras 5 y bloquea la 6ª ráfaga (regla 5/10s)", async () => {
    const key = "test:fallback";
    for (let i = 0; i < 5; i++) {
      expect((await checkRateLimit(key)).allowed).toBe(true);
    }
    const sixth = await checkRateLimit(key);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("claves distintas no se interfieren", async () => {
    expect((await checkRateLimit("test:a")).allowed).toBe(true);
    expect((await checkRateLimit("test:b")).allowed).toBe(true);
  });
});
