import { test, expect } from "@playwright/test";

import { aislarDeTerceros, observarViolacionesCsp } from "./helpers";

// PUERTA DE LA FASE 6. Existe porque el megatest NO basta para validarla: una
// página cuya canónica o cuyo JSON-LD hayan desaparecido sigue devolviendo 200,
// sin error boundary y sin desbordarse, así que las 6 puertas saldrían VERDES
// con la fase entera inoperativa.
//
// Se comprueba sobre el HTML SERVIDO (request.get), no sobre el DOM, por dos
// razones: es lo que ve el rastreador de Google —que no ejecuta React— y evita
// cualquier carrera con la hidratación, que es lo que hacía inestable a
// /compare.
//
// AVISO IMPORTANTE PARA QUIEN TOQUE ESTO: `notFound()` en esta versión de Next
// devuelve HTTP **200**, no 404 (comprobado en producción el 28-jul-2026:
// /fighters/999999 → 200 + <title>Luchador no encontrado</title>). Por eso aquí
// NO se asserta por código de estado: un aserto de `status < 400` daría verde
// contra una página de "no encontrado". Se assertan CONTENIDOS.

// Estos asertos no dependen del viewport ni del tema: se corren una sola vez.
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "asertos de SEO: se corren solo en un proyecto",
  );
});

function extraerCanonica(html: string): string | null {
  const match = html.match(/<link[^>]+rel="canonical"[^>]*>/i);
  if (!match) return null;
  const href = match[0].match(/href="([^"]+)"/i);
  return href ? href[1] : null;
}

function extraerJsonLd(html: string): unknown[] {
  const bloques = html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  );
  return Array.from(bloques, (m) => JSON.parse(m[1]));
}

// IDs estables que existen en producción, los mismos que usa routes.spec.ts.
const RUTAS_CON_CANONICA = [
  { ruta: "/fighters/6493", esperada: "/fighters/6493" },
  { ruta: "/eventos/357", esperada: "/eventos/357" },
  { ruta: "/fights/3821", esperada: "/fights/3821" },
  // Regresión de la fase 5a: las estáticas ya la tenían y deben conservarla.
  { ruta: "/fighters", esperada: "/fighters" },
  // Fase 7.
  { ruta: "/ufc-hoy", esperada: "/ufc-hoy" },
];

for (const { ruta, esperada } of RUTAS_CON_CANONICA) {
  test(`${ruta} declara su canónica absoluta`, async ({ request }) => {
    const html = await (await request.get(ruta)).text();
    const canonica = extraerCanonica(html);

    expect(canonica, `${ruta} no tiene <link rel="canonical">`).not.toBeNull();
    // Absoluta y con esquema: una canónica relativa no sirve para consolidar.
    expect(canonica, `canónica no absoluta en ${ruta}: ${canonica}`).toMatch(/^https?:\/\//);
    expect(new URL(canonica!).pathname, `canónica apunta a otra ruta desde ${ruta}`).toBe(
      esperada,
    );
  });
}

// El caso que motivó la canónica: los ceros a la izquierda sirven la MISMA
// página con un 200. Sin canónica normalizada son duplicados compitiendo entre
// sí en Google. Comprobado en producción antes de escribir el arreglo.
//
// Van las TRES rutas, no solo la de luchador: si alguien "simplifica" el
// `/eventos/${eventId}` a `/eventos/${id}` (la variable de la ruta está en
// ámbito dos líneas más arriba y el cambio parece inocuo), /eventos/357 seguiría
// dando la canónica correcta y solo /eventos/0357 lo delataría.
const CEROS_A_LA_IZQUIERDA = [
  { ruta: "/fighters/06493", canonica: "/fighters/6493" },
  { ruta: "/fighters/006493", canonica: "/fighters/6493" },
  { ruta: "/eventos/0357", canonica: "/eventos/357" },
  { ruta: "/fights/03821", canonica: "/fights/3821" },
];

for (const { ruta, canonica: esperada } of CEROS_A_LA_IZQUIERDA) {
  test(`${ruta} consolida en la canónica sin ceros`, async ({ request }) => {
    const html = await (await request.get(ruta)).text();
    const canonica = extraerCanonica(html);

    expect(canonica, `${ruta} no tiene canónica`).not.toBeNull();
    expect(new URL(canonica!).pathname, `${ruta} no consolida`).toBe(esperada);
  });
}

// Una página de "no encontrado" devuelve 200 y no debe reclamarse canónica de
// nada: sería declararle a Google que ESA es la versión buena de algo que no
// existe.
test("las páginas de no encontrado NO llevan canónica", async ({ request }) => {
  for (const ruta of ["/fighters/999999", "/eventos/999999", "/fights/999999"]) {
    const html = await (await request.get(ruta)).text();

    expect(extraerCanonica(html), `${ruta} no debería tener canónica`).toBeNull();
    // Y Next debe seguir marcándolas noindex por su cuenta. Se comprueba el
    // VALOR, no solo que exista la etiqueta: un `content="index,follow"` también
    // contendría `name="robots"` y sería exactamente lo contrario.
    const robots = html.match(/<meta name="robots"[^>]*content="([^"]*)"/i)?.[1];
    expect(robots, `${ruta} perdió la etiqueta robots`).toBeTruthy();
    expect(robots, `${ruta} ya no está en noindex: "${robots}"`).toContain("noindex");
  }
});

