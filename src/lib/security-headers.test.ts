import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  securityHeaders,
} from "./security-headers";

describe("securityHeaders", () => {
  const get = (key: string) =>
    securityHeaders.find((header) => header.key === key)?.value;

  it("incluye todas las cabeceras de seguridad esperadas", () => {
    const keys = securityHeaders.map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Content-Security-Policy",
      ]),
    );
  });

  it("usa los valores correctos en las cabeceras estáticas", () => {
    expect(get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });
});

describe("buildContentSecurityPolicy", () => {
  const csp = buildContentSecurityPolicy();

  it("contiene las directivas clave de bloqueo", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("connect-src 'self'");
  });

  it("permite imágenes de CDNs externos por https y data:", () => {
    expect(csp).toContain("img-src 'self' data: https:");
  });

  it("permite los reproductores de YouTube en frame-src", () => {
    expect(csp).toContain("frame-src https://www.youtube.com");
    expect(csp).toContain("https://www.youtube-nocookie.com");
  });

  it("permite scripts y estilos inline que la app necesita", () => {
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("separa las directivas con '; '", () => {
    expect(csp.split("; ").length).toBeGreaterThan(1);
  });
});

describe("buildSecurityHeaders (dev vs prod)", () => {
  const cspOf = (isDev: boolean) =>
    buildSecurityHeaders(isDev).find((h) => h.key === "Content-Security-Policy")!
      .value;

  it("en producción NO incluye 'unsafe-eval' ni ws: (CSP estricta)", () => {
    const csp = cspOf(false);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("ws:");
  });

  it("en desarrollo añade 'unsafe-eval' y ws: para el HMR", () => {
    const csp = cspOf(true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
  });
});
