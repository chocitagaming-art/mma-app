import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// event-live-embed.tsx importa de lib/ufc-tv.ts, que crea sus cachés con
// unstable_cache al cargar. Fuera de Next se sustituye por un paso directo,
// igual que en lib/ufc-tv.test.ts: aquí no se llama a ninguna.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { EventLiveEmbed } from "@/components/event-live-embed";
import { UfcTv } from "@/components/home/ufc-tv";

// 🪤 TRES SITIOS PINTAN <EventLiveEmbed> Y UNO SE QUEDÓ SIN `eventOver`.
//
// La noche del UFC 330 (15-ago-2026) /en-vivo rotulaba «Finalizado» en la
// cabecera y, más abajo, seguía «Retransmisión oficial» con el título
// «UFC 330 | Previa del Evento ¡EN VIVO!». Duró entre 2 y 4 h: desde que el
// estelar cayó (ESPN 'post', 04:19Z) hasta que el cron marcó el evento
// status='completed' (06:24Z), que es cuando getLiveEventCandidate deja de
// devolverlo y la página entera desaparece.
//
// El fallo NO era de lógica —isMainEventFinished ya tiene sus casos en
// live-event.test.ts— sino de CABLEADO: un sitio de llamada olvidado. Eso solo
// se caza leyendo el fuente. Aquí no hay arnés de componentes React (vitest va
// en environment "node" a propósito, ver vitest.config.ts), así que el guard va
// sobre el CÓDIGO FUENTE, igual que ya hace contrast.test.ts con los .tsx.
//
// Honestidad sobre lo que esto vale: comprueba que la prop ESTÁ, no que esté
// bien calculada. El comportamiento ya está cubierto aparte; lo único que no
// tenía red era el cableado, y es justo lo que se vigila aquí.

const SRC = new URL("../", import.meta.url);

function leerFuente(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(ruta, SRC)), "utf8");
}

// Recorrido manual en vez de `readdirSync(..., { recursive: true })` para que se
// vea qué se mira y qué no: solo `app/` y `components/`. Este fichero vive en
// `lib/` y por eso no se lee a sí mismo — un vigilante que se cuenta entre los
// vigilados no vigila nada (misma trampa documentada en contrast.test.ts).
function recorrerTsx(rutaRelativa: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(fileURLToPath(new URL(rutaRelativa, SRC)), {
    withFileTypes: true,
  })) {
    const hijo = `${rutaRelativa}${entrada.name}`;
    if (entrada.isDirectory()) {
      encontrados.push(...recorrerTsx(`${hijo}/`));
    } else if (entrada.name.endsWith(".tsx")) {
      encontrados.push(hijo);
    }
  }
  return encontrados;
}

// Se recorta la ETIQUETA, no el fichero: así el aserto exige que `eventOver`
// esté en esta llamada (y no en cualquier otra línea del fichero que la
// mencione, un comentario incluido) y el fallo no escupe 400 líneas de JSX.
function etiquetaDelEmbed(src: string): string | null {
  const inicio = src.indexOf("<EventLiveEmbed");
  if (inicio === -1) {
    return null;
  }
  const fin = src.indexOf("/>", inicio);
  return fin === -1 ? null : src.slice(inicio, fin + 2);
}

// Y por lo mismo se recorta el CUERPO de la función, no el fichero: el guard
// `AND NOT ${MAIN_EVENT_FINISHED_SQL}` aparece DOS veces en `queries/events.ts`
// —la otra es la lista de «Próximos»— así que un `toContain` sobre el fichero
// entero seguía en VERDE con el guard de la portada borrado. Medido en la
// re-revisión: quitando esa línea de `getNextEventHeroUncached` el test pasaba
// igual. Un vigilante que no puede ponerse rojo no vigila nada, que es la misma
// trampa que documenta `contrast.test.ts`.
//
// El cierre se busca como `\n}` a principio de línea: dentro del cuerpo todo va
// indentado, así que el primero que aparece es el de la propia función.
function cuerpoDeFuncion(src: string, nombre: string): string | null {
  const inicio = src.indexOf(`function ${nombre}`);
  if (inicio === -1) {
    return null;
  }
  const fin = src.indexOf("\n}", inicio);
  return fin === -1 ? null : src.slice(inicio, fin + 2);
}

