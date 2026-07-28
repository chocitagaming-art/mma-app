// Fuente única de la dirección pública del sitio. Antes vivía escrita a mano en
// tres sitios (sitemap.ts, robots.ts y el metadataBase de layout.tsx), y bastaba
// con olvidar uno para que Google viera dos webs distintas compitiendo.
//
// Se lee de SITE_URL, a propósito SIN el prefijo NEXT_PUBLIC_. La documentación
// de esta versión de Next es explícita: las variables con ese prefijo se
// sustituyen por su valor literal durante `next build` y "after being built,
// your app will no longer respond to changes to these environment variables".
// Los tres consumidores son código exclusivamente de servidor, así que sin
// prefijo el valor se lee al arrancar y cambiar de dominio no obliga a
// reconstruir el bundle: basta con cambiar la variable en Vercel.
//
// Si algún día hiciera falta la dirección en el navegador, se añade ADEMÁS una
// NEXT_PUBLIC_ solo para ese uso; no se convierte esta.

// Dominio de reserva. Es la ÚNICA línea del código de src donde aparece una
// dirección literal. Desde el 28-jul-2026 es el dominio propio y no el de
// Vercel: si alguien borra SITE_URL por error, el sitemap y las canónicas siguen
// siendo correctos en vez de mandar a Google al dominio antiguo.
const FALLBACK_SITE_URL = "https://mmastatus.app";

/**
 * Deja el valor en forma canónica: sin espacios, sin BOM y sin barra final.
 * Si no es una URL absoluta http(s), devuelve el dominio de reserva en vez de
 * romper el arranque — un sitemap con el dominio viejo es malo, pero una web
 * que no levanta es peor.
 *
 * El BOM no es paranoia: la única vez que ha fallado el backup de la base de
 * datos fue por un U+FEFF invisible pegado al principio de un secreto copiado
 * desde Windows, y esta variable se va a pegar exactamente igual.
 */
export function normalizeSiteUrl(value: string | undefined | null): string {
  const raw = (value ?? "").replace(/^﻿/, "").trim();
  if (!raw) return FALLBACK_SITE_URL;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return FALLBACK_SITE_URL;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return FALLBACK_SITE_URL;
  }

  return parsed.origin;
}

/** Dirección pública del sitio, sin barra final. Ej.: `https://ejemplo.com`. */
export const SITE_URL = normalizeSiteUrl(process.env.SITE_URL);

export { FALLBACK_SITE_URL };
