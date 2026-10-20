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
//       Playwright compila y arranca su propio server en el puerto E2E_PORT
//       (3100 si no se dice otro). Si ese puerto ya está ocupado, el megatest
//       ABORTA antes de empezar y dice qué proceso lo tiene: nunca reutiliza un
//       server que no ha arrancado él (el 16-oct-2026 el 3100 lo tenía una
//       sesión de DEVAS del dueño). Con otro puerto:
//         E2E_PORT=3110 DATABASE_URL=... npm run megatest
//
//       (o PLAYWRIGHT_BASE_URL=http://localhost:3110 para medir un server ya
//        vivo. Ese lo eliges tú y el megatest no sabe de qué commit es. Tiene
//        que estar arrancado con UFC_TV_FIXTURE=loop UFC_SHORTS_FIXTURE=list:
//        el megatest se las pasa también a Playwright, así que sin ellas en el
//        server la portada sale en ROJO, no saltada)
//
// Modo rápido:  node scripts/megatest.mjs --rapido
//       Salta la puerta E2E, que es la que se lleva ~90% del tiempo. Pensado
//       para iterar mientras trabajas; la corrida COMPLETA sigue siendo la que
//       manda antes de commitear.
//
// Silueta / foto externa que no carga = WARNING (no tumban la puerta); ver los
// specs. Sale con código !=0 si alguna puerta DURA falla.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ING = resolve(APP, "..", "mma-ingesta");
const PY = resolve(ING, ".venv", "Scripts", "python.exe");
const PYTHON = existsSync(PY) ? PY : "python";

const RAPIDO = process.argv.includes("--rapido") || process.argv.includes("--fast");

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
const E2E_PORT = Number(process.env.E2E_PORT || 3100);
// Playwright leaves its counts here (playwright.config.ts adds the json reporter
// when E2E_JSON_REPORT is set). test-results/ is git-ignored.
const E2E_REPORT = resolve(APP, "test-results", "megatest-e2e.json");

const steps = [
  { name: "app · tsc --noEmit", cwd: APP, cmd: "npx tsc --noEmit" },
  { name: "app · eslint", cwd: APP, cmd: "npm run lint" },
  { name: "app · vitest", cwd: APP, cmd: "npm test" },
  { name: "ingesta · pytest", cwd: ING, cmd: `"${PYTHON}" -m pytest tests/ -q` },
  { name: "ingesta · ruff (bugs F)", cwd: ING, cmd: `"${PYTHON}" -m ruff check --select F src/ tests/` },
  // Única puerta que necesita base de datos, y la que se lleva casi todo el reloj.
  {
    name: "app · e2e (build + playwright)",
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
      E2E_PORT: String(E2E_PORT),
      // Playwright must never test a server it did not start (playwright.config.ts).
      E2E_FRESH_SERVER: "1",
      E2E_JSON_REPORT: E2E_REPORT,
    },
    report: E2E_REPORT,
  },
];

const pendientes = RAPIDO ? steps.filter((step) => !step.necesitaDb) : steps;

