import { test, expect } from "@playwright/test";

import { collectHeadshots, expectNoHorizontalOverflow } from "./helpers";

// Las 19 rutas de página (16 + las dos legales y /contacto del 2-ago). Las dinámicas usan IDs ESTABLES que existen en prod:
// evento 357 (UFC 306), luchador 6493 (ya lo vigila monitor.yml), combate 3821
// (Merab vs O'Malley, de UFC 306). Si alguno desapareciera, su test fallaría con
// un 404 claro en vez de un falso verde.
// /compare NO está en esta lista a propósito: no es una página, es un redirect a
// /enfrentamiento (que sí se prueba aquí abajo). Medir su desbordamiento no medía
// nada útil y era la ÚNICA de las rutas cuyo documento se reemplaza a sí mismo
// justo después del `load`, lo que la hacía inestable. Tiene su propio test al
// final del fichero, que además cubre el remapeo de parámetros que hoy no probaba
// nadie.
const ROUTES = [
  "/",
  "/aviso-legal",
  "/clasificacion",
  "/contacto",
  "/en-vivo",
  "/enfrentamiento",
  "/eventos",
  "/eventos/357",
  "/fighters",
  "/fighters/6493",
  "/fights/3821",
  "/gimnasios",
  "/maestro",
  "/predict",
  "/privacidad",
  "/salon-de-la-fama",
  "/tendencias",
  "/ufc-hoy",
  "/videos",
];

for (const route of ROUTES) {
  test(`ruta ${route} renderiza sin desbordamiento`, async ({ page }, testInfo) => {
    const response = await page.goto(route, { waitUntil: "load" });
    // Asserto DURO 1: la página responde (no 4xx/5xx ni error de servidor).
    expect(response, `sin respuesta HTTP en ${route}`).not.toBeNull();
    expect(response!.status(), `HTTP ${response!.status()} en ${route}`).toBeLessThan(400);

    // Asserto DURO 2: sin error boundary de React ("Algo salió mal" del error.tsx).
    await expect(
      page.getByText(/Algo salió mal|Application error/i),
      `error boundary visible en ${route}`,
    ).toHaveCount(0);

    // Asserto DURO 3: sin desbordamiento horizontal.
    await expectNoHorizontalOverflow(page, route);

    // INFO: cobertura de fotos (siluetas = WARNING, no fallo).
    const shots = await collectHeadshots(page);
    testInfo.annotations.push({
      type: "headshots",
      description: `${route} → fotos:${shots.photos} siluetas:${shots.silhouettes} sin-cargar:${shots.brokenExternal}`,
    });
  });
}

// El comparador vivía en /compare y se fusionó con /enfrentamiento. La ruta vieja
// sigue existiendo para no romper enlaces de fuera, y de paso traduce los
// parámetros antiguos (?a=&b=) a la semántica de esquinas (?red=&blue=). Esa
// traducción no la comprobaba nadie: si se rompiera, un enlace antiguo llevaría al
// comparador VACÍO en vez de a la pareja pedida, sin dar ningún error.
//
// Se comprueba la URL final y no el código HTTP a propósito: `permanentRedirect`
// en un Server Component NO devuelve un 308; Next sirve un 200 con la orden de
// redirigir dentro del payload de React y el salto lo da el cliente.
test("/compare lleva a /enfrentamiento traduciendo los parámetros antiguos", async ({ page }) => {
  await page.goto("/compare?a=6493&b=3821");
  await page.waitForURL(/\/enfrentamiento(\?|$)/);

  const url = new URL(page.url());
  expect(url.pathname, "no acabó en /enfrentamiento").toBe("/enfrentamiento");
  expect(url.searchParams.get("red"), "el parámetro a= no se tradujo a red=").toBe("6493");
  expect(url.searchParams.get("blue"), "el parámetro b= no se tradujo a blue=").toBe("3821");
  expect(url.searchParams.has("a"), "el parámetro antiguo a= sigue ahí").toBe(false);
  expect(url.searchParams.has("b"), "el parámetro antiguo b= sigue ahí").toBe(false);
});