test("/eventos/357 emite un SportsEvent con fecha, sede y cartelera", async ({ request }) => {
  const html = await (await request.get("/eventos/357")).text();
  const bloques = extraerJsonLd(html);

  expect(bloques, "no hay ningún bloque JSON-LD en /eventos/357").toHaveLength(1);
  const ld = bloques[0] as Record<string, unknown>;

  expect(ld["@context"]).toBe("https://schema.org");
  expect(ld["@type"]).toBe("SportsEvent");
  expect(ld.name, "SportsEvent sin nombre").toBeTruthy();
  // Los tres campos que Google exige para el resultado enriquecido de Event.
  expect(ld.startDate, "SportsEvent sin startDate").toBeTruthy();
  expect(ld.location, "SportsEvent sin sede").toBeTruthy();
  expect(ld.url).toMatch(/\/eventos\/357$/);

  // La cartelera: es lo que ata el evento con las fichas de combate y luchador.
  const subEventos = ld.subEvent as Record<string, unknown>[];
  expect(subEventos.length, "SportsEvent sin combates dentro").toBeGreaterThan(0);
  expect(subEventos[0].url, "un combate del cartel sin URL").toMatch(/\/fights\/\d+$/);
  expect(
    (subEventos[0].competitor as unknown[]).length,
    "un combate sin sus dos esquinas",
  ).toBe(2);
});

test("/fighters/6493 emite un Person con récord y URL canónica", async ({ request }) => {
  const html = await (await request.get("/fighters/6493")).text();
  const bloques = extraerJsonLd(html);

  expect(bloques, "no hay ningún bloque JSON-LD en /fighters/6493").toHaveLength(1);
  const ld = bloques[0] as Record<string, unknown>;

  expect(ld["@context"]).toBe("https://schema.org");
  expect(ld["@type"]).toBe("Person");
  expect(ld.name, "Person sin nombre").toBeTruthy();
  expect(ld.description, "Person sin el récord en la descripción").toMatch(/\d+-\d+-\d+/);
  // La URL del marcado y la canónica tienen que contar lo MISMO, o Google recibe
  // dos señales en conflicto sobre cuál es la página buena.
  expect(ld.url).toBe(extraerCanonica(html));
});

