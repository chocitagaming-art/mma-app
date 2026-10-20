#!/usr/bin/env node
// F6 (Tanda 4) — Mega Test integral: la puerta de aceptación.
//
// Corre en orden las puertas de calidad de AMBOS repos y agrega un veredicto:
//   mma-app     -> tsc --noEmit, eslint, vitest
//   mma-ingesta -> pytest, ruff --select F (bugs reales)
//   mma-app     -> playwright E2E (18 rutas x 3 viewports x 2 temas + 9 APIs).
//                  Cifras del 11-oct-2026, al quitar el Maestro y Gimnasios: las
//                  18 son el array ROUTES de e2e/routes.spec.ts, el 3 x 2 son
//                  VIEWPORTS x THEMES de playwright.config.ts y las 9 son las
//                  rutas /api vivas que toca e2e/api.spec.ts (más el 404 de
//                  /api/maestro y /api/gyms, que ya no existen).
//                  El build de producción lo hace el webServer de playwright, así
//                  que si `next build` fallara, el E2E falla en claro.
//                  El veredicto dice cuántos tests pasaron, fallaron y se
//                  saltaron (del informe JSON de Playwright), y la puerta FALLA
//                  si no se ejecutó ninguno: un exit 0 sin tests no prueba nada.
//
// La suite E2E pega a Neon en runtime -> exporta DATABASE_URL antes de correr.
// Uso:  DATABASE_URL=... node scripts/megatest.mjs
//       Playwright compila y arranca su propio server en un puerto libre que el
//       megatest elige al azar entre el 3101 y el 3999, o en E2E_PORT si lo
//       fijas (E2E_PORT=3110 DATABASE_URL=... npm run megatest). Nunca mide un
//       server que no sea el suyo:
//         - si fijas E2E_PORT y ya está ocupado, ABORTA antes de empezar y dice
//           qué proceso lo tiene (el 16-oct-2026 el 3100 lo tenía una sesión de
//           DEVAS del dueño); y lo vuelve a mirar justo antes del E2E;
//         - y antes del primer test, e2e/global-setup.ts comprueba que quien
//           contesta sirve el build de ESTE worktree y el commit HEAD. Un server
//           ajeno o viejo deja la puerta en ROJO aunque aparezca a mitad de la
//           corrida, mientras dura el `next build`.
//
//       (o PLAYWRIGHT_BASE_URL=http://localhost:3110 para medir un server ya
//        vivo y ahorrarte el build. Pasa la misma comprobación, así que tiene
//        que estar arrancado desde el build de este worktree y con el commit:
//          npx next build && VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD) \
//            UFC_TV_FIXTURE=loop UFC_SHORTS_FIXTURE=list npx next start -p 3110
//        Sirve para iterar y NO da el verde de aceptación: ese build no lo ha
//        compilado el megatest y no sabe si lleva tus últimos cambios)
//
// Modo rápido:  node scripts/megatest.mjs --rapido
//       Salta la puerta E2E, que es la que se lleva ~90% del tiempo. Pensado
//       para iterar mientras trabajas; la corrida COMPLETA sigue siendo la que
//       manda antes de commitear.
//
// Silueta / foto externa que no carga = WARNING (no tumban la puerta); ver los
// specs. Sale con código !=0 si alguna puerta DURA falla.

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { e2eVerdict, parsePort, pickFreePort, portHolders, readE2eReport, whyPortTaken } from "./megatest-lib.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ING = resolve(APP, "..", "mma-ingesta");
const PY = resolve(ING, ".venv", "Scripts", "python.exe");
const PYTHON = existsSync(PY) ? PY : "python";

const RAPIDO = process.argv.includes("--rapido") || process.argv.includes("--fast");

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
// Playwright leaves its counts here (playwright.config.ts adds the json reporter
// when E2E_JSON_REPORT is set). test-results/ is git-ignored.
const E2E_REPORT = resolve(APP, "test-results", "megatest-e2e.json");

// The commit the e2e server must report in /api/health (e2e/global-setup.ts).
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: APP, encoding: "utf8" });
const HEAD = head.status === 0 ? head.stdout.trim() : "";

