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

// ── /contacto: la unica ruta que escribe en la base de datos (2-ago) ───────
// Se prueba a nivel de CONTRATO y con la trampa de robots, que NO llega a
// tocar la base: un envio bueno dejaria basura en la tabla real del dueno.
test("/api/contacto rechaza lo que no vale, sin escribir nada", async ({ request }) => {
  // TRES casos y no cuatro a proposito: el limite de rafaga es de 5
  // peticiones cada 10 s por IP y en este fichero hay otro POST (el del
  // robot). Con cuatro se rozaba el tope y el ultimo salia 429 a veces.
  const malos = [
    { caso: "sin correo", cuerpo: { mensaje: "Un mensaje suficientemente largo." } },
    { caso: "correo inválido", cuerpo: { email: "ana", mensaje: "Un mensaje suficientemente largo." } },
    { caso: "mensaje corto", cuerpo: { email: "a@b.co", mensaje: "corto" } },
  ];
  for (const { caso, cuerpo } of malos) {
    const r = await request.post("/api/contacto", { data: cuerpo });
    expect(r.status(), `deberia rechazar: ${caso}`).toBe(400);
    const json = (await r.json()) as { error?: string; ok?: boolean };
    expect(json.ok, caso).toBeUndefined();
    expect(json.error, caso).toBeTruthy();
  }
});

test("un robot que cae en la trampa recibe un OK falso y no escribe", async ({ request }) => {
  // Contestar 400 le enseñaría cuál es el campo que le delata y volvería
  // mañana sabiendo saltárselo. Este camino NO llega a tocar la base de datos.
  const r = await request.post("/api/contacto", {
    data: {
      email: "robot@spam.example",
      mensaje: "Compre seguidores baratos ahora mismo aqui.",
      web: "http://spam.example",
    },
  });
  expect(r.status()).toBe(200);
  expect((await r.json()).ok).toBe(true);
});

test("/api/contacto no acepta GET", async ({ request }) => {
  const r = await request.get("/api/contacto");
  expect(r.status(), "solo POST: un GET no debe llegar al pool de escritura").toBeGreaterThanOrEqual(
    400,
  );
});
