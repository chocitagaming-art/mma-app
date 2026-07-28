import { describe, expect, it } from "vitest";

import { FALLBACK_SITE_URL, normalizeSiteUrl } from "./site-url";

describe("normalizeSiteUrl", () => {
  it("usa el dominio de reserva cuando la variable no está definida", () => {
    expect(normalizeSiteUrl(undefined)).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl(null)).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl("")).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl("   ")).toBe(FALLBACK_SITE_URL);
  });

  // Se usa a propósito un dominio DISTINTO del de reserva: si aquí pusiéramos el
  // mismo, estos tres casos pasarían aunque la función ignorase la variable por
  // completo y devolviera siempre el valor de reserva.
  const OTRO = "https://otro-dominio.example";

  it("respeta la variable cuando trae una dirección válida", () => {
    expect(normalizeSiteUrl(OTRO)).toBe(OTRO);
    expect(normalizeSiteUrl(OTRO)).not.toBe(FALLBACK_SITE_URL);
  });

  it("quita la barra final para que no salgan dobles barras al componer rutas", () => {
    expect(normalizeSiteUrl(`${OTRO}/`)).toBe(OTRO);
  });

  it("tolera espacios y BOM alrededor del valor", () => {
    // El BOM invisible (U+FEFF) es exactamente lo que tumbó el backup de la base
    // de datos la primera vez que se pegó un secreto desde Windows.
    expect(normalizeSiteUrl(`  ${OTRO}  `)).toBe(OTRO);
    expect(normalizeSiteUrl(`﻿${OTRO}`)).toBe(OTRO);
  });

  it("cae al dominio de reserva si el valor no es una URL absoluta", () => {
    expect(normalizeSiteUrl("mmastatus.app")).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl("/mmastatus")).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl("no es una url")).toBe(FALLBACK_SITE_URL);
  });

  it("rechaza protocolos que no sean http(s)", () => {
    expect(normalizeSiteUrl("javascript:alert(1)")).toBe(FALLBACK_SITE_URL);
    expect(normalizeSiteUrl(`ftp://${OTRO.replace("https://", "")}`)).toBe(FALLBACK_SITE_URL);
  });

  it("se queda solo con el origen: un path suelto no contamina las rutas compuestas", () => {
    // Este sitio vive en la raíz del dominio. Normalizar al origen evita que un
    // valor pegado de más ("https://ejemplo.com/eventos") acabe generando
    // /eventos/eventos en el sitemap.
    expect(normalizeSiteUrl(`${OTRO}/eventos`)).toBe(OTRO);
  });

  it("el dominio de reserva no lleva barra final", () => {
    expect(FALLBACK_SITE_URL.endsWith("/")).toBe(false);
  });
});