// Who holds the port, for the two messages that stop on it.
function describeHolders(port, why) {
  const holders = portHolders(port);
  if (holders.length) {
    return holders.map((h) => `    PID ${h.pid}  ${h.command || "(sin datos del proceso)"}`).join("\n");
  }
  return why === "EACCES"
    ? "    ningún proceso: Windows reserva ese puerto (netsh interface ipv4 show excludedportrange protocol=tcp)"
    : `    (no se ha podido saber qué proceso es: netstat -ano | grep ":${port} ")`;
}

// Abortar ANTES de empezar, no a los diez minutos. La puerta E2E levanta un
// servidor que pega a Neon en runtime: sin credenciales falla igual, pero lo
// hacía al final y con un error confuso, después de haberte hecho esperar.
if (!RAPIDO && !process.env.DATABASE_URL && !BASE_URL) {
  console.error(
    "\n\x1b[31m✗ Falta DATABASE_URL.\x1b[0m La puerta E2E levanta un server que lee de Neon.\n" +
      "\n  Arréglalo con una de estas:\n" +
      "    DATABASE_URL=<el de mma-ingesta/.env> npm run megatest\n" +
      "    npm run megatest -- --rapido     (salta el E2E)\n",
  );
  process.exit(1);
}

if (!RAPIDO && !HEAD) {
  console.error(
    "\n\x1b[31m✗ No se sabe el commit (git rev-parse HEAD ha fallado).\x1b[0m La puerta E2E comprueba " +
      "que el server sirve ESE commit.\n",
  );
  process.exit(1);
}

// The same with the port: a server already listening there was not started by
// the megatest (another site, another build), so stop now with whose it is,
// not after tsc, eslint, vitest and pytest.
let e2ePort = null;
if (!RAPIDO && !BASE_URL) {
  if (process.env.E2E_PORT) {
    e2ePort = parsePort(process.env.E2E_PORT);
    if (!e2ePort) {
      console.error(`\n\x1b[31m✗ E2E_PORT no es un puerto válido: «${process.env.E2E_PORT}».\x1b[0m\n`);
      process.exit(1);
    }
    const why = await whyPortTaken(e2ePort);
    if (why) {
      const free = await pickFreePort();
      console.error(
        `\n\x1b[31m✗ El puerto ${e2ePort} ya está ocupado.\x1b[0m La puerta E2E arranca ahí su propio build, y lo ` +
          "que ya escucha en ese puerto no lo ha arrancado el megatest:\n  podría ser otra web u otro build, y " +
          "aprobarías lo que no es. Lo tiene:\n\n" +
          `${describeHolders(e2ePort, why)}\n\n` +
          "  No lo mates si no lo has arrancado tú. Sigue con otro puerto libre:\n" +
          `    E2E_PORT=${free ?? 3110} DATABASE_URL=<el de mma-ingesta/.env> npm run megatest\n` +
          "  o sin E2E_PORT, y el megatest elige uno libre.\n",
      );
      process.exit(1);
    }
  } else {
    e2ePort = await pickFreePort();
    if (!e2ePort) {
      console.error(
        "\n\x1b[31m✗ No hay ningún puerto libre entre el 3101 y el 3999 para el E2E.\x1b[0m Fija uno con E2E_PORT.\n",
      );
      process.exit(1);
    }
  }
}