test("/compare sin parámetros lleva a /enfrentamiento limpio", async ({ page }) => {
  await page.goto("/compare");
  await page.waitForURL(/\/enfrentamiento(\?|$)/);
  expect(new URL(page.url()).pathname).toBe("/enfrentamiento");
});

// FASE 9. El desglose por asaltos existe para 8.738 combates, pero si un día se
// cayera de la ficha (un cambio en la query, un `return null` de más) la página
// seguiría dando 200, sin error boundary y sin desbordarse: las tres cosas que
// mira el bucle de rutas de arriba. Este test comprueba que la sección está y
// que trae sus totales, que es lo que la distingue de la tabla que había antes.
test("la ficha de combate trae el asalto a asalto con sus totales", async ({ page }) => {
  // 3821 es uno de los ids estables que ya usa toda la suite: 5 asaltos, a
  // decisión unánime.
  await page.goto("/fights/3821", { waitUntil: "load" });

  const seccion = page.locator("section").filter({ hasText: "Asalto a asalto" });
  await expect(seccion, "no está la sección del asalto a asalto").toHaveCount(1);

  // Los cinco asaltos y la fila de totales.
  await expect(seccion.getByText(/^Asalto 5$/)).toHaveCount(1);
  await expect(
    seccion.getByText(/Total del combate/i),
    "faltan los totales: son lo que permite cuadrar con las estadísticas del combate",
  ).toHaveCount(1);

  // Y que NO se confunda con la función estrella, que va justo encima.
  await expect(
    seccion.getByText(/La película del combate/i),
    "el asalto a asalto se ha comido a la película del combate",
  ).toHaveCount(0);
});

test("/eventos lista al menos un evento (no solo el estado vacío)", async ({ page }) => {
  await page.goto("/eventos", { waitUntil: "load" });
  // La vista por defecto es "Próximos". Debe haber ≥1 enlace a una ficha de
  // evento, o el estado vacío explícito (aceptable si de verdad no hay próximos).
  const eventLinks = page.locator('a[href^="/eventos/"]');
  const empty = page.getByText(/Aún no hay próximos eventos/i);
  const [links, isEmpty] = await Promise.all([eventLinks.count(), empty.count()]);
  expect(links > 0 || isEmpty > 0, "ni eventos ni estado vacío en /eventos").toBeTruthy();
});

// EL PANEL DE ESTADO TIENE QUE SER INVISIBLE, no solo inaccesible. El dueño lo
// pidió así: "que nadie tenga acceso a eso ni que sepan que en la web está eso".
//
// Este test existe porque el primer intento NO cumplía: llamar a `notFound()`
// dentro de la página devolvía HTTP 200 (en esta versión de Next la página de
// "no encontrado" responde 200), mientras que una URL inexistente devolvía 404.
// Bastaba comparar los dos códigos para descubrir que /estado existía. Se
// arregló en el proxy, y esto lo deja clavado: si alguien quita ese guard, aquí
// salta.
test("/estado es indistinguible de una URL que no existe", async ({ request }) => {
  const inventada = await request.get("/una-ruta-que-no-existe-98765", {
    maxRedirects: 0,
  });
  const sinClave = await request.get("/estado", { maxRedirects: 0 });
  const claveMala = await request.get("/estado?k=esta-clave-no-vale", {
    maxRedirects: 0,
  });

  expect(inventada.status(), "una URL inventada debería dar 404").toBe(404);
  expect(
    sinClave.status(),
    "/estado sin clave delata que la ruta existe: debe responder igual que una URL inventada",
  ).toBe(inventada.status());
  expect(
    claveMala.status(),
    "/estado con clave incorrecta delata que la ruta existe",
  ).toBe(inventada.status());

  // Y que no se cuele ni un rastro del panel en el cuerpo.
  const cuerpo = await sinClave.text();
  expect(cuerpo).not.toContain("Estado del sistema");
  expect(cuerpo).not.toContain("El turno de guardia");
});

// El JSON del panel es lo que lee el guardián, así que su puerta importa igual.
test("/api/estado no contesta sin la clave", async ({ request }) => {
  const r = await request.get("/api/estado", { maxRedirects: 0 });
  expect(r.status(), "el JSON del panel debe esconderse igual que la página").toBe(404);
});

