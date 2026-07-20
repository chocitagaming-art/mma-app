import { expect, test } from "@playwright/test";

// Un service worker no se puede probar con vitest (entorno node, sin DOM), así
// que este es el único sitio donde se verifica el comportamiento real.
//
// La suite corre 6 proyectos (3 viewports × 2 temas). El comportamiento del
// worker no depende ni del viewport ni del tema, así que se limita a UNO:
// multiplicarlo por 6 solo multiplicaría la inestabilidad.
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "El service worker se verifica en un unico proyecto",
  );
});

// El registrador solo actúa en producción (NODE_ENV). El webServer de Playwright
// hace `next build && next start`, así que aquí sí se registra.
async function esperarWorker(page: import("@playwright/test").Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
}

test.describe("PWA sin conexion", () => {
  test("con red sirve la pagina real, no la de sin conexion", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Sin conexión" }),
    ).toHaveCount(0);
  });

  test("sin red sirve /offline, y con estilos", async ({ page, context }) => {
    await page.goto("/");
    await esperarWorker(page);

    await context.setOffline(true);
    await page.goto("/luchadores").catch(() => {});

    const titulo = page.getByRole("heading", { name: "Sin conexión" });
    await expect(titulo).toBeVisible();

    // Autosuficiente: el <style> en línea tiene que haber aplicado aunque no
    // haya red para traer el CSS de /_next/static/. Si esto falla, el usuario
    // vería la pantalla sin formato justo cuando peor impresión da.
    const peso = await titulo.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(Number(peso)).toBeGreaterThanOrEqual(700);

    await context.setOffline(false);
  });

  test("la cache contiene SOLO /offline y estaticos con hash", async ({
    page,
  }) => {
    await page.goto("/");
    await esperarWorker(page);

    const rutas = await page.evaluate(async () => {
      const nombres = await caches.keys();
      const urls: string[] = [];
      for (const nombre of nombres) {
        const cache = await caches.open(nombre);
        for (const req of await cache.keys()) {
          urls.push(new URL(req.url).pathname);
        }
      }
      return urls;
    });

    expect(rutas.length).toBeGreaterThan(0);
    // Se afirma sobre el INVENTARIO COMPLETO, no sobre una ruta concreta: así
    // el test sigue protegiendo el principio rector aunque mañana alguien añada
    // una regla de caché nueva.
    for (const ruta of rutas) {
      const permitida = ruta === "/offline" || ruta.startsWith("/_next/static/");
      expect(permitida, `ruta inesperada en cache: ${ruta}`).toBe(true);
    }
  });

  test("/en-vivo no se sirve de cache", async ({ page, context }) => {
    await page.goto("/en-vivo");
    await esperarWorker(page);
    await page.goto("/");

    await context.setOffline(true);
    await page.goto("/en-vivo").catch(() => {});
    await expect(
      page.getByRole("heading", { name: "Sin conexión" }),
    ).toBeVisible();

    await context.setOffline(false);
  });

  test("sin soporte de service worker la web carga igual", async ({ page }) => {
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", {
        get: () => undefined,
      });
    });
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    expect(errores).toEqual([]);
  });
});
