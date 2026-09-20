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
//
// 20-sep-2026: AHORA SON DOS CANALES, NO UNO. El paso de espera puede terminar
// en ÁMBAR —el commit no ha llegado al dominio, pero la web y la base
// responden y el despliegue no ha fallado— y eso deja un aviso en un hilo
// PROPIO, con su propio título. La propiedad que sostiene el diseño entero, y
// que estos tests defienden, es que los dos títulos sean DISTINTOS: un ámbar
// abierto no puede amordazar el canal rojo. Si alguien los igualara, un
// despliegue lento silenciaría el aviso de producción caída, que es la avería
// más cara que ha tenido este workflow.
//
// Por eso se empareja por NOMBRE DE VARIABLE (`TITULO` el rojo, `TITULO_AMBAR`
// el ámbar) y no por orden de aparición: el orden cambia cada vez que alguien
// mueve un paso, y un emparejamiento cruzado sería mudo.

const WORKFLOW = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/smoke-prod.yml", import.meta.url)),
  "utf8",
);

/** Las asignaciones `TITULO="..."` del script (el canal ROJO), en orden. */
const titulos = [...WORKFLOW.matchAll(/^\s*TITULO="(.*)"$/gm)].map((m) => m[1]);

/** Las asignaciones `TITULO_AMBAR="..."` (el canal ÁMBAR), en orden. */
const titulosAmbar = [...WORKFLOW.matchAll(/^\s*TITULO_AMBAR="(.*)"$/gm)].map((m) => m[1]);

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

describe("smoke-prod.yml · el aviso ámbar tiene su propio hilo", () => {
  it("su título aparece dos veces: el que abre y el que cierra", () => {
    expect(titulosAmbar).toHaveLength(2);
  });

  it("las dos copias son idénticas byte a byte", () => {
    const [apertura, cierre] = titulosAmbar;
    const bytes = (x: string) => [...Buffer.from(x, "utf8")].join(" ");
    expect(bytes(cierre)).toBe(bytes(apertura));
  });

  it("conserva los caracteres exactos que hacen de clave", () => {
    const esperado =
      String.fromCodePoint(0x1f7e0) + // 🟠
      " Despliegue sin verificar " +
      String.fromCodePoint(0x2014) + // — raya larga
      " el commit no llego al dominio";

    expect(titulosAmbar[0]).toBe(esperado);
    expect(titulosAmbar[0]).not.toContain("llegó"); // sin tilde, a propósito
    expect(titulosAmbar[0]).not.toContain(String.fromCodePoint(0x2013)); // – raya corta
  });

  it("ES DISTINTO del título rojo, y esto es lo que sostiene el diseño", () => {
    // La razón de existir del ámbar es avisar SIN amordazar el canal rojo.
    // GitHub manda email al abrir un Issue, no al comentar en uno abierto, así
    // que si los dos títulos coincidieran un despliegue lento se comería el
    // aviso de "producción caída" hasta que alguien lo cerrara a mano. Ya pasó
    // con un solo canal: el #21 estuvo 56 horas abierto y dos roturas reales
    // llegaron como comentarios mudos.
    expect(titulosAmbar[0]).not.toBe(titulos[0]);
    // Y que no sea el mismo por accidente de mayúsculas o espacios.
    const normal = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
    expect(normal(titulosAmbar[0])).not.toBe(normal(titulos[0]));
  });
});

