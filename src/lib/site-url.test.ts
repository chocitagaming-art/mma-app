import { describe, expect, it } from "vitest";

import { FALLBACK_SITE_URL, normalizeSiteUrl } from "./site-url";

describe("normalizeSiteUrl", () => {
  it("usa el dominio de reserva cuando la variable no está definida", () => {
    expect(normalizeSiteUrl(undefined)).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl(null)).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl("")).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl("   ")).toBe(FALLBACK_SITE_URL);
  });

  it("respeta la variable cuando trae una dirección válida", () => {
    expect(normalizeSiteUrl("https://mmastatus.app")).toBe("https://mmastatus.app");
  });

  it("quita la barra final para que no salgan dobles barras al componer rutas", () => {
    expect(normalizeSiteUrl("https://mmastatus.app/")).toBe("https://mmastatus.app");
  });

  it("tolera espacios y BOM alrededor del valor", () => {
    // El BOM invisible (U+FEFF) es exactamente lo que tumbó el backup de la base
    // de datos la primera vez que se pegó un secreto desde Windows.
    expect(normalizeSiteUrl("  https://mmastatus.app  ")).toBe("https://mmastatus.app");
    expect(normalizeSiteUrl("﻿https://mmastatus.app")).toBe("https://mmastatus.app");
  });

  it("cae al dominio de reserva si el valor no es una URL absoluta", () => {
    expect(normalizeSiteUrl("mmastatus.app")).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl("/mmastatus")).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl("no es una url")).toBe(FALLBACK_SITE_URL);
  });

  it("rechaza protocolos que no sean http(s)", () => {
    expect(normalizeSiteUrl("javascript:alert(1)")).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl("ftp://mmastatus.app")).toBe(FALLBACK_SITE_URL);
  });

  it("se queda solo con el origen: un path suelto no contamina las rutas compuestas", () => {
    // Este sitio vive en la raíz del dominio. Normalizar al origen evita que un
    // valor pegado de más ("https://mmastatus.app/eventos") acabe generando
    // /eventos/eventos en el sitemap.
    expect(normalizeSiteUrl("https://mmastatus.app/eventos")).toBe("https://mmastatus.app");
  });

  it("el dominio de reserva no lleva barra final", () => {
    expect(FALLBACK_SITE_URL.endsWith("/")).toBe(false);
  });
});