// Y esconderse NO es solo devolver 404. Hasta el 2-ago la página estaba bien
// tapada pero su hermana JSON se identificaba sola: devolvía un 404 VACÍO
// (`Content-Length: 0`, sin `Content-Type`) mientras cualquier otra ruta /api
// inexistente devuelve el 404 HTML de ~81 KB. Cinco señales, y un escaneo de
// rutas encontraba el panel. Se compara contra otra ruta /api DE LA MISMA
// LONGITUD, porque el HTML de "no encontrado" incrusta el path y un nombre más
// largo cambia el tamaño por sí solo.
test("/api/estado es indistinguible de otro endpoint que no existe", async ({ request }) => {
  const oculta = await request.get("/api/estado", { maxRedirects: 0 });
  const inventada = await request.get("/api/estadz", { maxRedirects: 0 }); // 6 letras, igual que "estado"

  expect(inventada.status()).toBe(404);
  expect(oculta.status()).toBe(inventada.status());

  const cabecerasQueDelatan = ["content-type", "x-powered-by", "vary", "cache-control"];
  for (const nombre of cabecerasQueDelatan) {
    expect(
      oculta.headers()[nombre],
      `la cabecera ${nombre} distingue /api/estado de una ruta inventada`,
    ).toBe(inventada.headers()[nombre]);
  }

  // La CSP es la trampa fina: el proxy SÍ corre sobre /api/estado, y ponerle la
  // cabecera sería crear una señal nueva justo al tapar la vieja — el mismo
  // error que se cometió en julio con el tamaño del HTML.
  expect(
    oculta.headers()["content-security-policy"],
    "una CSP aquí delataría que el proxy trata esta ruta de forma especial",
  ).toBe(inventada.headers()["content-security-policy"]);

  const cuerpoOculto = await oculta.body();
  const cuerpoInventado = await inventada.body();
  expect(
    cuerpoOculto.length,
    "el TAMAÑO del cuerpo por sí solo delataba la ruta",
  ).toBe(cuerpoInventado.length);
  expect(cuerpoOculto.toString()).not.toContain("El turno de guardia");
});

// ── El pie, el sitemap y las páginas legales (bloques 2 y 3, 2-ago) ─────────
// El pie enseñaba 6 de las 15 rutas públicas y el sitemap 8: media web sin un
// solo enlace interno. Estos tests dejan clavado lo que debe estar Y, sobre
// todo, LO QUE NO — que es donde de verdad duele equivocarse.

test("el pie enlaza las rutas que antes no tenían ni un enlace interno", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  for (const href of [
    "/en-vivo",
    "/maestro",
    "/videos",
    "/gimnasios",
    "/salon-de-la-fama",
    "/aviso-legal",
    "/privacidad",
    "/creditos",
  ]) {
    await expect(
      footer.locator(`a[href="${href}"]`),
      `el pie no enlaza ${href}`,
    ).toHaveCount(1);
  }
});

test("el pie ya no anuncia el motor de base de datos", async ({ page }) => {
  await page.goto("/");
  // Encargo del dueño del 31-jul: no le dice nada al visitante y le regala la
  // infraestructura a quien mira con otras intenciones.
  await expect(page.locator("footer")).not.toContainText(/Neon|PostgreSQL/i);
});

test("el pie NO enlaza el panel oculto", async ({ page }) => {
  await page.goto("/");
  // Enlazarlo sería exactamente el cartel que se evita al no ponerlo en
  // robots.txt. Si alguien añade /estado al pie, este test lo caza.
  await expect(page.locator('footer a[href*="estado"]')).toHaveCount(0);
});