describe("sitios que pintan EventLiveEmbed", () => {
  it("/en-vivo y la ficha del evento pasan eventOver", () => {
    for (const ruta of ["app/en-vivo/page.tsx", "app/eventos/[id]/page.tsx"]) {
      const etiqueta = etiquetaDelEmbed(leerFuente(ruta));
      expect(etiqueta, `${ruta} ya no pinta el directo`).not.toBeNull();
      expect(etiqueta, `${ruta} pinta el directo SIN eventOver`).toMatch(
        /\n\s*eventOver=\{/,
      );
    }
  });

  it("la portada NO lo necesita: getNextEventHero excluye el evento por SQL", () => {
    // Esto es lo que hace honesta la exención de la portada (y lo que justifica
    // que el default de la prop sea `false`). Si alguien quita ese `AND NOT`,
    // la home se queda sin protección y hay que darle `eventOver` a mano.
    //
    // Tiene que ser el de ESTA consulta: es la que alimenta el embed de la
    // portada (`getNextEventHero` → `nextEvent` en `app/page.tsx` → el hueco de
    // directos `components/home/home-live-slot.tsx`, que es quien lo pinta
    // desde que existe UFC TV).
    const cuerpo = cuerpoDeFuncion(
      leerFuente("lib/queries/events.ts"),
      "getNextEventHeroUncached",
    );
    expect(cuerpo, "getNextEventHeroUncached ya no existe con ese nombre").not.toBeNull();
    expect(
      cuerpo,
      "la consulta de la portada ya no excluye el evento con el estelar caído: " +
        "ahora hace falta pasarle `eventOver` a <EventLiveEmbed> en app/page.tsx",
    ).toContain("AND NOT ${MAIN_EVENT_FINISHED_SQL}");
  });

  it("la exención de la portada solo vale si el hueco usa ESE nextEvent y ningún otro", () => {
    // 🪤 UFC TV MOVIÓ EL SITIO DE LLAMADA de `app/page.tsx` a
    // `components/home/home-live-slot.tsx`, y con él la razón de la exención.
    // El test de arriba solo prueba que getNextEventHero excluye el evento con
    // el estelar caído; eso no sirve de nada si el hueco sacara el evento de
    // otra consulta. Así que se cablean las dos puntas: la portada le pasa el
    // `nextEvent` de getNextEventHero, y el hueco no consulta la base por su
    // cuenta.
    const portada = leerFuente("app/page.tsx");
    expect(portada, "la portada ya no saca el próximo evento de getNextEventHero").toContain(
      "getNextEventHero()",
    );
    expect(portada, "la portada ya no le pasa ese nextEvent al hueco de directos").toMatch(
      /<HomeLiveSlot\s+nextEvent=\{nextEvent\}\s*\/>/,
    );
    const hueco = leerFuente("components/home/home-live-slot.tsx");
    expect(
      hueco,
      "el hueco de directos consulta la base por su cuenta: ahora el evento " +
        "puede no venir de getNextEventHero y la exención de eventOver deja de valer",
    ).not.toMatch(/@\/lib\/queries\//);
  });

  it("no hay un cuarto sitio: son exactamente esos tres", () => {
    // El fallo fue añadir/mover un sitio de llamada y olvidar la prop. Si
    // mañana aparece un cuarto, este test lo señala y quien lo añada tiene que
    // decidir a conciencia si le toca `eventOver` o la exención de la portada.
    //
    // El de la portada ya no vive en `app/page.tsx`: desde UFC TV lo pinta el
    // hueco de directos, que decide entre el directo del evento, UFC TV o nada.
    const sitios = [...recorrerTsx("app/"), ...recorrerTsx("components/")]
      .filter((ruta) => leerFuente(ruta).includes("<EventLiveEmbed"))
      .sort();
    expect(sitios).toEqual([
      "app/en-vivo/page.tsx",
      "app/eventos/[id]/page.tsx",
      "components/home/home-live-slot.tsx",
    ]);
  });
});

// ---------------------------------------------------------------------------
// «Sin darle a play»: todos los reproductores de directo arrancan solos y mudos
// ---------------------------------------------------------------------------
//
// 🪤 EL ACUERDO CON EL DUEÑO ES QUE EL DIRECTO SE VEA SIN TOCAR NADA, y eso son
// CUATRO cosas a la vez, no una: `autoplay=1`, `mute=1` (sin él Chrome y Safari
// bloquean el arranque y el reproductor se queda parado), `playsinline=1` (sin
// él el iPhone se lo lleva a pantalla completa) y `autoplay` en el atributo
// `allow` del iframe (sin él la política de permisos lo corta antes de que
// YouTube lea el parámetro). Quitar cualquiera de las cuatro deja un
// reproductor que «funciona» en la revisión de código y no arranca en la calle.
//
// Se mira el fuente por lo mismo que el resto de este fichero: no hay arnés de
// componentes. En ufc-tv.tsx la URL no se escribe a mano: la construyen
// liveEmbedUrl/loopEmbedUrl (lib/ufc-tv.ts), cuyos parámetros exactos prueba
// lib/ufc-tv.test.ts. Aquí se exige que el iframe use ESAS y no otra cosa.

// Recorta cada etiqueta <iframe … /> entera, por lo mismo que etiquetaDelEmbed:
// que el aserto mire ESTA etiqueta y no un comentario que hable de ella.
//
// 🪤 `<iframe` seguido de ESPACIO, no la cadena a secas: el comentario de
// event-live-embed.tsx dice «NO EN EL <iframe>.» y la primera versión de esta
// función lo contaba como un segundo reproductor sin parámetros.
function iframes(src: string): string[] {
  return [...src.matchAll(/<iframe\s[\s\S]*?\/>/g)].map((m) => m[0]);
}

describe("los reproductores de directo arrancan solos, mudos y en línea", () => {
  const PARAMS = ["autoplay=1", "mute=1", "playsinline=1"];

  it("event-live-embed.tsx: la URL lleva los tres parámetros y allow lleva autoplay", () => {
    const encontrados = iframes(leerFuente("components/event-live-embed.tsx"));
    expect(encontrados, "event-live-embed.tsx ya no pinta ningún iframe").toHaveLength(1);
    for (const iframe of encontrados) {
      expect(iframe).toContain("youtube-nocookie.com/embed/");
      for (const param of PARAMS) {
        expect(iframe, `al directo del evento le falta ${param}`).toContain(param);
      }
      expect(iframe).toMatch(/allow="[^"]*\bautoplay\b/);
    }
  });

  it("UFC TV: el iframe (home/ufc-tv-player.tsx) usa las URLs de los constructores probados y allow lleva autoplay", () => {
    // El iframe vive en un componente de CLIENTE (para leer
    // prefers-reduced-motion) y recibe las dos URLs hechas: la de autoplay y
    // la quieta. Aquí se exige que el iframe no escriba una URL a mano y que
    // ufc-tv.tsx las saque de los constructores, que no estarían cubiertos
    // por los tests de parámetros de lib/ufc-tv.test.ts si no.
    const reproductor = leerFuente("components/home/ufc-tv-player.tsx");
    const encontrados = iframes(reproductor);
    expect(encontrados, "ufc-tv-player.tsx ya no pinta ningún iframe").toHaveLength(1);
    for (const iframe of encontrados) {
      expect(iframe).toMatch(/allow="[^"]*\bautoplay\b/);
      expect(iframe, "el iframe de UFC TV ya no toma su src de las props").toContain(
        "src={reducedMotion ? calmSrc : src}",
      );
    }
    expect(reproductor, "ufc-tv-player.tsx escribe una URL de YouTube a mano").not.toContain(
      "youtube-nocookie.com",
    );

    const fuente = leerFuente("components/home/ufc-tv.tsx");
    expect(iframes(fuente), "ufc-tv.tsx vuelve a pintar un iframe propio").toHaveLength(0);
    expect(fuente).toMatch(/const src =[^;]*liveEmbedUrl\(/);
    expect(fuente).toMatch(/const src =[^;]*loopEmbedUrl\(/);
    expect(fuente).toMatch(/<UfcTvPlayer\s+src=\{src\}\s+calmSrc=\{calmSrc\}/);
    expect(fuente, "ufc-tv.tsx escribe una URL de YouTube a mano").not.toContain(
      "youtube-nocookie.com",
    );
  });
});

// ---------------------------------------------------------------------------
// El interruptor 'off' y el vídeo detectado: el COMPORTAMIENTO del embed
// ---------------------------------------------------------------------------
//
// 🪤 El test que había aquí solo buscaba la cadena LIVE_VIDEO_OFF en el
// fichero, y le bastaba la línea del import: se podía borrar la guarda entera
// y seguía verde. Este llama al componente de verdad. Es un componente de
// servidor sin estado, así que en node es una función que devuelve elementos
// de React (o null), y renderToStaticMarkup los convierte en HTML sin DOM.

describe("EventLiveEmbed se niega a pintar lo que no es un id de YouTube", () => {
  const titulo = "UFC 330 | Previa del Evento ¡EN VIVO!";

  it("'off', 'OFF', ' off ' o una URL → nada, ni aunque traigan título", () => {
    for (const videoId of ["off", "OFF", " off ", "https://youtu.be/qM-h-OudTqM", ""]) {
      expect(
        EventLiveEmbed({ videoId, videoTitle: titulo, eventName: "UFC 330" }),
        videoId,
      ).toBeNull();
    }
  });

  it("un id de verdad con título → el iframe, y la fuente dice de qué canal es", () => {
    const html = renderToStaticMarkup(
      EventLiveEmbed({
        videoId: "qM-h-OudTqM",
        videoTitle: titulo,
        eventName: "UFC 330",
        channel: "ufc-es",
      }),
    );
    expect(html).toContain("youtube-nocookie.com/embed/qM-h-OudTqM?autoplay=1&amp;mute=1");
    expect(html).toContain("canal oficial de UFC Español");
  });

  it("un id escrito a mano (sin canal) se queda con el rótulo genérico de la UFC", () => {
    const html = renderToStaticMarkup(
      EventLiveEmbed({ videoId: "qM-h-OudTqM", videoTitle: titulo, eventName: "UFC 330" }),
    );
    expect(html).toContain("canal oficial de la UFC (fuente YouTube)");
  });
});

describe("los tres sitios eligen el vídeo con resolveEventVideo, no con la columna a pelo", () => {
  // Las dos capas que protegen el interruptor en la ficha y en /en-vivo son
  // resolveEventVideo (resuelve 'off') y el embed (se niega). Sin esto, un
  // sitio que volviera a pasar `event.liveVideoId` tal cual se saltaba la
  // primera, y la detección automática no llegaría nunca a esa página.
  const SITIOS = [
    "app/en-vivo/page.tsx",
    "app/eventos/[id]/page.tsx",
    "components/home/home-live-slot.tsx",
  ];

  for (const ruta of SITIOS) {
    it(ruta, () => {
      const fuente = leerFuente(ruta);
      expect(fuente, `${ruta} ya no resuelve el vídeo con resolveEventVideo`).toMatch(
        /resolveEventVideo\(|planHomeSlot\(/,
      );
      const etiqueta = etiquetaDelEmbed(fuente);
      expect(etiqueta, `${ruta} ya no pinta el directo`).not.toBeNull();
      expect(etiqueta, `${ruta} le pasa la columna a pelo al embed`).not.toMatch(
        /videoId=\{(event|nextEvent)\??\.liveVideoId\}/,
      );
      expect(etiqueta, `${ruta} no le pasa el canal al embed`).toMatch(/channel=\{/);
    });
  }
});

// ---------------------------------------------------------------------------
// El ancho: más grande en la portada, 768 px en la ficha y en /en-vivo
// ---------------------------------------------------------------------------
//
// 🪤 LA CLASE DE LA PORTADA SOLO EXISTE SI ESTÁ ESCRITA ENTERA EN EL FUENTE.
// Tailwind v4 saca el CSS leyendo el código, y una clase montada a trozos no la
// ve: en producción desaparecería sin avisar y el vídeo ocuparía el carril
// entero (1216 px). Por eso las dos columnas viven literales en
// lib/live-player-column.ts y aquí se exige que los componentes las saquen de
// ahí. Los píxeles de verdad los mide e2e/maquetacion.spec.ts, pero SOLO los de
// UFC TV: el directo del evento depende de la ventana real de la velada y ese
// e2e no puede provocarlo. Su ancho, en la portada, en la ficha y en /en-vivo,
// solo lo vigila este fichero.

const COLUMNA_PAGINA = "max-w-3xl";
const COLUMNA_PORTADA = "max-w-[clamp(48rem,calc((100vh-10rem)*16/9),64rem)]";
const TITULO = "UFC 330 | Previa del Evento ¡EN VIVO!";
// Tres peleas completas reales del bucle enlatado (FIXTURE_LOOP, lib/ufc-tv.ts).
const BUCLE = ["eolk1_qxI28", "NcCPNVPx3O4", "X7k1eTCC3_w"];

describe("el reproductor crece solo en la portada", () => {
  it("EventLiveEmbed sin `column` se queda en los 768 px de siempre (ficha y /en-vivo)", () => {
    const html = renderToStaticMarkup(
      EventLiveEmbed({ videoId: "qM-h-OudTqM", videoTitle: TITULO, eventName: "UFC 330" }),
    );
    expect(html).toContain(COLUMNA_PAGINA);
    expect(html).not.toContain(COLUMNA_PORTADA);
  });

  it('con column="home" toma la columna de la portada', () => {
    const html = renderToStaticMarkup(
      EventLiveEmbed({
        videoId: "qM-h-OudTqM",
        videoTitle: TITULO,
        eventName: "UFC 330",
        column: "home",
      }),
    );
    expect(html).toContain(COLUMNA_PORTADA);
    expect(html).not.toContain(COLUMNA_PAGINA);
  });

  it("UFC TV, que solo se pinta en la portada, usa la de la portada", () => {
    const html = renderToStaticMarkup(UfcTv({ mode: "loop", ids: BUCLE, channels: ["ufc-es"] }));
    expect(html).toContain(COLUMNA_PORTADA);
    expect(html).not.toContain(COLUMNA_PAGINA);
  });

  it('el hueco de la portada le pasa column="home" al directo; la ficha y /en-vivo, ninguna', () => {
    // Sin esto, la noche de la velada el hueco ENCOGERÍA al pasar del bucle de
    // UFC TV (1024 px) al directo del evento (768).
    const portada = etiquetaDelEmbed(leerFuente("components/home/home-live-slot.tsx"));
    expect(portada, "el directo de la portada se queda en 768 px").toContain('column="home"');
    for (const ruta of ["app/en-vivo/page.tsx", "app/eventos/[id]/page.tsx"]) {
      expect(etiquetaDelEmbed(leerFuente(ruta)), `${ruta} crecería con la portada`).not.toMatch(
        /\bcolumn=/,
      );
    }
  });

  it("las dos clases están ENTERAS en lib/live-player-column.ts y los componentes no escriben la suya", () => {
    const constante = leerFuente("lib/live-player-column.ts");
    expect(constante).toContain(`"${COLUMNA_PAGINA}"`);
    expect(constante).toContain(`"${COLUMNA_PORTADA}"`);
    for (const ruta of ["components/event-live-embed.tsx", "components/home/ufc-tv.tsx"]) {
      const fuente = leerFuente(ruta);
      expect(fuente, `${ruta} ya no saca el ancho de LIVE_PLAYER_COLUMN`).toContain(
        "LIVE_PLAYER_COLUMN",
      );
      expect(fuente, `${ruta} vuelve a fijar el ancho a mano`).not.toMatch(/\bmax-w-/);
    }
  });
});

// ---------------------------------------------------------------------------
// `accelerated-rotation`, fuera de todos los iframes
// ---------------------------------------------------------------------------
//
// 🪤 NO ES UNA DIRECTIVA DE PERMISOS QUE EXISTA. Venía copiada en el `allow` de
// los cuatro reproductores (el código oficial de YouTube pide `accelerometer`),
// y Chrome la ignora y avisa en la consola por cada iframe: «Unrecognized
// feature: 'accelerated-rotation'.» (medido en Chromium el 29-sep-2026).
// Quitarla no cambia nada de lo que se ve.

describe("ningún iframe pide accelerated-rotation", () => {
  it("no aparece en ningún .tsx de app/ ni de components/", () => {
    const conElla = [...recorrerTsx("app/"), ...recorrerTsx("components/")].filter((ruta) =>
      leerFuente(ruta).includes("accelerated-rotation"),
    );
    expect(conElla).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Al menos 200 px de alto: la norma de YouTube para un reproductor incrustado
// ---------------------------------------------------------------------------
//
// YouTube pide un visor de al menos 200×200 px. En 16:9, con una pantalla de
// 360 px de ancho el visor medía 183 px de alto, y con una de 390, 199.
//
// 🪤 202 Y NO 200: el visor es lo que queda DENTRO del borde. Los iframes
// llevan 1 px de borde arriba y abajo con border-box, así que min-h-[200px]
// deja un visor de 198 (medido en Chromium). Y el mínimo va en el <iframe>, no
// en la caja que lo envuelve: en el modal, puesto en la caja, la ensanchaba 3 px
// más allá de su hueco (el alto mínimo pasa al ancho a través del 16:9).

const MINIMO = "min-h-[202px]";

function etiquetaIframe(html: string): string | null {
  return /<iframe\s[^>]*>/.exec(html)?.[0] ?? null;
}

describe("los reproductores miden al menos 200 px de alto por dentro", () => {
  it("el directo del evento", () => {
    const html = renderToStaticMarkup(
      EventLiveEmbed({ videoId: "qM-h-OudTqM", videoTitle: TITULO, eventName: "UFC 330" }),
    );
    expect(etiquetaIframe(html)).toContain(MINIMO);
  });

  it("UFC TV", () => {
    const html = renderToStaticMarkup(UfcTv({ mode: "loop", ids: BUCLE, channels: ["ufc-es"] }));
    expect(etiquetaIframe(html)).toContain(MINIMO);
  });

  it("el modal de vídeo de /videos (va por un portal: en node no se pinta, se lee el fuente)", () => {
    const encontrados = iframes(leerFuente("components/video-modal.tsx"));
    expect(encontrados, "video-modal.tsx ya no pinta ningún iframe").toHaveLength(1);
    expect(encontrados[0]).toContain(MINIMO);
  });
});
