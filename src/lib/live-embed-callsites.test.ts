import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
    // portada (`getNextEventHero` → `nextEvent.liveVideoId` en `app/page.tsx`).
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

  it("no hay un cuarto sitio: son exactamente esos tres", () => {
    // El fallo fue añadir/mover un sitio de llamada y olvidar la prop. Si
    // mañana aparece un cuarto, este test lo señala y quien lo añada tiene que
    // decidir a conciencia si le toca `eventOver` o la exención de la portada.
    const sitios = [...recorrerTsx("app/"), ...recorrerTsx("components/")]
      .filter((ruta) => leerFuente(ruta).includes("<EventLiveEmbed"))
      .sort();
    expect(sitios).toEqual([
      "app/en-vivo/page.tsx",
      "app/eventos/[id]/page.tsx",
      "app/page.tsx",
    ]);
  });
});
