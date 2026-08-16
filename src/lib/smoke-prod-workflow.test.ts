import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Este test no prueba código de la app: prueba el WORKFLOW
// `.github/workflows/smoke-prod.yml`. Vive bajo `src/` porque el `include` de
// vitest.config.ts es `src/**/*.{test,spec}.{ts,tsx}` y un fichero fuera de ahí
// se ignoraría EN SILENCIO — el mismo motivo que documenta ese config para
// haber añadido `.tsx` al glob.
//
// POR QUÉ EXISTE (16-ago-2026). smoke-prod.yml abre un Issue cuando producción
// se cae y, desde hoy, lo CIERRA solo cuando vuelve a estar en pie. Las dos
// mitades se emparejan buscando el Issue por su TÍTULO EXACTO, y ese es un
// punto de fallo silencioso perfecto: si las dos cadenas dejan de coincidir
// aunque sea en un byte, el paso de cierre no encuentra nada NUNCA y termina en
// VERDE diciendo "No hay aviso de produccion abierto", mientras el Issue sigue
// abierto amordazando el canal. Nadie se enteraría hasta la siguiente caída de
// producción, que llegaría como un comentario sin email.
//
// Es exactamente la avería que el arreglo venía a resolver: el Issue #20 se
// abrió el 15-ago a las 12:56:25Z y aguantó abierto hasta el 16-ago a las
// 11:03:55Z (22 h 07 min) con 13 smokes en verde por detrás.
//
// Las trampas del título son invisibles al ojo: 🔴 es U+1F534, la raya es
// U+2014 (no un guion `-` ni una raya corta `–`), "Produccion" va SIN tilde y
// el resto en minúsculas. Un autocorrector, un copiar-pegar desde el navegador
// o un editor "arreglando" la puntuación rompen el emparejamiento sin dejar
// rastro en el diff a simple vista.

const WORKFLOW = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/smoke-prod.yml", import.meta.url)),
  "utf8",
);

/** Las asignaciones `TITULO="..."` del script, en orden de aparición. */
const titulos = [...WORKFLOW.matchAll(/^\s*TITULO="(.*)"$/gm)].map((m) => m[1]);

describe("smoke-prod.yml · el título del aviso de producción", () => {
  it("aparece exactamente dos veces: el que abre y el que cierra", () => {
    // Si alguien añade un tercer sitio que toque el Issue, o borra uno de los
    // dos, este test obliga a mirar el emparejamiento en vez de dejarlo pasar.
    expect(titulos).toHaveLength(2);
  });

  it("las dos copias son idénticas byte a byte", () => {
    const [apertura, cierre] = titulos;
    expect(cierre).toBe(apertura);
    // Comparación explícita en bytes UTF-8: `toBe` ya lo cubre para cadenas,
    // pero el mensaje de este fallo enseña los bytes, que es lo que hace falta
    // para ver un U+2013 colado donde debía ir un U+2014.
    const bytes = (s: string) => [...Buffer.from(s, "utf8")].join(" ");
    expect(bytes(cierre)).toBe(bytes(apertura));
  });

  it("conserva los caracteres exactos que hacen de clave", () => {
    // El esperado se construye por PUNTOS DE CÓDIGO y no pegando el literal:
    // así el test sigue comprobando lo correcto aunque este mismo fichero pase
    // por una conversión de codificación que estropee el emoji o la raya.
    const esperado =
      String.fromCodePoint(0x1f534) + // 🔴
      " Produccion rota " +
      String.fromCodePoint(0x2014) + // — raya larga (em dash)
      " el smoke ha fallado";

    expect(titulos[0]).toBe(esperado);
    // Guardas de las confusiones concretas, para que el fallo diga cuál es.
    expect(titulos[0]).not.toContain("Producción"); // sin tilde, a propósito
    expect(titulos[0]).not.toContain(String.fromCodePoint(0x2013)); // – raya corta
    expect(titulos[0].includes(" - ")).toBe(false); // guion normal
  });
});

describe("smoke-prod.yml · apertura y cierre buscan el Issue igual", () => {
  /** Las llamadas `gh issue list` del fichero, aplanadas a una línea. */
  const busquedas = [...WORKFLOW.matchAll(/gh issue list[^\n]*(?:\\\r?\n[^\n]*)*/g)].map((m) =>
    m[0].replace(/\\\r?\n\s*/g, " ").trim(),
  );

  it("hay una búsqueda en el paso que abre y otra en el que cierra", () => {
    expect(busquedas).toHaveLength(2);
  });

  it("las dos miran los Issues abiertos con el mismo límite", () => {
    // Si una busca entre 100 y la otra entre 30, o una filtra por etiqueta y la
    // otra no, el cierre puede no ver lo que abrió la apertura. Que fallen
    // igual es preferible a que fallen distinto: el desajuste sería mudo.
    for (const b of busquedas) {
      expect(b).toContain("--state open");
      expect(b).toContain("--limit 100");
      expect(b).not.toContain("--label");
      expect(b).not.toContain("--search");
    }
  });

  it("el cierre pide también las etiquetas, para respetar `no-cerrar-solo`", () => {
    const [apertura, cierre] = busquedas;
    expect(apertura).toContain("--json number,title");
    expect(cierre).toContain("--json number,title,labels");
    expect(WORKFLOW).toContain('select(.name == "no-cerrar-solo")');
  });
});

