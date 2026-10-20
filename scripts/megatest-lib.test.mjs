import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  checkServerIdentity,
  e2eVerdict,
  netstatListeners,
  parsePort,
  pickFreePort,
  readE2eReport,
  whyPortTaken,
} from "./megatest-lib.mjs";

const temps = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "megatest-lib-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A Playwright JSON report with these stats (and optional global errors).
function report(stats, errors) {
  const file = join(tempDir(), "e2e.json");
  writeFileSync(file, JSON.stringify({ stats, ...(errors ? { errors } : {}) }));
  return file;
}

describe("parsePort", () => {
  it("acepta un puerto TCP y rechaza el resto", () => {
    expect(parsePort("3110")).toBe(3110);
    for (const raw of ["", "0", "65536", "-1", "abc", "NaN", "31.5", undefined]) {
      expect(parsePort(raw), String(raw)).toBeNull();
    }
  });
});

describe("e2eVerdict", () => {
  it("verde con tests ejecutados y exit 0, con las tres cifras", () => {
    const v = e2eVerdict(0, readE2eReport(report({ expected: 76, flaky: 2, unexpected: 0, skipped: 390 })));
    expect(v).toEqual({ ok: true, detail: "78 pasaron (2 al reintentar) · 0 fallaron · 390 saltados" });
  });

  it("ROJO con exit 0 si no se ejecutó ningún test (todo saltado)", () => {
    const v = e2eVerdict(0, readE2eReport(report({ expected: 0, flaky: 0, unexpected: 0, skipped: 468 })));
    expect(v.ok).toBe(false);
    expect(v.detail).toContain("0 tests ejecutados");
  });

  it("ROJO con exit 0 si no hay informe (o no se entiende)", () => {
    expect(e2eVerdict(0, readE2eReport(join(tempDir(), "no-existe.json"))).ok).toBe(false);
    const roto = join(tempDir(), "roto.json");
    writeFileSync(roto, "{ esto no es json");
    expect(e2eVerdict(0, readE2eReport(roto)).ok).toBe(false);
    // An old report shape without the counts is not a report either.
    expect(e2eVerdict(0, readE2eReport(report({ expected: 3 }))).ok).toBe(false);
  });

  it("ROJO si Playwright sale con error, aunque haya pasado alguno", () => {
    const v = e2eVerdict(1, readE2eReport(report({ expected: 70, flaky: 0, unexpected: 3, skipped: 395 })));
    expect(v).toEqual({ ok: false, detail: "70 pasaron · 3 fallaron · 395 saltados" });
  });

  it("enseña el error de fuera de los tests (el global setup que no reconoce el server)", () => {
    const file = report({ expected: 0, flaky: 0, unexpected: 0, skipped: 0 }, [
      { message: "\x1b[31mError: No es el server que toca medir: otra web\x1b[39m\n    at globalSetup" },
    ]);
    const v = e2eVerdict(1, readE2eReport(file));
    expect(v.ok).toBe(false);
    expect(v.detail).toContain("— Error: No es el server que toca medir: otra web —");
  });
});

describe("netstatListeners", () => {
  const salida = [
    "  Proto  Dirección local        Dirección remota       Estado           PID",
    "  TCP    0.0.0.0:3100           0.0.0.0:0              ESCUCHANDO       4242",
    "  TCP    [::]:3100              [::]:0                 ESCUCHANDO       4242",
    "  TCP    127.0.0.1:3100         127.0.0.1:51000        ESTABLECIDO      777",
    "  TCP    127.0.0.1:31000        0.0.0.0:0              LISTENING        999",
    "  TCP    [::1]:3100             [::]:0                 LISTENING        5150",
  ].join("\r\n");

  it("da los PID que ESCUCHAN en el puerto, sin conexiones ni puertos parecidos", () => {
    expect(netstatListeners(salida, 3100)).toEqual(["4242", "5150"]);
    expect(netstatListeners(salida, 3110)).toEqual([]);
  });
});

