import { defineConfig, type ReporterDescription } from "@playwright/test";

// F6 (Tanda 4): suite E2E de aceptación. Barre las 18 rutas de página en 3
// viewports × 2 temas (6 proyectos) + smoke de las 9 rutas API. Asertos DUROS:
// la página responde y no hay desbordamiento horizontal. Las fotos externas
// (headshots ufc.com/espncdn) y las siluetas se cuentan como INFO/WARNING, nunca
// como fallo (una silueta es intencional; una foto que no carga suele ser red
// externa, no una regresión).
//
// La app pega a Neon en runtime, así que el server necesita DATABASE_URL. Por
// defecto arranca su propio `next build && next start` en el puerto E2E_PORT
// (3100 si no se dice otro); exporta PLAYWRIGHT_BASE_URL para apuntar a un
// server ya levantado (dev/prod) y saltar el build.
//
// The port is a variable since 21-oct-2026: on 16-oct a DEVAS session of the
// owner held :3100, and with reuseExistingServer the suite would have measured
// THAT site. By hand, `npx playwright test` still reuses whatever answers on
// the port. scripts/megatest.mjs never does: it picks a free port, sets
// E2E_FRESH_SERVER=1, and through E2E_EXPECT_VERSION turns on
// e2e/global-setup.ts, which checks before the first test that whoever answers
// serves this worktree's build at HEAD.

const useOwnServer = !process.env.PLAYWRIGHT_BASE_URL;
const port = Number(process.env.E2E_PORT || 3100);
// Only the server Playwright starts uses the port: with PLAYWRIGHT_BASE_URL a
// stale E2E_PORT left in the environment must not break the run.
if (useOwnServer && (!Number.isInteger(port) || port < 1 || port > 65535)) {
  throw new Error(`E2E_PORT no es un puerto válido: «${process.env.E2E_PORT}»`);
}
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`;

const reporter: ReporterDescription[] = [["list"], ["html", { open: "never" }]];
// The megatest asks for a JSON report too and reads its counts from it: exit
// code 0 with 0 tests run is not a green (scripts/megatest.mjs).
if (process.env.E2E_JSON_REPORT) {
  reporter.push(["json", { outputFile: process.env.E2E_JSON_REPORT }]);
}

const VIEWPORTS = {
  movil: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  escritorio: { width: 1280, height: 800 },
} as const;

const THEMES = ["light", "dark"] as const;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  // Neon es compartida: pocos workers para no saturar la BD ni ufc.com/espncdn.
  workers: 3,
  reporter,
  ...(process.env.E2E_EXPECT_VERSION ? { globalSetup: "./e2e/global-setup.ts" } : {}),
  use: {
    baseURL,
    trace: "on-first-retry",
    // Da margen a las imágenes remotas antes de decidir "no carga".
    actionTimeout: 15_000,
  },
  projects: THEMES.flatMap((theme) =>
    Object.entries(VIEWPORTS).map(([name, viewport]) => ({
      name: `${name}-${theme}`,
      // next-themes usa defaultTheme="system" + enableSystem: emular
      // prefers-color-scheme basta para forzar claro/oscuro sin localStorage.
      use: { viewport, colorScheme: theme },
    })),
  ),
  ...(useOwnServer
    ? {
        webServer: {
          command: `npx next build && npx next start -p ${port}`,
          url: `http://localhost:${port}/api/health`,
          // With E2E_FRESH_SERVER=1 Playwright refuses to start when the url
          // already answers ("is already used"). It asks once, BEFORE the build:
          // a server that starts answering during the build still passes for
          // ours, and that is what e2e/global-setup.ts catches.
          reuseExistingServer: process.env.E2E_FRESH_SERVER !== "1",
          timeout: 300_000,
          // UFC TV (portada) con datos ENLATADOS y sin red: el bucle de peleas
          // de siempre, con ids reales, pase lo que pase ese día en YouTube.
          // Ver readFixtureMode en src/lib/ufc-tv.ts y e2e/ufc-tv.spec.ts.
          //
          // Playwright MEZCLA esto sobre process.env, no lo sustituye
          // (node_modules/playwright/lib/runner/index.js: `...process.env,
          // ...this._options.env`): DATABASE_URL y compañía siguen llegando al
          // server.
          //
          // ⚠️ Solo vale para el server que arranca Playwright. Con
          // PLAYWRIGHT_BASE_URL, o si reuseExistingServer reutiliza uno ya vivo
          // en el puerto, la variable no está y la portada enseña lo de verdad.
          // The megatest exports both to Playwright as well, so with
          // PLAYWRIGHT_BASE_URL the home's specs run instead of skipping, and a
          // server started without them goes red, not silently green.
          //
          // The hero's UFC shorts, canned too (src/lib/ufc-shorts.ts,
          // readShortsFixtureMode): made-up ids and inline SVG thumbnails, so
          // the hero never reaches YouTube nor its image CDN.
          env: { UFC_TV_FIXTURE: "loop", UFC_SHORTS_FIXTURE: "list" },
        },
      }
    : {}),
});