describe("smoke-prod.yml · los pasos del aviso están bien condicionados", () => {
  it("el aviso salta con cualquier final malo, no solo con `failure()`", () => {
    // `failure()` mira el JOB, y una cancelación o un timeout dejan el job en
    // `cancelled`: con `failure()` el paso ni se evaluaba. Lo que gana el
    // cambio es el job que YA está ejecutando pasos y muere a mitad (relevo de
    // `cancel-in-progress`, o `timeout-minutes` mientras el bucle de espera al
    // SHA hace sus 45 intentos).
    //
    // Lo que NO gana, y conviene no repetirlo mal: los tres runs cancelados
    // del 6-ago (31117459183, 31117890269 y 31125432909) salen de la API con
    // `steps: []` y su `runs/<id>/logs` es un zip vacío de 22 bytes — no
    // ejecutaron ni un paso, así que ningún `if:` de PASO los habría salvado.
    // Ese hueco solo se tapa desde fuera del job.
    expect(WORKFLOW).toContain("always() && job.status != 'success'");
  });

  it("los dos pasos solo tocan el Issue si se comprobó producción de verdad", () => {
    // El workflow acepta apuntar a otra URL por `workflow_dispatch`. Un rojo
    // contra una preview no es producción rota, y abrir el Issue con ese título
    // sería mentira y además amordazaría el canal bueno.
    const guardas = [
      ...WORKFLOW.matchAll(/contains\(fromJSON\('\[[^\]]*\]'\),\s*\r?\n?\s*env\.PLAYWRIGHT_BASE_URL\)/g),
    ];
    expect(guardas).toHaveLength(2);
    // Las dos formas de la URL: el input es texto libre y una barra final de
    // más silenciaría el aviso.
    expect(WORKFLOW).toContain('["https://mmastatus.app","https://mmastatus.app/"]');
  });

  it("ninguno de los dos puede tumbar el run por su cuenta", () => {
    // Un fallo del `gh` no debe convertir un fallo en dos, ni hacer que
    // producción parezca rota estando sana.
    //
    // Anclado a principio de línea A PROPÓSITO: la clave de verdad va sola en
    // su línea, y los comentarios del workflow nombran `continue-on-error` al
    // explicar por qué está. Sin el ancla, el test contaba prosa y se ponía
    // rojo por escribir un comentario.
    expect(WORKFLOW.match(/^\s*continue-on-error: true$/gm)).toHaveLength(2);
  });

  it("el cierre no canta victoria si el `gh issue close` ha fallado", () => {
    // El script no lleva `set -e`. Si el `gh issue close` se deja suelto y
    // detrás va un `echo "Issue #N cerrado."`, un fallo del `gh` (rate limit,
    // red, permisos recortados) sale con 0, imprime que cerró, y con el
    // `continue-on-error: true` el run entero queda VERDE mientras el Issue
    // sigue abierto amordazando el canal. Es el mismo fallo mudo que este paso
    // viene a arreglar, colado en la última línea.
    expect(WORKFLOW).toMatch(/if gh issue close "\$NUM"/);
    expect(WORKFLOW).toContain(
      '::error title=Relevo::No se ha podido cerrar el aviso #$NUM.',
    );
  });
});

