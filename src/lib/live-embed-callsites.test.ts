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
