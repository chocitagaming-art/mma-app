import { describe, expect, it } from "vitest";

import {
  clientIpFromHeaders,
  isAllowedOrigin,
  rateLimit,
  sweepRateLimitStore,
} from "./request-security";

describe("isAllowedOrigin", () => {
  it("acepta el propio host (Origin coincide)", () => {
    expect(isAllowedOrigin("https://mma-status.app", "mma-status.app")).toBe(true);
  });

  it("acepta un Referer (con path) del propio host", () => {
    expect(isAllowedOrigin("https://mma-status.app/predict", "mma-status.app")).toBe(true);
  });

  it("acepta localhost en desarrollo aunque el host difiera", () => {
    expect(isAllowedOrigin("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000", "localhost:3000")).toBe(true);
  });

  it("rechaza un origen ajeno", () => {
    expect(isAllowedOrigin("https://evil.com", "mma-status.app")).toBe(false);
  });

  it("rechaza un origen ausente", () => {
    expect(isAllowedOrigin(null, "mma-status.app")).toBe(false);
    expect(isAllowedOrigin(undefined, "mma-status.app")).toBe(false);
    expect(isAllowedOrigin("", "mma-status.app")).toBe(false);
  });

  it("rechaza un origen no parseable", () => {
    expect(isAllowedOrigin("not-a-url", "mma-status.app")).toBe(false);
  });

  it("rechaza loopback cuando allowLoopback=false (producción)", () => {
    expect(isAllowedOrigin("http://localhost:3000", "mma-status.app", false)).toBe(false);
    // El propio host sí se sigue aceptando en producción.
    expect(isAllowedOrigin("https://mma-status.app", "mma-status.app", false)).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("prioriza x-real-ip (fuente de confianza en Vercel)", () => {
    const headers = new Headers({
      "x-real-ip": "9.9.9.9",
      // Aunque el cliente forje x-forwarded-for, x-real-ip manda.
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    });
    expect(clientIpFromHeaders(headers)).toBe("9.9.9.9");
  });

  it("usa el ÚLTIMO salto de x-forwarded-for (no el primero, que es forjable)", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIpFromHeaders(headers)).toBe("5.6.7.8");
  });

  it("ignora IPs forjadas antepuestas por el cliente", () => {
    const headers = new Headers({ "x-forwarded-for": "fake-spoofed, 203.0.113.7" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });

  it("devuelve 'unknown' si no hay cabeceras de IP", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("rateLimit", () => {
  it("permite peticiones por debajo del límite de ráfaga", () => {
    const store = new Map<string, number[]>();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("ip", now + i * 100, store).allowed).toBe(true);
    }
  });

  it("bloquea al exceder la ráfaga (5 / 10s) y da Retry-After", () => {
    const store = new Map<string, number[]>();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit("ip", now + i * 100, store);

    const blocked = rateLimit("ip", now + 500, store);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(10);
  });

  it("se recupera tras pasar la ventana", () => {
    const store = new Map<string, number[]>();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit("ip", now + i * 100, store);
    expect(rateLimit("ip", now + 500, store).allowed).toBe(false);

    // Pasados >10s desde las primeras, la ráfaga se libera.
    expect(rateLimit("ip", now + 11_000, store).allowed).toBe(true);
  });

  it("aplica la cuota sostenida (20 / 60s) evitando la ráfaga", () => {
    const store = new Map<string, number[]>();
    const base = 1_000_000;
    // 20 peticiones espaciadas 3s (0..57s): nunca >5 en 10s, pero llenan la
    // cuota de 60s. La 21ª se dispara a 58s, con la primera (t=0) aún en ventana.
    for (let i = 0; i < 20; i++) {
      expect(rateLimit("ip", base + i * 3_000, store).allowed).toBe(true);
    }
    expect(rateLimit("ip", base + 58_000, store).allowed).toBe(false);
  });

  it("aísla las claves entre sí", () => {
    const store = new Map<string, number[]>();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit("ip-a", now + i * 100, store);
    expect(rateLimit("ip-a", now + 500, store).allowed).toBe(false);
    expect(rateLimit("ip-b", now + 500, store).allowed).toBe(true);
  });
});

describe("sweepRateLimitStore", () => {
  it("elimina claves cuya ventana ya expiró y conserva las vivas", () => {
    const store = new Map<string, number[]>();
    const now = 1_000_000;
    rateLimit("vieja", now, store);
    rateLimit("nueva", now, store);
    // Mucho después (>60s): la 'vieja' expira; 'nueva' tiene actividad reciente.
    const later = now + 120_000;
    rateLimit("nueva", later, store);
    sweepRateLimitStore(later, store);
    expect(store.has("vieja")).toBe(false);
    expect(store.has("nueva")).toBe(true);
  });
});
