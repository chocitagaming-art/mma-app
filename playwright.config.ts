import { defineConfig } from "@playwright/test";

// F6 (Tanda 4): suite E2E de aceptación. Barre las 16 rutas de página en 3
// viewports × 2 temas (6 proyectos) + smoke de las 11 rutas API. Asertos DUROS:
// la página responde y no hay desbordamiento horizontal. Las fotos externas
// (headshots ufc.com/espncdn) y las siluetas se cuentan como INFO/WARNING, nunca
// como fallo (una silueta es intencional; una foto que no carga suele ser red
// externa, no una regresión).
//
// La app pega a Neon en runtime, así que el server necesita DATABASE_URL. Por
// defecto arranca su propio `next build && next start` en :3100; exporta
// PLAYWRIGHT_BASE_URL para apuntar a un server ya levantado (dev/prod) y saltar
// el build.

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
const useOwnServer = !process.env.PLAYWRIGHT_BASE_URL;

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
  reporter: [["list"], ["html", { open: "never" }]],
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
          command: "npx next build && npx next start -p 3100",
          url: "http://localhost:3100/api/health",
          reuseExistingServer: true,
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
          // en :3100, la variable no está y la portada enseña lo de verdad.
          //
          // The hero's UFC shorts, canned too (src/lib/ufc-shorts.ts,
          // readShortsFixtureMode): made-up ids and inline SVG thumbnails, so
          // the hero never reaches YouTube nor its image CDN.
          env: { UFC_TV_FIXTURE: "loop", UFC_SHORTS_FIXTURE: "list" },
        },
      }
    : {}),
});
