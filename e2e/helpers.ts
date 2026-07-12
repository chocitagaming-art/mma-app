import { expect, type Page } from "@playwright/test";

// Asserto DURO: la página no desborda horizontalmente (el bug responsive nº1).
// +1px de tolerancia por redondeo de subpíxel.
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `Desbordamiento horizontal en ${label}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth + 1);
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