const steps = [
  { name: "app · tsc --noEmit", cwd: APP, cmd: "npx tsc --noEmit" },
  { name: "app · eslint", cwd: APP, cmd: "npm run lint" },
  { name: "app · vitest", cwd: APP, cmd: "npm test" },
  { name: "ingesta · pytest", cwd: ING, cmd: `"${PYTHON}" -m pytest tests/ -q` },
  { name: "ingesta · ruff (bugs F)", cwd: ING, cmd: `"${PYTHON}" -m ruff check --select F src/ tests/` },
  // Única puerta que necesita base de datos, y la que se lleva casi todo el reloj.
  {
    name: BASE_URL ? `app · e2e (playwright contra ${BASE_URL})` : `app · e2e (build + playwright, :${e2ePort})`,
    cwd: APP,
    cmd: "npx playwright test",
    necesitaDb: true,
    env: {
      // The home's canned UFC TV and shorts. The server Playwright starts gets
      // them from webServer.env anyway; these reach the SPECS, which skip the
      // home when PLAYWRIGHT_BASE_URL comes without them (21-oct-2026: all 78
      // run tests of hero-shorts, posters, ufc-tv, lo-que-tapa and
      // portada-noticias, exit code 0). Values the owner brings win.
      UFC_TV_FIXTURE: process.env.UFC_TV_FIXTURE || "loop",
      UFC_SHORTS_FIXTURE: process.env.UFC_SHORTS_FIXTURE || "list",
      // Before the first test, whoever answers must serve this build at HEAD
      // (e2e/global-setup.ts, which playwright.config.ts turns on with these).
      E2E_EXPECT_VERSION: HEAD.slice(0, 7),
      E2E_EXPECT_DIST_DIR: resolve(APP, ".next"),
      E2E_JSON_REPORT: E2E_REPORT,
      ...(BASE_URL
        ? {}
        : {
            E2E_PORT: String(e2ePort),
            // Playwright must never reuse a server it did not start (playwright.config.ts).
            E2E_FRESH_SERVER: "1",
            // What /api/health reports as `version`, as on Vercel.
            VERCEL_GIT_COMMIT_SHA: HEAD,
          }),
    },
    report: E2E_REPORT,
    // Looked at again right before Playwright: tsc, eslint, vitest and pytest
    // take minutes, and the port can be taken meanwhile.
    port: e2ePort,
  },
];

const pendientes = RAPIDO ? steps.filter((step) => !step.necesitaDb) : steps;

if (!RAPIDO && BASE_URL) {
  console.log(
    `\n\x1b[33mℹ E2E contra ${BASE_URL}, un server que no arranca el megatest.\x1b[0m Antes del primer ` +
      "test se comprueba que sirve\n  el build de este worktree y el commit HEAD; si no, la puerta sale en rojo. " +
      "Arráncalo así:\n" +
      "    npx next build && VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD) \\\n" +
      "      UFC_TV_FIXTURE=loop UFC_SHORTS_FIXTURE=list npx next start -p <puerto>\n" +
      "  Sirve para iterar: el verde de aceptación es la corrida sin PLAYWRIGHT_BASE_URL.\n",
  );
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
  if (step.port) {
    const why = await whyPortTaken(step.port);
    if (why) {
      const detail = `el puerto ${step.port} se ha ocupado mientras corrían las otras puertas; lo tiene:`;
      console.log(`\x1b[31m✗ ${step.name} NO SE HA CORRIDO — ${detail}\x1b[0m\n${describeHolders(step.port, why)}`);
      results.push({ name: step.name, ok: false, detail: `${detail} ver arriba`, seconds: 0 });
      continue;
    }
  }
  // A report left by an earlier run must not vouch for this one.
  if (step.report) rmSync(step.report, { force: true });
  const proc = spawnSync(step.cmd, {
    cwd: step.cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PYTHONUTF8: "1", ...step.env },
  });
  let ok = proc.status === 0;
  let detail = "";
  if (step.report) ({ ok, detail } = e2eVerdict(proc.status, readE2eReport(step.report)));
  results.push({ name: step.name, ok, detail, seconds: Math.round((Date.now() - started) / 1000) });
  if (!ok) console.log(`\x1b[31m✗ ${step.name} FALLÓ (exit ${proc.status})${detail ? ` — ${detail}` : ""}\x1b[0m`);
}

console.log("\n\x1b[1m═══ Mega Test — veredicto ═══\x1b[0m");
for (const r of results) {
  const mark = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark}  ${r.name}  (${r.seconds}s)${r.detail ? `  —  ${r.detail}` : ""}`);
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
} else if (BASE_URL) {
  console.log(
    `\n\x1b[33mPuertas verdes, con el E2E contra ${BASE_URL} (build de este worktree, commit ${HEAD.slice(0, 7)}).` +
      "\x1b[0m\n  No es el verde de aceptación: ese build no lo ha compilado el megatest y no sabe si lleva tus " +
      "últimos\n  cambios. Para dar algo por válido: `npm run megatest` sin PLAYWRIGHT_BASE_URL.",
  );
} else {
  console.log("\n\x1b[32mTodas las puertas verdes. ✅\x1b[0m");
}
