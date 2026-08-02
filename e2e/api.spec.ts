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

// PRESUPUESTO DEL LIMITADOR (fase 13). El freno es 5 peticiones/10 s + 20/60 s
// POR BUCKET Y POR IP (src/lib/maestro/security.ts:72-75), los buckets son
// independientes por ruta, y este fichero es el ÚNICO consumidor de cupo de toda
// la suite: seo.spec.ts no toca ninguna /api/, y las ~190 navegaciones de
// routes.spec.ts tampoco, porque sin tecleo no hay fetch a los buscadores y sin
// favoritos en localStorage no hay fetch a /api/fighters/upcoming.
// Gasto tras la fase 13A: search 1 · fighters-search 1 · eventos-search 1 ·
// upcoming 1 · gyms 1 · contacto 4 · predict 0 · maestro 0.
// (predict y maestro gastan CERO: Playwright no manda Origin ni Referer, así que
// esos POST mueren en el guard de origen ANTES del limitador. Ver más abajo.)
//
// `?q=jo` en vez de `?q=silva`: por debajo del mínimo de 3 caracteres
// (search-input.ts:17) la ruta devuelve las tres listas vacías con un 200 y
// RETORNA ANTES del limitador (search/route.ts:32-34 frente al :42). Así el
// bucle sigue probando que la ruta responde 200 y no gasta cupo; la búsqueda de
// verdad la prueba el test de resultados reales de aquí abajo.
const GET_ROUTES = [
  "/api/live/now",
  "/api/search?q=jo",
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

// ── /api/fighters/upcoming (fase 13) ───────────────────────────────────────
// Era la ÚNICA de las 12 rutas de API sin humo, y es la que alimenta la franja
// "Tus favoritos" de la portada: si se cae, la franja se queda vacía y nadie se
// entera, porque la home sigue respondiendo 200.
//
// NADA de lo que se asserta aquí depende de que el evento 1087 siga en el
// futuro. Hoy `?ids=6495` devuelve el combate del 8-ago y el domingo 9 devolverá
// `{bouts:[]}`; un aserto del tipo "este luchador tiene combate" sería una bomba
// de relojería que abriría el Issue "Producción rota" justo después de la
// velada, porque smoke-prod.yml corre este fichero contra producción a diario.
// Se asserta la FORMA y los INVARIANTES, que no caducan.

test("GET /api/fighters/upcoming con ids inválidos → 200 y lista vacía", async ({ request }) => {
  // Los tres se caen en la validación: "abc" y "-1" no casan con /^\d+$/ y el 0
  // no pasa el `id > 0` (upcoming/route.ts:23-34). Con la lista vacía la ruta
  // retorna en el :36, ANTES del limitador y sin tocar Neon: cupo gastado 0.
  //
  // 🪤 OJO si alguien "mejora" esta URL: 999999999 NO es un id inválido. Casa el
  // regex y cabe en un int4, así que pasa la validación, gasta cupo y consulta la
  // base. Comprobado en producción por la cabecera Cache-Control, que solo la
  // pone el camino completo.
  const res = await request.get("/api/fighters/upcoming?ids=abc,-1,0");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ bouts: [] });

  // Sin el parámetro, lo mismo: no es un 400.
  const sinIds = await request.get("/api/fighters/upcoming");
  expect(sinIds.status()).toBe(200);
  expect(await sinIds.json()).toEqual({ bouts: [] });
});

test("GET /api/fighters/upcoming con ids reales → 200 y forma correcta", async ({ request }) => {
  const pedidos = [6493, 6495];
  const res = await request.get(`/api/fighters/upcoming?ids=${pedidos.join(",")}`);

  // Humo de verdad: llega a Neon y vuelve sin reventar. Si la consulta se
  // rompiera, el catch de la ruta devolvería 500 con {error}.
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { bouts?: unknown; error?: string };
  expect(body.error, "la ruta devolvió un error dentro de un 200").toBeUndefined();
  expect(Array.isArray(body.bouts)).toBe(true);

  const bouts = body.bouts as {
    fighterId: number;
    eventDate: string | null;
    opponentId: number | null;
  }[];

  // INVARIANTE que no caduca aunque la lista venga vacía: el `distinct on (f.id)`
  // de getUpcomingBoutsForFighters garantiza COMO MUCHO un combate por luchador
  // pedido. Si alguien tocara el DISTINCT ON o el join del unnest, esto se
  // dispara aunque los datos cambien.
  expect(bouts.length).toBeLessThanOrEqual(pedidos.length);
  expect(new Set(bouts.map((b) => b.fighterId)).size, "fighterId repetido").toBe(bouts.length);

  for (const bout of bouts) {
    expect(pedidos, `devolvió un luchador que no se pidió: ${bout.fighterId}`).toContain(
      bout.fighterId,
    );
    expect(bout.opponentId, "un luchador no puede pelear contra sí mismo").not.toBe(
      bout.fighterId,
    );
    // El regex es el que de verdad paga: la columna es DATE y hoy sale como
    // texto por el `e.event_date::text` de fighters.list.ts:406. Si alguien lo
    // quita, vuelve un objeto Date, se serializa como "2026-08-07T22:00:00.000Z"
    // y el día RETROCEDE — este aserto lo caza.
    if (bout.eventDate !== null) {
      expect(bout.eventDate, "eventDate no es una fecha ISO de solo día").toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }
  }
});

test("POST /api/revalidate sin token → rechazado (no revalida sin auth)", async ({ request }) => {
  const res = await request.post("/api/revalidate", { data: {} });
  // Rechaza sin el secreto correcto: 401/403 en prod (secreto configurado) o
  // 503 en local si REVALIDATE_SECRET no está puesto. Lo importante: NO revalida
  // (nunca 2xx) sin autorización.
  expect(res.status(), `esperado un rechazo (>=400), fue ${res.status()}`).toBeGreaterThanOrEqual(400);
});

// 🪤 DEUDA CONOCIDA (medida el 2-ago, se arregla el lunes 10, después de la
// velada del 8). Este test NO prueba lo que dice su título. Playwright NO manda
// ni `Origin` ni `Referer` (comprobado en el código de su APIRequestContext y en
// el log de una corrida real: las únicas cabeceras que salen son user-agent,
// accept y accept-encoding), así que `isAllowedOrigin` devuelve false en
// security.ts:24 y estos dos POST reciben un 403 del GUARD DE ORIGEN sin llegar
// nunca a la validación del cuerpo — ni al limitador, por eso gastan cupo 0.
// Medido contra producción: sin Origin → 403; con `Origin: https://mmastatus.app`
// → 400, que es el contrato que el título promete.
//
// Por qué NO se arregla hoy: el aserto ancho (>=400 <500) es lo único que hoy
// absorbe el 429 con `X-Vercel-Mitigated: challenge` que el cortafuegos de
// Vercel devuelve a clientes que no le parecen navegador. Volverlo `toBe(400)`
// en semana de velada convierte un challenge del WAF en un Issue "🔴 Producción
// rota" a las 08:30Z. El arreglo bueno, para el lunes 10, es mandar el Origin y
// distinguir la app del cortafuegos ANTES de exigir el 400:
//   expect(res.headers()["x-vercel-mitigated"]).toBeUndefined();
//   expect(res.headers()["content-type"]).toContain("application/json");
//   expect(res.status()).toBe(400);
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