// El bloque JSON-LD viaja dentro del HTML, así que un nombre con "</script>"
// cerraría la etiqueta antes de tiempo y convertiría el resto del JSON en HTML.
// El módulo escapa "<"; esto vigila que el escape siga puesto en la página real.
//
// EL ASERTO ES `JSON.parse`, NO "no contiene </". Y la diferencia importa: la
// expresión que extrae el bloque es NO CODICIOSA, así que ante un `</script>`
// inyectado la captura se corta JUSTO ANTES — el texto capturado nunca podría
// contener `</` y ese aserto sería incapaz de fallar. Lo que sí delata la
// inyección es que el trozo truncado deja de ser JSON válido.
test("el JSON-LD no puede cerrar su propia etiqueta", async ({ request }) => {
  for (const ruta of ["/eventos/357", "/fighters/6493"]) {
    const html = await (await request.get(ruta)).text();
    const crudo = html.match(
      /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
    )?.[1];

    expect(crudo, `no hay bloque JSON-LD en ${ruta}`).toBeTruthy();
    expect(
      () => JSON.parse(crudo!),
      `el bloque de ${ruta} está truncado: hay un </script> sin escapar dentro`,
    ).not.toThrow();
    expect(crudo, `el bloque de ${ruta} perdió su @type`).toContain('"@type"');
  }
});

// LO QUE ESTABA ESCRITO EN TRES DOCUMENTOS Y ERA FALSO: que la CSP (script-src
// con nonce y sin 'unsafe-inline') bloquea los bloques ld+json. No los bloquea,
// porque son datos y el navegador no los ejecuta nunca. Este test lo deja
// clavado: si algún día alguien "arregla" la CSP y de paso rompe algo, o si
// aparece un script inline sin nonce de verdad, sale en rojo aquí.
test("las páginas con datos estructurados no generan ni una violación de CSP", async ({
  page,
  baseURL,
  request,
}) => {
  // Primero, que HAYA política. "Cero violaciones" es verdad trivialmente en una
  // página sin CSP: sin esta comprobación, borrar la cabecera dejaría el test en
  // verde y sin nada que vigilar.
  const cabeceras = (await request.get("/fighters/6493")).headers();
  expect(
    cabeceras["content-security-policy"],
    "la respuesta no trae Content-Security-Policy: no hay nada que comprobar",
  ).toContain("script-src");

  const csp = observarViolacionesCsp(page);
  await aislarDeTerceros(page, baseURL);

  for (const ruta of ["/eventos/357", "/fighters/6493", "/fights/3821"]) {
    await page.goto(ruta, { waitUntil: "load" });
    // Ya sin terceros, "sin tráfico pendiente" es una señal rápida y estable, y
    // hace falta: los chunks de Next se ejecutan tras la hidratación, así que
    // una violación tardía no se vería solo con el evento `load`.
    await page.waitForLoadState("networkidle");
  }

  csp.expectCero("las tres rutas con datos estructurados");
});

// FASE 7 — invariantes de /ufc-hoy.
//
// Lo que NO se puede probar aquí: "aparece SÍ". La respuesta depende del día, y
// un test así sería verde un día de cada siete y rojo los otros seis. La lógica
// del veredicto se prueba en src/lib/ufc-today.test.ts con la hora inyectada;
// aquí solo se comprueba lo que debe ser cierto SIEMPRE.
test("/ufc-hoy responde con un veredicto, sea cual sea el día", async ({ request }) => {
  const respuesta = await request.get("/ufc-hoy");
  const html = await respuesta.text();

  // El código de estado no dice nada: notFound() también devuelve 200 en esta
  // versión de Next. Lo que demuestra que la página está viva es su contenido.
  expect(html, "no está el H1: ¿está sirviéndose una página de 'no encontrado'?").toContain(
    "¿Hay UFC hoy?",
  );

  // Exactamente UN veredicto. Ni cero (la página no responde a lo que promete)
  // ni dos (habría dos respuestas contradictorias en la misma pantalla).
  const veredictos = html.match(/>(Sí|No)<\/p>/g) ?? [];
  expect(veredictos, `veredictos encontrados: ${veredictos.join(", ") || "ninguno"}`).toHaveLength(
    1,
  );

  // Y la frase que lo explica, que es lo que de verdad lee la gente.
  expect(html).toMatch(
    /(Hay UFC ahora mismo|Hoy hay UFC|Hoy ha habido UFC|Esta madrugada hay UFC|Hoy no hay UFC)/,
  );

  // El título NO puede llevar el veredicto: el snippet de Google es el de su
  // última pasada y diría "no" seis días de cada siete.
  const titulo = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  expect(titulo).toContain("¿Hay UFC hoy?");
  expect(titulo, `el título lleva el veredicto dentro: ${titulo}`).not.toMatch(/\b(Sí|No)\b/);

  // Con velada en el calendario tiene que haber una hora peninsular. Si algún
  // día no hubiera ninguna anunciada, la página lo dice y no se exige hora.
  if (!html.includes("no hay ninguna velada anunciada")) {
    expect(html, "hay velada anunciada pero ninguna hora en pantalla").toMatch(
      /\b([01]\d|2[0-3]):[0-5]\d\b/,
    );
    expect(html, "falta el aviso de que las horas son peninsulares").toContain(
      "Horarios de España",
    );
  }
});