// Does anything answer on the port? Both loopbacks: `next start` listens on
// every interface, but a server bound to 127.0.0.1 or ::1 alone still answers
// Playwright's http://localhost:<port>.
function answers(port, host) {
  return new Promise((done) => {
    const socket = createConnection({ port, host });
    const finish = (taken) => {
      socket.destroy();
      done(taken);
    };
    socket.setTimeout(1500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

// ...and can it be listened on, the way `next start` will? null when it can,
// else the error code (EADDRINUSE; EACCES when Windows reserves the port).
function listenError(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", (error) => done(error.code ?? "error"));
    server.listen(port, () => server.close(() => done(null)));
  });
}

// null when the port is free for the e2e server, else why it is not.
async function whyPortTaken(port) {
  const [v4, v6] = await Promise.all([answers(port, "127.0.0.1"), answers(port, "::1")]);
  return v4 || v6 ? "answers" : listenError(port);
}

// Who listens on the port, for the abort message: PID and command line. Best
// effort: an empty list still aborts.
function portHolders(port) {
  let pids = [];
  if (process.platform === "win32") {
    // A listening socket's foreign address is 0.0.0.0:0 or [::]:0, whatever the
    // language of the State column (LISTENING, ESCUCHANDO...).
    const netstat = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
    for (const line of (netstat.stdout ?? "").split(/\r?\n/)) {
      const [proto, local, foreign, ...rest] = line.trim().split(/\s+/);
      if (proto === "TCP" && local?.endsWith(`:${port}`) && /^(0\.0\.0\.0|\[::\]):0$/.test(foreign ?? "")) {
        pids.push(rest.at(-1));
      }
    }
  } else {
    const lsof = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
    pids = (lsof.stdout ?? "").split(/\s+/);
  }
  return [...new Set(pids.filter((pid) => /^\d+$/.test(pid ?? "")))].map((pid) => {
    const ps =
      process.platform === "win32"
        ? spawnSync(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `$p = Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; ` +
                "if ($p.CommandLine) { $p.CommandLine } else { $p.Name }",
            ],
            { encoding: "utf8", timeout: 15_000 },
          )
        : spawnSync("ps", ["-o", "args=", "-p", pid], { encoding: "utf8" });
    return { pid, command: (ps.stdout ?? "").trim() };
  });
}

// Playwright's JSON report: expected = passed, flaky = passed on a retry,
// unexpected = failed. null when there is none (Playwright died before writing
// it): then nobody knows what ran.
function readE2eCounts(file) {
  try {
    const { stats } = JSON.parse(readFileSync(file, "utf8"));
    const { expected, flaky, unexpected, skipped } = stats;
    if (![expected, flaky, unexpected, skipped].every(Number.isInteger)) return null;
    return { passed: expected + flaky, flaky, failed: unexpected, skipped };
  } catch {
    return null;
  }
}

// Abortar ANTES de empezar, no a los diez minutos. La puerta E2E levanta un
// servidor que pega a Neon en runtime: sin credenciales falla igual, pero lo
// hacía al final y con un error confuso, después de haberte hecho esperar.
if (!RAPIDO && !process.env.DATABASE_URL && !BASE_URL) {
  console.error(
    "\n\x1b[31m✗ Falta DATABASE_URL.\x1b[0m La puerta E2E levanta un server que lee de Neon.\n" +
      "\n  Arréglalo con una de estas:\n" +
      "    DATABASE_URL=<el de mma-ingesta/.env> npm run megatest\n" +
      "    PLAYWRIGHT_BASE_URL=http://localhost:3110 npm run megatest   (mide un server ya vivo, arrancado\n" +
      "                                                                  con UFC_TV_FIXTURE=loop UFC_SHORTS_FIXTURE=list)\n" +
      "    npm run megatest -- --rapido                                 (salta el E2E)\n",
  );
  process.exit(1);
}

// The same with the port: a server already listening there was not started by
// the megatest (another site, another build), so stop now with whose it is.
// Playwright's own lock (E2E_FRESH_SERVER) would only catch it after tsc,
// eslint, vitest and pytest.
if (!RAPIDO && !BASE_URL) {
  if (!Number.isInteger(E2E_PORT) || E2E_PORT < 1 || E2E_PORT > 65535) {
    console.error(`\n\x1b[31m✗ E2E_PORT no es un puerto válido: «${process.env.E2E_PORT}».\x1b[0m\n`);
    process.exit(1);
  }
  const why = await whyPortTaken(E2E_PORT);
  if (why) {
    const holders = portHolders(E2E_PORT);
    let free = 3110;
    for (const candidate of [3110, 3120, 3130, 3140, 3150]) {
      if (candidate !== E2E_PORT && !(await whyPortTaken(candidate))) {
        free = candidate;
        break;
      }
    }
    const who = holders.length
      ? holders.map((h) => `    PID ${h.pid}  ${h.command || "(sin datos del proceso)"}`).join("\n")
      : why === "EACCES"
        ? "    ningún proceso: Windows reserva ese puerto (netsh interface ipv4 show excludedportrange protocol=tcp)"
        : `    (no se ha podido saber qué proceso es: netstat -ano | grep ":${E2E_PORT} ")`;
    console.error(
      `\n\x1b[31m✗ El puerto ${E2E_PORT} ya está ocupado.\x1b[0m La puerta E2E arranca ahí su propio build, y lo ` +
        "que ya escucha en ese puerto no lo ha arrancado el megatest:\n  podría ser otra web u otro build, y " +
        "aprobarías lo que no es. Lo tiene:\n\n" +
        `${who}\n\n` +
        "  No lo mates si no lo has arrancado tú. Sigue con otro puerto libre:\n" +
        `    E2E_PORT=${free} DATABASE_URL=<el de mma-ingesta/.env> npm run megatest\n` +
        "  o, si ese server es tuyo y está arrancado con UFC_TV_FIXTURE=loop UFC_SHORTS_FIXTURE=list:\n" +
        `    PLAYWRIGHT_BASE_URL=http://localhost:${E2E_PORT} npm run megatest\n`,
    );
    process.exit(1);
  }
}

if (!RAPIDO && BASE_URL) {
  console.log(
    `\n\x1b[33mℹ E2E contra ${BASE_URL}, un server que no arranca el megatest:\x1b[0m no sabe de qué commit ` +
      "es. Tiene que estar\n  arrancado con UFC_TV_FIXTURE=loop UFC_SHORTS_FIXTURE=list; si no, la portada sale en rojo.\n",
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
  if (step.report) {
    const counts = readE2eCounts(step.report);
    if (!counts) {
      ok = false;
      detail = "sin informe de Playwright: no se sabe cuántos tests corrieron";
    } else {
      detail =
        `${counts.passed} pasaron${counts.flaky ? ` (${counts.flaky} al reintentar)` : ""} · ` +
        `${counts.failed} fallaron · ${counts.skipped} saltados`;
      if (counts.passed + counts.failed === 0) {
        ok = false;
        detail += " — 0 tests ejecutados: un verde así no prueba nada";
      }
    }
  }
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
} else {
  console.log("\n\x1b[32mTodas las puertas verdes. ✅\x1b[0m");
}