// Ports for real: something on the port in any of the four ways a server can
// listen must count as taken (Windows lets a listen on :: live next to them).
describe("whyPortTaken", () => {
  const open = [];
  afterEach(async () => {
    await Promise.all(open.splice(0).map((s) => new Promise((done) => s.close(done))));
  });
  function listen(host) {
    return new Promise((done, fail) => {
      const server = createServer((socket) => socket.end());
      server.once("error", fail);
      server.listen(0, host, () => {
        open.push(server);
        done(server.address().port);
      });
    });
  }
  async function ipv6() {
    try {
      await listen("::1");
      return true;
    } catch {
      return false;
    }
  }

  it("un puerto libre está libre", async () => {
    const port = await listen("127.0.0.1");
    await new Promise((done) => open.pop().close(done));
    expect(await whyPortTaken(port)).toBeNull();
  });

  for (const host of ["127.0.0.1", "0.0.0.0", "::1", "::"]) {
    it(`ocupado si otro escucha en ${host}`, async (ctx) => {
      if (host.includes(":") && !(await ipv6())) ctx.skip();
      const port = await listen(host);
      expect(await whyPortTaken(port)).not.toBeNull();
    });
  }

  it("pickFreePort da un puerto del rango que está libre", async () => {
    const port = await pickFreePort({ from: 3101, to: 3999 });
    expect(port).toBeGreaterThanOrEqual(3101);
    expect(port).toBeLessThanOrEqual(3999);
    expect(await whyPortTaken(port)).toBeNull();
  });
});

describe("checkServerIdentity", () => {
  const MANIFEST = "self.__BUILD_MANIFEST = {};";
  function distDir() {
    const dir = tempDir();
    writeFileSync(join(dir, "BUILD_ID"), "abc123\n");
    mkdirSync(join(dir, "static", "abc123"), { recursive: true });
    writeFileSync(join(dir, "static", "abc123", "_buildManifest.js"), MANIFEST);
    return dir;
  }
  // A server as a get: path -> [status, body].
  function server(routes) {
    return async (url) => {
      const [status, body] = routes[url.pathname] ?? [404, "not found"];
      return { status, body };
    };
  }
  const ours = {
    "/_next/static/abc123/_buildManifest.js": [200, MANIFEST],
    "/api/health": [200, JSON.stringify({ ok: true, db: "skipped", version: "daa84b8" })],
  };
  const check = (routes, dir = distDir()) =>
    checkServerIdentity({ baseURL: "http://localhost:3110", distDir: dir, version: "daa84b8", get: server(routes) });

  it("null cuando sirve este build y este commit", async () => {
    expect(await check(ours)).toBeNull();
  });

  it("otro build (otro worktree, o uno de antes): no tiene esa ruta", async () => {
    expect(await check({ ...ours, "/_next/static/abc123/_buildManifest.js": [404, "x"] })).toMatch(
      /no sirve el build de este worktree \(BUILD_ID abc123\)/,
    );
  });

  it("un server que contesta 200 a todo no cuela: se compara el contenido", async () => {
    expect(await check({ ...ours, "/_next/static/abc123/_buildManifest.js": [200, "{}"] })).toMatch(
      /no sirve el build/,
    );
  });

  it("otro commit, o un server sin VERCEL_GIT_COMMIT_SHA (dev)", async () => {
    const dev = { ...ours, "/api/health": [200, JSON.stringify({ ok: true, version: "dev" })] };
    expect(await check(dev)).toMatch(/version «dev» y HEAD es daa84b8/);
    expect(await check({ ...ours, "/api/health": [200, "x"] })).toMatch(/version «—»/);
  });

  // The same through real HTTP, with the default get of the module.
  it("contra servers HTTP de verdad: el nuestro sí, uno que dice 200 a todo no", async () => {
    const dir = distDir();
    const serve = (handler) =>
      new Promise((done) => {
        const s = createHttpServer(handler).listen(0, "127.0.0.1", () => done(s));
      });
    const nuestro = await serve((req, res) => {
      const [status, body] = ours[req.url] ?? [404, "not found"];
      res.writeHead(status).end(body);
    });
    const todo200 = await serve((req, res) => res.writeHead(200).end("{}"));
    try {
      const at = (s) => `http://127.0.0.1:${s.address().port}`;
      expect(await checkServerIdentity({ baseURL: at(nuestro), distDir: dir, version: "daa84b8" })).toBeNull();
      expect(await checkServerIdentity({ baseURL: at(todo200), distDir: dir, version: "daa84b8" })).toMatch(
        /no sirve el build/,
      );
    } finally {
      await Promise.all([nuestro, todo200].map((s) => new Promise((done) => s.close(done))));
    }
  });

  it("sin build en disco o sin nadie que conteste", async () => {
    expect(await check(ours, tempDir())).toMatch(/no hay un build completo/);
    const caido = () => Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:3110"));
    expect(
      await checkServerIdentity({ baseURL: "http://localhost:3110", distDir: distDir(), version: "daa84b8", get: caido }),
    ).toMatch(/no contesta \(connect ECONNREFUSED/);
  });
});
