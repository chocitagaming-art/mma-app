#!/usr/bin/env node
// F6 (Tanda 4) — Mega Test integral: la puerta de aceptación.
//
// Corre en orden las puertas de calidad de AMBOS repos y agrega un veredicto:
//   mma-app     -> tsc --noEmit, eslint, vitest
//   mma-ingesta -> pytest, ruff --select F (bugs reales)
//   mma-app     -> playwright E2E (20 rutas x 3 viewports x 2 temas + 11 APIs).
//                  Cifras medidas el 6-ago-2026 sobre 6e377c8: las 20 son el
//                  array ROUTES de e2e/routes.spec.ts, el 3 x 2 son VIEWPORTS x
//                  THEMES de playwright.config.ts y las 11 son las rutas /api
//                  distintas que toca e2e/api.spec.ts.
//                  El build de producción lo hace el webServer de playwright, así
//                  que si `next build` fallara, el E2E falla en claro.
//
// La suite E2E pega a Neon en runtime -> exporta DATABASE_URL antes de correr.
// Uso:  DATABASE_URL=... node scripts/megatest.mjs
//       (o PLAYWRIGHT_BASE_URL=http://localhost:3100 para reusar un server vivo;
//        el 3100 es el puerto del webServer de playwright.config.ts, comprobado
//        el 6-ago-2026 sobre 6e377c8)
//
// Modo rápido:  node scripts/megatest.mjs --rapido
//       Salta la puerta E2E, que es la que se lleva ~90% del tiempo. Pensado
//       para iterar mientras trabajas; la corrida COMPLETA sigue siendo la que
//       manda antes de commitear.
//
// Silueta / foto externa que no carga = WARNING (no tumban la puerta); ver los
// specs. Sale con código !=0 si alguna puerta DURA falla.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ING = resolve(APP, "..", "mma-ingesta");
const PY = resolve(ING, ".venv", "Scripts", "python.exe");
const PYTHON = existsSync(PY) ? PY : "python";

const RAPIDO = process.argv.includes("--rapido") || process.argv.includes("--fast");

const steps = [
  { name: "app · tsc --noEmit", cwd: APP, cmd: "npx tsc --noEmit" },
  { name: "app · eslint", cwd: APP, cmd: "npm run lint" },
  { name: "app · vitest", cwd: APP, cmd: "npm test" },
  { name: "ingesta · pytest", cwd: ING, cmd: `"${PYTHON}" -m pytest tests/ -q` },
  { name: "ingesta · ruff (bugs F)", cwd: ING, cmd: `"${PYTHON}" -m ruff check --select F src/ tests/` },
  // Única puerta que necesita base de datos, y la que se lleva casi todo el reloj.
  { name: "app · e2e (build + playwright)", cwd: APP, cmd: "npx playwright test", necesitaDb: true },
];

const pendientes = RAPIDO ? steps.filter((step) => !step.necesitaDb) : steps;

// Abortar ANTES de empezar, no a los diez minutos. La puerta E2E levanta un
// servidor que pega a Neon en runtime: sin credenciales falla igual, pero lo
// hacía al final y con un error confuso, después de haberte hecho esperar.
if (!RAPIDO && !process.env.DATABASE_URL && !process.env.PLAYWRIGHT_BASE_URL) {
  console.error(
    "\n\x1b[31m✗ Falta DATABASE_URL.\x1b[0m La puerta E2E levanta un server que lee de Neon.\n" +
      "\n  Arréglalo con una de estas:\n" +
      "    DATABASE_URL=<el de mma-ingesta/.env> npm run megatest\n" +
      "    PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run megatest   (reusa un server ya vivo)\n" +
      "    npm run megatest -- --rapido                                 (salta el E2E)\n",
  );
  process.exit(1);
}

if (RAPIDO) {
  console.log(
    "\n\x1b[33m⚡ Modo rápido: sin la puerta E2E.\x1b[0m Un fallo de renderizado o de " +
      "`next build` NO se detecta aquí — pasa la corrida completa antes de commitear.\n",
  );
}

const results = [];
for (const step of pendientes) {
  console.log(`\n\x1b[1m▶ ${step.name}\x1b[0m  (${step.cwd})`);
  const started = Date.now();
  const proc = spawnSync(step.cmd, {
    cwd: step.cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PYTHONUTF8: "1" },
  });
  const ok = proc.status === 0;
  results.push({ name: step.name, ok, seconds: Math.round((Date.now() - started) / 1000) });
  if (!ok) console.log(`\x1b[31m✗ ${step.name} FALLÓ (exit ${proc.status})\x1b[0m`);
}

console.log("\n\x1b[1m═══ Mega Test — veredicto ═══\x1b[0m");
for (const r of results) {
  const mark = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark}  ${r.name}  (${r.seconds}s)`);
}
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log(`\n\x1b[31m${failed.length} puerta(s) fallaron.\x1b[0m`);
  process.exit(1);
}
if (RAPIDO) {
  console.log(
    "\n\x1b[33mPuertas rápidas verdes ⚡ — falta el E2E: `npm run megatest` antes de commitear.\x1b[0m",
  );
} else {
  console.log("\n\x1b[32mTodas las puertas verdes. ✅\x1b[0m");
}
