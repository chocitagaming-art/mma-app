import { expect, type Page } from "@playwright/test";

// Mide el ancho del documento, o devuelve null si en ese instante no se puede
// medir porque el documento se está reemplazando.
//
// Esto NO es defensa preventiva: es un fallo real y medido. Una ruta que redirige
// desde el cliente (`permanentRedirect` en un Server Component) no devuelve un 308
// HTTP: Next sirve el documento COMPLETO con un 200 y mete la orden de redirigir
// en el payload de React, así que el evento `load` dispara sobre una página que
// está a punto de sustituirse a sí misma. Entre el `load` y la navegación real hay
// una ventana de milisegundos, y quien caiga dentro se encuentra `documentElement`
// a null o el contexto de ejecución destruido.
async function measureDocumentWidth(
  page: Page,
): Promise<{ scrollWidth: number; clientWidth: number } | null> {
  try {
    return await page.evaluate(() => {
      const el = document.documentElement;
      return el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null;
    });
  } catch {
    // "Execution context was destroyed": navegación en curso. Se reintenta.
    return null;
  }
}

// Asserto DURO: la página no desborda horizontalmente (el bug responsive nº1).
// +1px de tolerancia por redondeo de subpíxel.
//
// Reintenta la medición hasta 5 s porque los asertos de Playwright solo reintentan
// solos sobre locators, nunca sobre un número devuelto por `evaluate`. Sin esto,
// un test podía salir en rojo por una carrera de navegación y no por un bug de
// maquetación, que es justo el fallo que hacía inestable a /compare.
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  let measured = await measureDocumentWidth(page);
  while (measured === null && Date.now() < deadline) {
    await page.waitForTimeout(100);
    measured = await measureDocumentWidth(page);
  }

  expect(
    measured,
    `no se pudo medir el ancho en ${label}: el documento seguía reemplazándose tras 5 s`,
  ).not.toBeNull();

  const { scrollWidth, clientWidth } = measured!;
  expect(
    scrollWidth,
    `Desbordamiento horizontal en ${label}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth + 1);
}

export type ObservadorCsp = {
  // Array VIVO: se llena según van llegando los mensajes de consola.
  readonly violaciones: string[];
  // Falla si hubo alguna, y enseña el texto exacto del navegador.
  expectCero(contexto: string): void;
};

// Escucha las violaciones de Content-Security-Policy que el navegador escupe por
// consola. Hay que llamarlo ANTES de navegar: lo que pase antes de suscribirse no
// se ve.
//
// Vivía suelto dentro de un test de seo.spec.ts. Se saca aquí porque la fase 7
// necesita vigilar lo mismo en sitios donde aquel test no llega: la analítica es
// JavaScript de verdad, y un script bloqueado no cambia el código de estado, ni
// dispara el error boundary, ni desborda — o sea, las 6 puertas del megatest
// saldrían verdes con la analítica muerta.
//
// No hay `report-uri` en la política, así que la consola es el único canal.
export function observarViolacionesCsp(page: Page): ObservadorCsp {
  const violaciones: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) {
      violaciones.push(msg.text());
    }
  });
  return {
    violaciones,
    expectCero(contexto: string) {
      expect(violaciones, `violaciones de CSP en ${contexto}:\n${violaciones.join("\n")}`).toHaveLength(
        0,
      );
    },
  };
}

// Corta todo lo que no sea nuestro origen. Sin esto, un test que mire la CSP
// depende de a.espncdn.com, ufc.com o ytimg: son 11 peticiones ajenas solo en
// /eventos/357. Las imágenes no ejecutan scripts, así que no se pierde señal, y
// un bloqueo de CSP se registra igual porque ocurre ANTES de salir a la red.
export async function aislarDeTerceros(page: Page, baseURL: string | undefined): Promise<void> {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    return url.startsWith(baseURL ?? "http://127.0.0.1") ? route.continue() : route.abort();
  });
}

export type HeadshotReport = {
  photos: number; // "Foto de …" con naturalWidth>0 (resuelve de verdad)
  silhouettes: number; // silueta oficial (WARNING, intencional)
  brokenExternal: number; // "Foto de …" que NO cargó (probable red externa)
};

// Cuenta headshots/cuerpos por su alt-text (no hay data-testid en el producto).
// NO asserta: una silueta es intencional y una foto externa que no carga suele
// ser flakiness de red, no una regresión. Se devuelve como INFO/WARNING.
export async function collectHeadshots(page: Page): Promise<HeadshotReport> {
  return page.evaluate(async () => {
    const imgs = Array.from(document.images).filter((img) =>
      /^(Foto|Silueta) de /.test(img.alt),
    );
    // Espera (acotada) a que las imágenes remotas terminen de cargar.
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              const done = () => resolve();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
              setTimeout(done, 5000);
            }),
      ),
    );
    let photos = 0;
    let silhouettes = 0;
    let brokenExternal = 0;
    for (const img of imgs) {
      const isSilhouette =
        img.src.includes("silhouette") || /^Silueta de /.test(img.alt);
      if (isSilhouette) {
        silhouettes += 1;
      } else if (img.naturalWidth > 0) {
        photos += 1;
      } else {
        brokenExternal += 1;
      }
    }
    return { photos, silhouettes, brokenExternal };
  });
}
