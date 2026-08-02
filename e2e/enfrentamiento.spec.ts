import { test, expect } from "@playwright/test";

// ── Fase 13B · /enfrentamiento y las DOS ramas de la predicción ────────────
//
// 🔴 NINGÚN TEST DE ESTE FICHERO LLAMA AL MICROSERVICIO. `/api/predict` se
// intercepta SIEMPRE con `page.route`, registrado ANTES del `goto`. Razones
// medidas, y las tres importan:
//   · el servicio de Render duerme y tarda ~56 s en despertar (maxDuration = 60
//     en predict/route.ts:14): un test real se comería el reloj del megatest;
//   · una llamada desde el NAVEGADOR sí manda Origin, así que pasa el guard y
//     GASTA cupo del limitador — al revés que los POST de api.spec.ts, que
//     mueren en el 403 y cuestan cero;
//   · y el Maestro cobra tokens de Anthropic por petición.
// Con el route puesto, la petición ni sale del navegador.
//
// ⚠️ UN SOLO PROYECTO. Aquí no hay nada que dependa del viewport y sí varias
// rutas con freno cerca.
//
// 💡 Este fichero NO gasta ni una petición real: la búsqueda de luchador ya la
// cubre `buscadores.spec.ts` con su única llamada a `/api/fighters/search`.
// Aquí se sirve con `page.route` para no subir ese bucket de 3/5 a 4/5.

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "escritorio-light",
    "la predicción no depende del viewport: un solo proyecto",
  );
});

const ROJO = { id: 6493, nombre: "Charles Oliveira" };
const AZUL = { id: 6495, nombre: "Mateusz Gamrot" };
const TERCERO = { id: 6344, nombre: "Quillan Salkilld" };
const PAREJA = `/enfrentamiento?red=${ROJO.id}&blue=${AZUL.id}`;

function perfil(id: number, name: string) {
  return {
    id,
    name,
    nickname: null,
    headshot_url: null,
    wins: 10,
    losses: 3,
    draws: 0,
    height_cm: 178,
    reach_cm: 188,
    stance: "Orthodox",
    latest_weight_class: "Lightweight",
    aggregate_stats: {
      sigStrikesLandedPerFight: 40,
      sigStrikeAccuracy: 0.5,
      knockdownsPerFight: 0.3,
      takedownsLandedPerFight: 1.2,
      takedownAccuracy: 0.4,
      submissionAttemptsPerFight: 1,
      controlTimePerFightSeconds: 120,
    },
  };
}

// 🔴 LOS IDs DEL MOCK TIENEN QUE SER LOS DE LA URL. `showPrediction`
// (matchup-client.tsx:207-213) compara `prediction.fighters.red.id` con la
// esquina roja y `blue.id` con la azul. Con otros ids el fetch va bien, no hay
// error, no hay banner... y NO SE PINTA NADA. El fixture del repo
// (src/lib/__fixtures__/predict-response.json) trae 1489/448, así que copiarlo
// tal cual daría una pantalla muda y horas de depuración.
const PREDICCION = {
  redProbability: 0.65,
  blueProbability: 0.35,
  lowConfidence: false,
  topFeatures: [
    { name: "sig_strikes_landed_per_fight", value: 1.2, contribution: 0.08, direction: "red" },
    { name: "takedown_defense", value: -0.4, contribution: -0.03, direction: "blue" },
    { name: "win_streak", value: 0.9, contribution: 0.05, direction: "red" },
  ],
  featureValues: {},
  context: { matchupDate: "2026-08-02", weightClass: "Lightweight" },
  fighters: { red: perfil(ROJO.id, ROJO.nombre), blue: perfil(AZUL.id, AZUL.nombre) },
  modelTrainedAt: null,
  explanation: "Explicación de mentira para el test.",
  explanationSource: "fallback",
};

