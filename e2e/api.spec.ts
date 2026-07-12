import { test, expect } from "@playwright/test";

// El smoke de APIs no depende del viewport/tema: correrlo una sola vez (en el
// proyecto de escritorio-claro) en vez de en los 6.
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "smoke de API: se corre solo en un proyecto",
  );
});

// Smoke de las 9 rutas API. Los GET deben responder 200; /api/health además
// debe reportar la BD arriba. Los POST se prueban a nivel de CONTRATO (petición
// inválida → 4xx) para NO gastar tokens de Anthropic ni depender del microservicio.

test("GET /api/health → 200 y BD arriba", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.db).toBe("up");
});

const GET_ROUTES = [
  "/api/live/now",
  "/api/search?q=silva",
  "/api/fighters/search?q=silva",
  "/api/eventos/search?q=ufc",
];

for (const path of GET_ROUTES) {
  test(`GET ${path} → 200`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status(), `HTTP ${res.status()} en ${path}`).toBe(200);
  });
}

test("GET /api/gyms con ciudad → responde (requiere city o lat/lon)", async ({ request }) => {
  // Geocodifica la ciudad (OSM/Nominatim) y busca gimnasios cercanos (Overpass);
  // sin parametros responde 400 a proposito. Smoke tolerante: con una ciudad
  // valida responde 200, o 502/503/504 si OSM esta caido (no es un bug nuestro,
  // por eso NO lo tratamos como fallo — evita flakiness por dependencia externa).
  const res = await request.get("/api/gyms?city=las%20vegas", { timeout: 30_000 });
  expect([200, 502, 503, 504], `HTTP ${res.status()} en /api/gyms?city=`).toContain(
    res.status(),
  );
});

test("GET /api/search devuelve resultados reales", async ({ request }) => {
  const res = await request.get("/api/search?q=silva");
  const body = await res.json();
  // Verificación de datos: la búsqueda contra Neon devuelve luchadores reales.
  expect(Array.isArray(body.fighters)).toBeTruthy();
  expect(body.fighters.length).toBeGreaterThan(0);
});

test("POST /api/revalidate sin token → rechazado (no revalida sin auth)", async ({ request }) => {
  const res = await request.post("/api/revalidate", { data: {} });
  // Rechaza sin el secreto correcto: 401/403 en prod (secreto configurado) o
  // 503 en local si REVALIDATE_SECRET no está puesto. Lo importante: NO revalida
  // (nunca 2xx) sin autorización.
  expect(res.status(), `esperado un rechazo (>=400), fue ${res.status()}`).toBeGreaterThanOrEqual(400);
});

for (const path of ["/api/predict", "/api/maestro"]) {
  test(`POST ${path} con cuerpo inválido → 4xx (contrato, sin gastar modelo)`, async ({ request }) => {
    const res = await request.post(path, { data: {} });
    // Contrato: una petición vacía se rechaza con error de cliente ANTES de
    // llamar al modelo. Un 5xx aquí seria un bug real que queremos ver.
    expect(res.status(), `HTTP ${res.status()} en ${path}`).toBeGreaterThanOrEqual(400);
    expect(res.status(), `5xx en ${path} (¿crash?)`).toBeLessThan(500);
  });
}
