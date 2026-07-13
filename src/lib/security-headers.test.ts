import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  securityHeaders,
} from "./security-headers";

// Extrae las fuentes de una directiva concreta de la CSP serializada.
const directiveSources = (csp: string, directive: string): string => {
  const found = csp
    .split("; ")
    .find((part) => part === directive || part.startsWith(`${directive} `));
  return found ?? "";
};

describe("securityHeaders (estáticas, next.config)", () => {
  const get = (key: string) =>
    securityHeaders.find((header) => header.key === key)?.value;

  it("incluye las cabeceras estáticas esperadas", () => {
    const keys = securityHeaders.map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
  });

  it("NO incluye la CSP (la emite el proxy con nonce por petición)", () => {
    const keys = securityHeaders.map((header) => header.key);
    expect(keys).not.toContain("Content-Security-Policy");
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
  const csp = buildContentSecurityPolicy({ nonce: "TESTNONCE123" });

  it("contiene las directivas clave de bloqueo", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
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

  it("endurece script-src con nonce + strict-dynamic y SIN 'unsafe-inline'", () => {
    const scriptSrc = directiveSources(csp, "script-src");
    expect(scriptSrc).toContain("'nonce-TESTNONCE123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("mantiene style-src con 'unsafe-inline' (Tailwind/recharts usan style inline)", () => {
    const styleSrc = directiveSources(csp, "style-src");
    expect(styleSrc).toBe("style-src 'self' 'unsafe-inline'");
  });

  it("separa las directivas con '; '", () => {
    expect(csp.split("; ").length).toBeGreaterThan(1);
  });
});

describe("buildContentSecurityPolicy (dev vs prod)", () => {
  it("en producción NO incluye 'unsafe-eval' ni ws: (CSP estricta)", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDev: false });
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("ws:");
  });

  it("en desarrollo añade 'unsafe-eval' y ws: para el HMR", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDev: true });
    expect(directiveSources(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directiveSources(csp, "connect-src")).toContain("ws:");
  });
});
