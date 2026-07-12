#!/usr/bin/env node
// F6 (Tanda 4) — Mega Test integral: la puerta de aceptación.
//
// Corre en orden las puertas de calidad de AMBOS repos y agrega un veredicto:
//   mma-app     -> tsc --noEmit, eslint, vitest
//   mma-ingesta -> pytest, ruff --select F (bugs reales)
//   mma-app     -> playwright E2E (16 rutas x 3 viewports x 2 temas + 9 APIs).
//                  El build de producción lo hace el webServer de playwright, así
//                  que si `next build` fallara, el E2E falla en claro.
//
// La suite E2E pega a Neon en runtime -> exporta DATABASE_URL antes de correr.
// Uso:  DATABASE_URL=... node scripts/megatest.mjs
//       (o PLAYWRIGHT_BASE_URL=http://localhost:3400 para reusar un server vivo)
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

const steps = [
  { name: "app · tsc --noEmit", cwd: APP, cmd: "npx tsc --noEmit" },
  { name: "app · eslint", cwd: APP, cmd: "npm run lint" },
  { name: "app · vitest", cwd: APP, cmd: "npm test" },
  { name: "ingesta · pytest", cwd: ING, cmd: `"${PYTHON}" -m pytest tests/ -q` },
  { name: "ingesta · ruff (bugs F)", cwd: ING, cmd: `"${PYTHON}" -m ruff check --select F src/ tests/` },
  { name: "app · e2e (build + playwright)", cwd: APP, cmd: "npx playwright test" },
];

if (!process.env.DATABASE_URL && !process.env.PLAYWRIGHT_BASE_URL) {
  console.warn(
    "\n⚠️  Ni DATABASE_URL ni PLAYWRIGHT_BASE_URL están puestos: el server del E2E " +
      "no podrá servir datos de Neon y el barrido fallará. Exporta DATABASE_URL.\n",
  );
}

const results = [];
for (const step of steps) {
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
console.log("\n\x1b[32mTodas las puertas verdes. ✅\x1b[0m");
