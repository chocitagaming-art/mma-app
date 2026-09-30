import { expect, test } from "@playwright/test";

import { fakeYouTubeEmbeds } from "./helpers";

// ── UFC TV en la portada ────────────────────────────────────────────────────
//
// El reproductor siempre encendido bajo el hero del próximo evento. Aquí se
// prueba el BUCLE, que es lo que se ve casi todos los días: el webServer de
// playwright.config.ts arranca con UFC_TV_FIXTURE=loop, así que la portada
// recibe un bucle enlatado de peleas reales sin tocar YouTube, y el test no
// depende de lo que emita la UFC hoy.
//
// Lo que NO se prueba aquí, y dónde está:
//   · qué directo es evento, peleas o nada, el barajado y la columna 'off':
//     src/lib/ufc-tv.test.ts, con los datos reales del 28-sep-2026;
//   · que los dos reproductores lleven autoplay/mute/playsinline en el fuente:
//     src/lib/live-embed-callsites.test.ts.
// Esto es la otra mitad: que la portada SERVIDA de verdad pinte el bloque y que
// el src que llega al navegador lleve lo mismo.
//
// Since the turn manager (components/playback) the iframe is NOT in the page
// from the start: UFC TV shows its poster (▶) and the iframe is mounted only
// while more than half of it is in view below the sticky header, for 400 ms,
// and nobody else plays. Before it, UFC TV played muted below the fold, which
// YouTube's policies forbid. So: poster first, then scroll, then the iframe.
//
// ⚠️ Y NADA de `test.only`: con CI=true, `forbidOnly` tumba la recolección.

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "el src del reproductor no depende del viewport ni del tema: basta un proyecto",
  );
});

test("la portada pinta UFC TV en bucle, arrancando solo, mudo y en línea al llegar a él", async ({ page }) => {
  // Con un server externo el entorno no es nuestro: sin UFC_TV_FIXTURE la
  // portada enseña lo que haya de verdad en YouTube, que cambia cada día.
  // An external server started with UFC_TV_FIXTURE=loop can be declared by
  // exporting the same variable to Playwright (as the shorts' e2e runs do on
  // port 3200); the data-ufc-tv="loop" check below still catches a lie.
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL) && process.env.UFC_TV_FIXTURE !== "loop",
    "con PLAYWRIGHT_BASE_URL no hay UFC_TV_FIXTURE: el contenido depende del día",
  );

  // Lo que se prueba es NUESTRO marcado, no que YouTube cargue: the iframe
  // gets the fake YouTube of e2e/helpers.ts (it used to be aborted; the stub
  // also fires `load`, like a real player would).
  await fakeYouTubeEmbeds(page);

  await page.goto("/");

  // El hueco llega por streaming (va en <Suspense>): se espera al bloque, no
  // al evento `load`.
  const huecoEvento = page.getByRole("heading", { name: "Retransmisión oficial" });
  const bloque = page.locator("section[data-ufc-tv]");
  // La marca invisible que deja el hueco cuando se calla A PROPÓSITO ('off' en
  // la columna, o un id a mano sin título): ver HomeLiveSlot.
  const callado = page.locator("[data-live-slot]");
  await expect(huecoEvento.or(bloque).or(callado).first()).toBeAttached();

  // 🪤 LA BASE ES LA DE PRODUCCIÓN, y hay estados legítimos en los que la
  // portada no pinta UFC TV: el dueño apagó el directo con 'off', dejó un id a
  // mano sin título, o fijó uno con título (la columna manda). Ninguno es una
  // regresión del código, y un rojo aquí bloquearía el megatest —y con él
  // cualquier despliegue— toda la semana. Se salta, con el motivo.
  const motivo = (await callado.count()) > 0 ? await callado.getAttribute("data-live-slot") : null;
  test.skip(
    motivo !== null,
    `el hueco se calla a propósito (${motivo}): lo manda events.live_video_id, no UFC TV`,
  );
  test.skip(
    (await huecoEvento.count()) > 0,
    "el próximo evento tiene live_video_id a mano: manda la columna, no UFC TV",
  );

  await expect(
    bloque,
    "UFC TV no está en bucle: ¿reuseExistingServer reutilizó un server sin UFC_TV_FIXTURE?",
  ).toHaveAttribute("data-ufc-tv", "loop");
  await expect(bloque.getByRole("heading", { name: /UFC TV · Peleas completas/ })).toBeVisible();
  // En bucle no hay distintivo de directo: nada está «en directo».
  await expect(bloque.getByText("En directo", { exact: true })).toHaveCount(0);

  // The player's box (TurnSlot): the poster, or the iframe while it has the turn.
  const marco = bloque.locator("[data-turn]");
  await expect(marco).toHaveAttribute("data-turn", "tv-bucle");
  const debajo = await marco.evaluate((el) => el.getBoundingClientRect().top >= window.innerHeight);
  if (debajo) {
    // Below the fold nothing of it may play: this is what the turn fixed.
    await expect(marco).toHaveAttribute("data-turn-state", "poster");
    await expect(bloque.locator("iframe")).toHaveCount(0);
    await expect(
      marco.getByRole("button", { name: "Toca para ver. UFC TV · Peleas completas" }),
    ).toBeVisible();
  }

  // Brought to the middle of the screen it starts on its own, and it is then
  // the only autoplaying iframe of the page (the hero short left the turn).
  await marco.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(marco).toHaveAttribute("data-turn-state", "playing-auto");
  const iframe = bloque.locator("iframe");
  await expect(iframe).toHaveCount(1);
  await expect(page.locator('iframe[src*="autoplay=1"]')).toHaveCount(1);
  await expect(iframe).toHaveAttribute("allow", /\bautoplay\b/);
  await expect(iframe).toHaveAttribute("title", /UFC TV/);

  const src = await iframe.getAttribute("src");
  expect(src, "el iframe de UFC TV no tiene src").not.toBeNull();
  const url = new URL(src as string);
  expect(url.origin).toBe("https://www.youtube-nocookie.com");
  expect(url.pathname).toMatch(/^\/embed\/[A-Za-z0-9_-]{11}$/);
  for (const param of ["autoplay", "mute", "playsinline", "loop"]) {
    expect(url.searchParams.get(param), `falta ${param}=1 en ${src}`).toBe("1");
  }

  // El de la ruta tiene que ser también el PRIMERO de `playlist`: con loop=1,
  // si no está en la lista YouTube se lo salta (ver loopEmbedUrl en
  // src/lib/ufc-tv.ts). Y sin duplicados.
  const primero = url.pathname.split("/").at(-1);
  const playlist = url.searchParams.get("playlist")?.split(",") ?? [];
  expect(playlist.length, `playlist vacía en ${src}`).toBeGreaterThan(0);
  expect(playlist[0]).toBe(primero);
  expect(new Set(playlist).size).toBe(playlist.length);
});
