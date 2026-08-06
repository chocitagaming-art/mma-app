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
        },
      }
    : {}),
});