test("el cara a cara pinta las dos esquinas y sus medidas", async ({ page }) => {
  await page.goto(PAREJA);

  // Por ROL y no por texto: "Charles Oliveira" suelto son 3 nodos en esta página
  // y "Esquina roja" son 2.
  await expect(page.getByRole("combobox", { name: "Esquina roja" })).toHaveValue(ROJO.nombre);
  await expect(page.getByRole("combobox", { name: "Esquina azul" })).toHaveValue(AZUL.nombre);

  // Las filas del cara a cara que construye buildTaleRows. Se comprueban donde
  // de verdad se ven, que es lo que hace innecesario extraer esa función a un
  // fichero aparte solo para poder probarla.
  for (const fila of ["Récord", "Altura", "Alcance"]) {
    await expect(page.getByText(fila, { exact: true })).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Predecir resultado" })).toBeVisible();
});

test("si el servicio de predicción está caído, lo dice y ofrece reintentar", async ({ page }) => {
  // La rama 503 se decide ANTES de leer el cuerpo (matchup-client.tsx:180-184),
  // así que el JSON da igual.
  await page.route("**/api/predict", (route) =>
    route.fulfill({ status: 503, json: { error: "no disponible" } }),
  );

  await page.goto(PAREJA);
  await page.getByRole("button", { name: "Predecir resultado" }).click();

  await expect(page.getByText("Predicción no disponible por ahora.")).toBeVisible();
  await expect(page.getByText("El servicio de predicción está fuera de línea")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();

  // Y no se pinta ninguna probabilidad: el banner sustituye a la predicción, no
  // convive con ella.
  await expect(page.getByText("Probabilidad de victoria")).toHaveCount(0);
});

test("con predicción, pinta las probabilidades y la esquina favorita", async ({ page }) => {
  await page.route("**/api/predict", (route) => route.fulfill({ status: 200, json: PREDICCION }));

  await page.goto(PAREJA);
  await page.getByRole("button", { name: "Predecir resultado" }).click();

  // Una barra por esquina: son DOS nodos a propósito.
  await expect(page.getByText("Probabilidad de victoria")).toHaveCount(2);
  // El badge se pinta en la tarjeta de la esquina con más probabilidad, y con
  // 0,65 vs 0,35 tiene que ser la roja.
  await expect(page.getByText("Favorito del modelo")).toHaveCount(1);
  await expect(page.getByText("Explicación de mentira para el test.")).toBeVisible();
  await expect(page.getByText("Predicción no disponible por ahora.")).toHaveCount(0);
});

test("un 200 que trae un error se enseña como error, no como predicción", async ({ page }) => {
  // Caso fácil de pasar por alto: matchup-client.tsx:190-192 lanza si
  // `!response.ok` O si el cuerpo trae la clave `error`. Un 200 con {error} NO
  // debe pintar una barra de probabilidad vacía.
  await page.route("**/api/predict", (route) =>
    route.fulfill({ status: 200, json: { error: "El modelo se atragantó." } }),
  );

  await page.goto(PAREJA);
  await page.getByRole("button", { name: "Predecir resultado" }).click();

  await expect(page.getByText("El modelo se atragantó.")).toBeVisible();
  await expect(page.getByText("Probabilidad de victoria")).toHaveCount(0);
});

test("cambiar de esquina borra la predicción de la pareja anterior", async ({ page }) => {
  // LA GUARDA QUE NADIE PROBABA. Sin ella, la web enseñaría la probabilidad de
  // OTRA pelea: el estado `prediction` no se limpia al elegir esquina
  // (matchup-client.tsx:77-87 solo tocan error y unavailable), y lo único que lo
  // impide es que los ids dejen de coincidir.
  await page.route("**/api/predict", (route) => route.fulfill({ status: 200, json: PREDICCION }));
  // La búsqueda va mockeada: este fichero no gasta cupo del limitador.
  await page.route("**/api/fighters/search*", (route) =>
    route.fulfill({
      json: [{ id: TERCERO.id, name: TERCERO.nombre, headshotUrl: null, nationality: "Australia" }],
    }),
  );

  await page.goto(PAREJA);
  await page.getByRole("button", { name: "Predecir resultado" }).click();
  await expect(page.getByText("Favorito del modelo")).toHaveCount(1);

  // Se cambia la esquina roja por otro luchador.
  await page.getByRole("combobox", { name: "Esquina roja" }).fill(TERCERO.nombre);
  await page
    .getByRole("listbox", { name: "Resultados de búsqueda para Esquina roja" })
    .getByRole("option", { name: new RegExp(TERCERO.nombre, "i") })
    .click();
  await page.waitForURL(new RegExp(`red=${TERCERO.id}`));

  // La predicción vieja tiene que haber DESAPARECIDO. No se oculta: se desmonta,
  // así que el aserto es de conteo y no `toBeHidden`.
  await expect(page.getByText("Favorito del modelo")).toHaveCount(0);
  await expect(page.getByText("Probabilidad de victoria")).toHaveCount(0);
});

test("el otro llamante de la predicción también avisa cuando el servicio cae", async ({ page }) => {
  // EL SEGUNDO LLAMANTE QUE EL DISEÑO NO CUBRÍA: market-model-comparison.tsx
  // también hace POST a /api/predict, desde la ficha de un combate, y tiene su
  // propia rama 503 sin probar.
  //
  // 🪤 NO se puede anclar a un id fijo: `showComparison`
  // (fights/[id]/page.tsx:97-103) exige `isUpcoming` Y cuotas, así que cualquier
  // combate que se escriba aquí deja de pintar el bloque en cuanto se celebra.
  // Por eso el combate se localiza en tiempo de ejecución desde la cartelera
  // próxima, y si hoy no hay ninguno con cuotas el test SE SALTA diciéndolo.
  await page.route("**/api/predict", (route) =>
    route.fulfill({ status: 503, json: { error: "no disponible" } }),
  );

  await page.goto("/eventos");
  const primerEvento = page.locator('a[href^="/eventos/"]').first();
  await expect(primerEvento).toBeVisible();

  // 🪤 Se navega con `goto` y NO con `click` + `waitForURL`. Un clic en un
  // <Link> de Next es navegación de CLIENTE y `waitForURL` resuelve en cuanto
  // cambia la URL, antes de que React haya pintado la página nueva: una lectura
  // síncrona del DOM justo después devuelve la cartelera VACÍA y el test se
  // saltaría solo, en verde. Medido: así saltaba diciendo "sin cartelera
  // publicada" en un evento que tiene 11 combates.
  const eventoHref = await primerEvento.getAttribute("href");
  test.skip(!eventoHref, "no hay ningún evento en la cartelera próxima");
  await page.goto(eventoHref!);

  const evento = page.url();
  const combates = await page.locator('a[href^="/fights/"]').evaluateAll((enlaces) =>
    enlaces.map((e) => (e as HTMLAnchorElement).getAttribute("href")!),
  );
  test.skip(combates.length === 0, `sin cartelera publicada en ${evento}`);

  // Se prueban como mucho tres: el bloque solo sale si el combate tiene cuotas.
  const boton = page.getByRole("button", {
    name: "Comparar las cuotas del mercado con el modelo de IA",
  });
  const visitados: string[] = [];
  let encontrado = false;
  for (const href of combates.slice(0, 3)) {
    await page.goto(href);
    visitados.push(href);
    // 🪤 NO usar `count()` aquí. React sirve el contenido en streaming DENTRO de
    // un `<div hidden id="S:n">` y lo mueve a su sitio después; hasta entonces
    // el botón existe en el DOM pero está FUERA del árbol de accesibilidad.
    // Medido: `locator('button[aria-label=...]').count()` daba 1 y
    // `getByRole('button', {name})` daba 0 sobre la misma página, así que el
    // test se saltaba solo en un combate que sí tenía el bloque. `waitFor` con
    // tope espera a que aterrice, y si el combate no trae cuotas simplemente
    // agota el tope y se pasa al siguiente.
    const aparecio = await boton
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (aparecio) {
      encontrado = true;
      break;
    }
  }
  // Si se salta, que diga QUÉ miró: un salto sin diagnóstico es un agujero
  // disfrazado de test verde.
  test.skip(
    !encontrado,
    `sin cuotas en los 3 primeros combates de ${evento}: ${visitados.join(", ")}`,
  );

  await boton.click();
  // Aquí sí hay roles ARIA, a diferencia de /enfrentamiento.
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/no disponible|fuera de línea/i);
});