describe("smoke-prod.yml · apertura y cierre buscan el Issue igual", () => {
  /** Las llamadas `gh issue list` del fichero, aplanadas a una línea. */
  const busquedas = [...WORKFLOW.matchAll(/gh issue list[^\n]*(?:\\\r?\n[^\n]*)*/g)].map((m) =>
    m[0].replace(/\\\r?\n\s*/g, " ").trim(),
  );

  it("hay una búsqueda por cada apertura y cada cierre de los dos canales", () => {
    // Cuatro: abre rojo, abre ámbar, cierra rojo, cierra ámbar. Si alguien
    // añade o quita un sitio que toque Issues, este número obliga a volver
    // aquí y decidir a qué canal pertenece en vez de dejarlo pasar.
    expect(busquedas).toHaveLength(4);
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

  it("el cierre del rojo pide también las etiquetas, para respetar `no-cerrar-solo`", () => {
    // El salvavidas `no-cerrar-solo` sólo tiene sentido en el canal rojo: es
    // para el fallo INTERMITENTE, donde abrir y cerrar en bucle mandaría un
    // correo cada vez y borraría el rastro. Así que EXACTAMENTE una de las
    // cuatro búsquedas pide etiquetas, y es la del cierre del rojo.
    const conEtiquetas = busquedas.filter((b) => b.includes("--json number,title,labels"));
    expect(conEtiquetas).toHaveLength(1);
    expect(WORKFLOW).toContain('select(.name == "no-cerrar-solo")');
    // Las otras tres se conforman con número y título.
    for (const b of busquedas) {
      expect(b).toMatch(/--json number,title(,labels)?\b/);
    }
  });

  it("cada búsqueda empareja por una variable de título, nunca por un literal suelto", () => {
    // Un literal pegado a mano en el `--arg t` es el punto de fallo silencioso
    // de siempre: se desincroniza con su pareja y el cierre deja de encontrar
    // nada, en verde y sin decir palabra.
    const args = [...WORKFLOW.matchAll(/--arg t "([^"]*)"/g)].map((m) => m[1]);
    expect(args).toHaveLength(4);
    for (const a of args) expect(a).toMatch(/^\$(TITULO|TITULO_AMBAR)$/);
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

  it("los tres pasos solo tocan el Issue si se comprobó producción de verdad", () => {
    // El workflow acepta apuntar a otra URL por `workflow_dispatch`. Un rojo
    // contra una preview no es producción rota, y abrir el Issue con ese título
    // sería mentira y además amordazaría el canal bueno.
    const guardas = [
      ...WORKFLOW.matchAll(/contains\(fromJSON\('\[[^\]]*\]'\),\s*\r?\n?\s*env\.PLAYWRIGHT_BASE_URL\)/g),
    ];
    // Tres desde el 20-sep: abre rojo, abre ámbar, cierra (los dos canales).
    expect(guardas).toHaveLength(3);
    // Las dos formas de la URL: el input es texto libre y una barra final de
    // más silenciaría el aviso.
    expect(WORKFLOW).toContain('["https://mmastatus.app","https://mmastatus.app/"]');
  });

  it("ninguno de los tres puede tumbar el run por su cuenta", () => {
    // Un fallo del `gh` no debe convertir un fallo en dos, ni hacer que
    // producción parezca rota estando sana.
    //
    // Anclado a principio de línea A PROPÓSITO: la clave de verdad va sola en
    // su línea, y los comentarios del workflow nombran `continue-on-error` al
    // explicar por qué está. Sin el ancla, el test contaba prosa y se ponía
    // rojo por escribir un comentario.
    expect(WORKFLOW.match(/^\s*continue-on-error: true$/gm)).toHaveLength(3);
  });

  it("el ámbar no puede colarse como verde: las pruebas cuelgan de `verificado`", () => {
    // El paso de espera puede salir con 0 sin haber comprobado nada (ámbar).
    // Si los pasos de Playwright no colgaran de `verificado`, correrían contra
    // el commit ANTERIOR y darían un verde que no significa nada — el fallo
    // del 30-jul, al revés. Y si el paso que CIERRA el aviso rojo no colgara
    // de lo mismo, un ámbar cerraría un aviso de producción rota sin haber
    // pedido una sola ruta.
    const colgados = WORKFLOW.match(/steps\.esperar\.outputs\.verificado == 'true'/g);
    expect(colgados).toHaveLength(3); // api.spec, seo.spec y el cierre
    // Y el paso que abre el ámbar cuelga del caso contrario.
    expect(WORKFLOW).toContain("steps.esperar.outputs.verificado == 'false'");
  });

  it("el paso de espera publica `verificado` en TODOS sus caminos de salida", () => {
    // Si un camino terminara sin escribir el output, los `if:` que cuelgan de
    // él lo leerían como cadena vacía: las pruebas no correrían y el ámbar
    // tampoco avisaría. Silencio completo.
    const paso = /id: esperar[\s\S]*?\n      - name:/.exec(WORKFLOW)?.[0] ?? "";
    expect(paso).not.toBe("");
    const salidas = paso.match(/^\s*exit [01]$/gm) ?? [];
    const escrituras = paso.match(/verificado=(true|false)" >> "\$GITHUB_OUTPUT"/g) ?? [];
    // Dos `exit 0` de éxito (commit servido, y disparo sin SHA) escriben
    // `true`; el tercero, el ámbar, escribe `false` antes de todo el
    // diagnóstico y lo comparte con los caminos que salen en rojo.
    expect(salidas.length).toBeGreaterThanOrEqual(3);
    expect(escrituras).toHaveLength(3);
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

  it("el guard de LOS TRES pasos acepta esa URL, con y sin barra final", () => {
    const prod = defectoEnv();
    const encontradas = listas();
    expect(encontradas).toHaveLength(3);
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
    42: /^concurrency:/,
    49: /^\s*timeout-minutes: 15$/,
    51: /^\s*PLAYWRIGHT_BASE_URL:/,
    16: /^on:/,
    24: /^\s*base_url:/,
    116: /name: Esperar a que producción sirva ESTE commit/,
    419: /^\s*TITULO="/,
    420: /^\s*BODY=\$\(printf/,
    422: /gh issue list/,
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
