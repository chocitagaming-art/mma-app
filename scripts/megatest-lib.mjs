// The pieces of the megatest that decide a green, apart so that vitest tests
// them (scripts/megatest-lib.test.mjs): the gate that says "green" needs tests of
// its own, or an `if (false)` in the count of tests run passes unnoticed.
//
// Used by scripts/megatest.mjs and, the server check, by e2e/global-setup.ts.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";

/** "3110" -> 3110; anything that is not a TCP port -> null. */
export function parsePort(raw) {
  const port = Number(raw);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

// Does anything answer on the port? Both loopbacks: `next start` listens on
// every interface, but a server bound to 127.0.0.1 or ::1 alone still answers
// Playwright's http://localhost:<port>.
export function answers(port, host) {
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
export function listenError(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", (error) => done(error.code ?? "error"));
    server.listen(port, () => server.close(() => done(null)));
  });
}

// null when the port is free for the e2e server, else why it is not. Both
// questions, because on Windows a listen on :: (what `next start` does) lives
// happily next to another process on 127.0.0.1, ::1 or 0.0.0.0 of the same port.
export async function whyPortTaken(port) {
  const [v4, v6] = await Promise.all([answers(port, "127.0.0.1"), answers(port, "::1")]);
  return v4 || v6 ? "answers" : listenError(port);
}

// The e2e port when E2E_PORT is not given: a free one at random, so that two
// megatests at once (two worktrees) do not meet on the same port. Not listen(0):
// the OS hands those from the ephemeral range, which outgoing connections draw
// from too, and the build opens plenty of them before `next start` binds.
export async function pickFreePort({ from = 3101, to = 3999, tries = 40, random = Math.random } = {}) {
  for (let i = 0; i < tries; i++) {
    const port = from + Math.floor(random() * (to - from + 1));
    if (!(await whyPortTaken(port))) return port;
  }
  return null;
}

// PIDs listening on the port in `netstat -ano` output (Windows). A listening
// socket's foreign address is 0.0.0.0:0 or [::]:0, whatever the language of the
// State column (LISTENING, ESCUCHANDO...).
export function netstatListeners(output, port) {
  const pids = [];
  for (const line of output.split(/\r?\n/)) {
    const [proto, local, foreign, ...rest] = line.trim().split(/\s+/);
    if (proto === "TCP" && local?.endsWith(`:${port}`) && /^(0\.0\.0\.0|\[::\]):0$/.test(foreign ?? "")) {
      pids.push(rest.at(-1));
    }
  }
  return [...new Set(pids.filter((pid) => /^\d+$/.test(pid ?? "")))];
}

// Who listens on the port, for the abort message: PID and command line. Best
// effort: an empty list still aborts.
export function portHolders(port) {
  let pids;
  if (process.platform === "win32") {
    const netstat = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
    pids = netstatListeners(netstat.stdout ?? "", port);
  } else {
    const lsof = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
    pids = [...new Set((lsof.stdout ?? "").split(/\s+/).filter((pid) => /^\d+$/.test(pid)))];
  }
  return pids.map((pid) => {
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
// unexpected = failed; `errors` are the ones outside any test (a global setup
// that throws). null when there is none (Playwright died before writing it):
// then nobody knows what ran.
export function readE2eReport(file) {
  try {
    const { stats, errors } = JSON.parse(readFileSync(file, "utf8"));
    const { expected, flaky, unexpected, skipped } = stats;
    if (![expected, flaky, unexpected, skipped].every(Number.isInteger)) return null;
    const message = Array.isArray(errors) ? (errors[0]?.message ?? errors[0]?.value) : undefined;
    // Playwright colours its messages.
    const error = typeof message === "string" ? message.replace(/\x1b\[[0-9;]*m/g, "").split("\n")[0].trim() : "";
    return { passed: expected + flaky, flaky, failed: unexpected, skipped, error };
  } catch {
    return null;
  }
}

// The e2e gate from Playwright's exit code and its report. Exit 0 is not enough:
// with 0 tests run, or no report, nothing has been proved.
export function e2eVerdict(status, report) {
  if (!report) {
    return { ok: false, detail: "sin informe de Playwright: no se sabe cuántos tests corrieron" };
  }
  let ok = status === 0;
  let detail =
    `${report.passed} pasaron${report.flaky ? ` (${report.flaky} al reintentar)` : ""} · ` +
    `${report.failed} fallaron · ${report.skipped} saltados`;
  if (report.error) detail += ` — ${report.error}`;
  if (report.passed + report.failed === 0) {
    ok = false;
    detail += " — 0 tests ejecutados: un verde así no prueba nada";
  }
  return { ok, detail };
}

// Is the server at baseURL the one this run must measure? Two proofs, before a
// single test:
//   1. It serves the build that is on disk NOW. `next start` lists its static
//      files when it boots, so only a server started from this very build (not
//      another worktree's, not one left from an earlier build) has the path
//      static/<BUILD_ID>/; and the body is compared too, for a server that
//      answers 200 to anything.
//   2. /api/health reports HEAD, from VERCEL_GIT_COMMIT_SHA, the comparison
//      smoke-prod.yml makes against production.
// null when it is; else why not, in Spanish, for the verdict.
export async function checkServerIdentity({ baseURL, distDir, version, get = getOnce }) {
  let buildId;
  let manifest;
  try {
    buildId = readFileSync(join(distDir, "BUILD_ID"), "utf8").trim();
    manifest = readFileSync(join(distDir, "static", buildId, "_buildManifest.js"), "utf8");
  } catch {
    return `no hay un build completo en ${distDir} (falta BUILD_ID o su _buildManifest.js)`;
  }
  try {
    const served = await get(new URL(`/_next/static/${buildId}/_buildManifest.js`, baseURL));
    if (served.status !== 200 || served.body !== manifest) {
      return (
        `${baseURL} no sirve el build de este worktree (BUILD_ID ${buildId}): ` +
        "es otra web, otro worktree o un build anterior"
      );
    }
    const health = await get(new URL("/api/health", baseURL));
    let reported;
    try {
      reported = JSON.parse(health.body)?.version;
    } catch {
      // Not JSON, so no version: reported stays undefined.
    }
    if (reported !== version) {
      return (
        `${baseURL}/api/health dice version «${reported ?? "—"}» y HEAD es ${version}: ` +
        "arráncalo con VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD)"
      );
    }
  } catch (error) {
    return `${baseURL} no contesta (${error instanceof Error ? error.message : error})`;
  }
  return null;
}

// A GET on a socket of its own, closed with the response. Not fetch(): it keeps
// the socket alive for the next request, and Playwright exiting over it (the
// global setup throws, Playwright quits) trips a libuv assertion on Windows:
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", exit 3221226505.
function getOnce(url) {
  return new Promise((done, fail) => {
    const request = (url.protocol === "https:" ? httpsGet : httpGet)(url, { agent: false }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => done({ status: response.statusCode, body }));
      response.on("error", fail);
    });
    request.setTimeout(15_000, () => request.destroy(new Error("sin respuesta en 15 s")));
    request.once("error", fail);
  });
}