// PUERTA DE LA FASE 7. El test de arriba solo hace `page.goto`, o sea: solo mira
// la PRIMERA carga de tres rutas fijas. La analítica se inserta desde el cliente
// y sigue viva mientras el usuario navega por enlaces, que en App Router NO
// recargan el documento. Este test cubre ese camino, que no cubría nadie.
//
// Y assertar "cero violaciones" a secas no valdría: sería verde también si la
// analítica no estuviera montada. Por eso comprueba antes que el script EXISTE.
test("la analítica se inserta y navegar por enlaces no genera violaciones de CSP", async ({
  page,
  baseURL,
}) => {
  const csp = observarViolacionesCsp(page);
  await aislarDeTerceros(page, baseURL);

  await page.goto("/", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  // El <script> de la analítica no viaja en el HTML: lo crea su bundle de
  // cliente con document.createElement. Que aparezca aquí demuestra dos cosas a
  // la vez: que <Analytics /> sigue montado en el layout, y que 'strict-dynamic'
  // propaga la confianza del bundle (que sí lleva nonce) al script insertado.
  //
  // La ruta NO se fija a propósito: en local es /_vercel/insights/script.js,
  // pero en producción Vercel lo sirve bajo una ruta con hash
  // (/<hash>/script.js) para que los bloqueadores no lo tumben por lista.
  // Comprobado el 30-jul contra mmastatus.app. Un aserto con la ruta de local
  // dentro habría dado verde vigilando algo que en producción no existe.
  //
  // expect.poll porque el script se inserta en un efecto, después de hidratar.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Array.from(document.head.querySelectorAll("script")).filter(
            (s) => s.src.startsWith(location.origin) && s.src.endsWith("/script.js"),
          ).length,
        ),
      { message: "no hay script de analítica en el head: ¿se cayó <Analytics /> del layout?" },
    )
    .toBe(1);

  // Y que la cola de la analítica quedó inicializada, que es lo que recoge los
  // eventos hasta que el script termina de cargar.
  expect(
    await page.evaluate(() => typeof (window as unknown as { va?: unknown }).va),
    "window.va no existe: la analítica no llegó a inicializarse",
  ).toBe("function");

  // OJO: en local ese script devuelve 404 — lo sirve la plataforma, no la app —
  // así que aquí NO se comprueba que cargue ni que cuente. Eso se verifica en
  // producción con el navegador (30-jul: POST .../view → 200).

  csp.expectCero("la carga inicial de /");

  // Navegación BLANDA: el documento no se reemplaza, así que un script que se
  // insertara aquí no tendría el nonce del HTML inicial. Es el punto ciego que
  // tenía la suite.
  await page.getByRole("link", { name: "Eventos", exact: true }).first().click();
  await page.waitForURL("**/eventos");
  await page.waitForLoadState("networkidle");

  csp.expectCero("la navegación blanda de / a /eventos");
});