// ---------------------------------------------------------------------------
// EL AGUJERO QUE ABRE EL PROPIO GUARD (añadido en la revisión del 16-ago-2026).
//
// El guard del `base_url` es lo que impide que un dispatch contra una preview
// abra —o cierre— el Issue de producción. Pero compara contra una lista de URLs
// ESCRITA A MANO dentro de los dos `if:`, y la URL de producción de verdad vive
// en otros dos sitios: el `default:` del input `base_url` y el literal de
// reserva de `PLAYWRIGHT_BASE_URL` (el que se usa en push y en cron, donde no
// hay `inputs`).
//
// COMPROBADO ROMPIÉNDOLO: si se cambia el dominio en esos dos sitios y no en la
// lista de los `if:`, `contains(...)` pasa a ser FALSO SIEMPRE. Resultado: el
// aviso no se abre nunca y el cierre no se ejecuta nunca. Producción se puede
// caer una semana entera sin un solo email. Y el estropicio es invisible:
// `actionlint` sale en 0, los otros 9 tests de este fichero siguen en verde y
// `npm test` entero también. Es exactamente el modo de fallo que este arreglo
// venía a quitar, reintroducido por la puerta de atrás.
//
// Por eso el guard no se comprueba contra un literal copiado aquí: se comprueba
// contra lo que el propio workflow declara que es producción.
describe("smoke-prod.yml · el guard del base_url apunta a la producción real", () => {
  /** Saca un grupo de captura del workflow, o falla diciendo qué falta. */
  const capturar = (re: RegExp, que: string): string => {
    const m = re.exec(WORKFLOW);
    if (!m) throw new Error(`smoke-prod.yml ya no declara ${que} de la forma esperada`);
    return m[1];
  };

  /** El `default:` del input `base_url` del `workflow_dispatch`. */
  const defectoInput = () =>
    capturar(/base_url:[\s\S]{0,300}?default:\s*"([^"]+)"/, "el default del input base_url");

  /** El literal de reserva de `PLAYWRIGHT_BASE_URL`: la URL que se comprueba en
   *  push y en cron, que es el 99% de los runs. */
  const defectoEnv = () =>
    capturar(
      /PLAYWRIGHT_BASE_URL:\s*\$\{\{\s*inputs\.base_url\s*\|\|\s*'([^']+)'\s*\}\}/,
      "el valor por defecto de PLAYWRIGHT_BASE_URL",
    );

  /** Las listas de URLs contra las que comparan los dos `if:`. */
  const listas = (): string[][] =>
    [
      ...WORKFLOW.matchAll(/contains\(fromJSON\('(\[[^\]]*\])'\),\s*env\.PLAYWRIGHT_BASE_URL\)/g),
    ].map((m) => JSON.parse(m[1]) as string[]);

  it("los dos sitios que definen «producción» dicen lo mismo", () => {
    // Si el input por defecto y el fallback del env divergen, un dispatch con
    // los valores por defecto comprobaría una URL y el guard esperaría otra.
    expect(defectoEnv()).toBe(defectoInput());
  });

  it("el guard de LOS DOS pasos acepta esa URL, con y sin barra final", () => {
    const prod = defectoEnv();
    const encontradas = listas();
    expect(encontradas).toHaveLength(2);
    for (const lista of encontradas) {
      expect(lista).toContain(prod);
      expect(lista).toContain(`${prod}/`);
    }
  });

  it("el guard no cuela ningún host que no sea el de producción", () => {
    // Al revés que lo anterior: que nadie meta una preview en la lista y
    // convierta el aviso de producción en un aviso de cualquier cosa.
    const host = new URL(defectoEnv()).host;
    for (const lista of listas()) {
      for (const url of lista) expect(new URL(url).host).toBe(host);
    }
  });
});

// ---------------------------------------------------------------------------
// LAS CITAS A NÚMERO DE LÍNEA DE LOS COMENTARIOS.
//
// Este fichero se apoya en comentarios que citan líneas del propio workflow
// (":205", ":208-209"...). Ya se han quedado obsoletas DOS veces en un solo día
// —16-ago— porque cada bloque de comentario que crece desplaza todo lo de
// abajo, y una cita que apunta a otro sitio manda al siguiente lector al lugar
// equivocado justo cuando está depurando por qué no le llegó un email.
describe("smoke-prod.yml · las citas a número de línea siguen apuntando bien", () => {
  const lineas = WORKFLOW.split(/\r?\n/);

  /** Lo que cada cita del fichero promete que hay en esa línea. */
  const promesas: Record<number, RegExp> = {
    35: /^concurrency:/,
    42: /^\s*timeout-minutes: 15$/,
    44: /^\s*PLAYWRIGHT_BASE_URL:/,
    16: /^on:/,
    24: /^\s*base_url:/,
    71: /name: Esperar a que producción sirva ESTE commit/,
    205: /^\s*TITULO="/,
    206: /^\s*BODY=\$\(printf/,
    208: /gh issue list/,
  };

  it("cada línea citada contiene lo que el comentario dice que contiene", () => {
    for (const [n, re] of Object.entries(promesas)) {
      const texto = lineas[Number(n) - 1] ?? "";
      // El segundo argumento de `expect` es el rótulo del fallo: sin él, el
      // error diría solo qué regex no casó y no en qué cita hay que mirar.
      expect(texto, `la cita :${n} ya no apunta a lo que promete`).toMatch(re);
    }
  });

  it("ninguna cita se sale del fichero", () => {
    const citas = [...WORKFLOW.matchAll(/(?<![\w.]):(\d+)(?:-(\d+))?(?![\w])/g)];
    expect(citas.length).toBeGreaterThan(0);
    for (const c of citas) {
      const fin = Number(c[2] ?? c[1]);
      expect(fin).toBeLessThanOrEqual(lineas.length);
    }
  });
});