test("el sitemap lista las rutas nuevas y sigue callando las que debe", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();

  // La base se saca del PROPIO sitemap y no se fija a mano: `SITE_URL` puede
  // valer una cosa en el portátil y otra en el CI, y un dominio incrustado aquí
  // convertiría este test en un falso rojo la primera vez que alguien la cambie.
  const base = xml.match(/<loc>(https?:\/\/[^/<]+)/u)?.[1];
  expect(base, "el sitemap no trae ni una URL absoluta").toBeTruthy();

  const rutas = [...xml.matchAll(/<loc>[^<]*?(\/[^<]*)?<\/loc>/gu)].map((m) =>
    (m[0].replace(/<\/?loc>/gu, "").replace(base!, "") || "/"),
  );

  for (const ruta of [
    "/videos",
    "/gimnasios",
    "/salon-de-la-fama",
    "/maestro",
    "/creditos",
    "/aviso-legal",
    "/privacidad",
  ]) {
    expect(rutas, `falta ${ruta} en el sitemap`).toContain(ruta);
  }

  // Lo importante son las EXCLUSIONES: /estado es un panel oculto y meterlo aquí
  // sería el cartel que se evita al no ponerlo en robots.txt; /offline es la
  // página de "sin conexión" y no debe salir en Google; /compare y /predict son
  // redirecciones permanentes a /enfrentamiento.
  for (const prohibida of ["/estado", "/offline", "/compare", "/predict"]) {
    expect(rutas, `${prohibida} NO debería estar en el sitemap`).not.toContain(prohibida);
  }
});

test("las páginas legales dicen algo, no solo responden 200", async ({ page }) => {
  // notFound() devuelve HTTP 200 en esta versión de Next: un aserto de status
  // aprobaría una página de "no encontrado". Se asserta CONTENIDO.
  await page.goto("/aviso-legal");
  await expect(page.getByRole("heading", { name: /Aviso legal/i, level: 1 })).toBeVisible();
  await expect(page.locator("body")).toContainText(/no está afiliada/i);

  await page.goto("/privacidad");
  await expect(page.getByRole("heading", { name: /Privacidad/i, level: 1 })).toBeVisible();
  await expect(page.locator("body")).toContainText(/no usa cookies/i);
});

// ── /contacto (bloque 4, 2-ago) ────────────────────────────────────────────
// La ÚNICA ruta de toda la web que escribe en la base de datos. Va contra un
// pool aparte con un rol que solo puede INSERT sobre contact_messages.
//
// A propósito NO se prueba aquí el envío bueno: el megatest corre contra la
// Neon REAL y dejaría basura en la tabla del dueño. Ese camino se verifica a
// mano. Lo que sí se prueba es todo lo que puede fallar sin escribir nada.

test("/contacto pinta el formulario, no solo responde 200", async ({ page }) => {
  await page.goto("/contacto");
  await expect(page.getByRole("heading", { name: /^Contacto$/i, level: 1 })).toBeVisible();
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#mensaje")).toBeVisible();
  await expect(page.getByRole("button", { name: /Enviar mensaje/i })).toBeVisible();
});

test("el campo trampa está fuera del alcance de una persona", async ({ page }) => {
  await page.goto("/contacto");
  const trampa = page.locator("#web");

  // OJO CON `toBeHidden()` AQUÍ: no vale. El campo va fuera de pantalla a
  // propósito y NO con `display:none`, porque ese es el patrón que los robots
  // buenos detectan y se saltan. Playwright llama "visible" a todo lo que tenga
  // caja, así que se comprueba lo que de verdad importa: que ninguna persona
  // pueda llegar a él ni enterarse de que existe.
  const caja = await trampa.boundingBox();
  expect(caja, "el campo trampa debe existir en el HTML").not.toBeNull();
  expect(caja!.x + caja!.width, "debe quedar fuera de la pantalla").toBeLessThan(0);

  // Ni con el teclado ni con un lector de pantalla.
  await expect(trampa).toHaveAttribute("tabindex", "-1");
  await expect(trampa).toHaveAttribute("autocomplete", "off");
  await expect(
    page.locator('[aria-hidden="true"]').locator("#web"),
    "debe estar fuera del árbol de accesibilidad",
  ).toHaveCount(1);
});

// Los tests de contrato de /api/contacto viven en `api.spec.ts`, no aqui: el
// limite de peticiones es POR IP y se comparte entre los SEIS proyectos de
// Playwright, asi que repetir los POST en todos agotaba la rafaga de 5/10 s y
// el sexto recibia un 429. api.spec.ts ya corre en un solo proyecto.
