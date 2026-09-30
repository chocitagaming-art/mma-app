import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AvisoLegalPage from "@/app/aviso-legal/page";
import PrivacidadPage, { metadata as privacidadMetadata } from "@/app/privacidad/page";

// 🪤 /privacidad AFIRMA COSAS, y el código las puede dejar falsas sin avisar.
//
// Pasó el 2-ago-2026 con /contacto (tres frases falsas el mismo día) y volvió a
// pasar con YouTube: UFC TV, el directo, /videos y los vídeos de los combates
// incrustan el reproductor de youtube-nocookie.com, y la página seguía diciendo
// «no hay nada que consentir» sin nombrar ni a YouTube ni a Google.
//
// Lo medido el 29-sep-2026 (maqueta-shorts/capturas/privacidad_medida.json):
// CERO cookies, pero el reproductor guarda datos en el navegador bajo
// youtube-nocookie.com (localStorage, IndexedDB y Cache Storage, ~16 KB) y se
// conecta con servidores de Google nada más cargarse, sin ningún clic.
//
// Aquí se RENDERIZA la página y se mira el texto que sale, no el fuente: un
// comentario en el .tsx no cuenta como aviso al visitante.

const SRC = new URL("../", import.meta.url);

// Las fuentes que acaban en la web: solo app/, components/ y lib/, sin tests.
// Un vigilante que se cuenta entre los vigilados no vigila nada.
function fuentesDe(rutaRelativa: string): Array<[string, string]> {
  const fuentes: Array<[string, string]> = [];
  for (const entrada of readdirSync(fileURLToPath(new URL(rutaRelativa, SRC)), {
    withFileTypes: true,
  })) {
    const hijo = `${rutaRelativa}${entrada.name}`;
    if (entrada.isDirectory()) {
      fuentes.push(...fuentesDe(`${hijo}/`));
    } else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      fuentes.push([hijo, readFileSync(fileURLToPath(new URL(hijo, SRC)), "utf8")]);
    }
  }
  return fuentes;
}

const FUENTES = [...fuentesDe("app/"), ...fuentesDe("components/"), ...fuentesDe("lib/")];

// El texto visible: sin etiquetas y con los espacios de JSX colapsados.
function textoDe(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const TERMINOS_YOUTUBE = "https://www.youtube.com/t/terms";
const PRIVACIDAD_GOOGLE = "https://policies.google.com/privacy";

describe("/privacidad cuenta lo que hace el reproductor de YouTube", () => {
  const html = renderToStaticMarkup(PrivacidadPage());
  const texto = textoDe(html);

  it("la web SÍ incrusta YouTube hoy (si deja de hacerlo, revisa esta página)", () => {
    const sitios = FUENTES.filter(([, fuente]) => fuente.includes("youtube-nocookie.com/embed"));
    expect(sitios.length).toBeGreaterThan(0);
  });

  it("ningún reproductor vuelve a youtube.com, la versión CON cookies", () => {
    // Esto es lo que sostiene la frase «medido, cero cookies». La CSP deja
    // enmarcar https://www.youtube.com, así que un cambio de dominio en
    // youtube-facade.tsx o en video-modal.tsx funcionaría igual en producción
    // y la página seguiría prometiendo lo que ya no es verdad. Enlazar a
    // youtube.com/watch sí vale: eso es salir de la web, no incrustar.
    const conCookies = FUENTES.filter(([, fuente]) =>
      /youtube\.com\/(embed|iframe_api)/.test(fuente),
    ).map(([ruta]) => ruta);
    expect(conCookies).toEqual([]);
  });

  it("nombra a YouTube, a Google y a quién lo presta en la UE", () => {
    expect(texto).toMatch(/YouTube/);
    expect(texto).toContain("Google Ireland Limited");
    expect(texto).toContain("youtube-nocookie.com");
  });

  it("enlaza los Términos de YouTube y la Política de Privacidad de Google", () => {
    expect(html).toContain(`href="${TERMINOS_YOUTUBE}"`);
    expect(html).toContain(`href="${PRIVACIDAD_GOOGLE}"`);
  });

  it("dice qué guarda el reproductor en el navegador, como se midió", () => {
    for (const almacen of ["localStorage", "IndexedDB", "Cache Storage"]) {
      expect(texto, `falta ${almacen}`).toContain(almacen);
    }
  });

  it("dice que se conecta con Google al cargarse, sin que el visitante pulse nada", () => {
    expect(texto).toMatch(/servidores de Google/);
    expect(texto).toMatch(/sin que (pulses|toques) nada/);
  });

  it("no afirma ya que no haya nada que consentir", () => {
    expect(texto).not.toMatch(/no hay nada que consentir/i);
  });

  it("sigue diciendo que no usa cookies, que es literalmente cierto (0 medidas)", () => {
    // Lo exige también e2e/routes.spec.ts (/no usa cookies/i).
    expect(texto).toMatch(/no usa cookies/i);
  });

  it("nombra a Wikimedia, que sirve los carteles de los eventos antiguos", () => {
    // 285 carteles de events.image_url vienen de upload.wikimedia.org
    // (medido el 30-sep-2026, del 12-jul-1996 al 9-ago-2025).
    expect(texto).toContain("upload.wikimedia.org");
  });

  it("no atribuye los carteles a ESPN: ESPN solo pone fotos de luchadores", () => {
    expect(texto).not.toMatch(/carteles \(ufc\.com y ESPN\)/);
    expect(texto).toMatch(/fotos de los luchadores \(ufc\.com y ESPN\)/);
  });

  it("cuenta las cookies que otros servidores mandan con sus imágenes", () => {
    // Medido el 30-sep-2026: WMF-Uniq (upload.wikimedia.org, 1 año, Chrome la
    // guarda), STYXKEY_region (www.ufc.com, 2 días, Chrome la rechaza) y
    // __cf_bm (sherdog.com, 30 min).
    for (const [servidor, cookie] of [
      ["upload.wikimedia.org", "WMF-Uniq"],
      ["www.ufc.com", "STYXKEY_region"],
      ["sherdog.com", "__cf_bm"],
    ]) {
      expect(texto, `falta ${servidor}`).toContain(servidor);
      expect(texto, `falta ${cookie}`).toContain(cookie);
    }
    expect(texto).toMatch(/Esta web no las lee ni las pone/);
  });

  it("el resumen avisa de que otros servidores sí pueden poner cookies", () => {
    // Solo la entradilla: el resto de la página ya nombra otros servidores.
    const inicio = texto.indexOf("Resumen:");
    const resumen = texto.slice(inicio, texto.indexOf("Lo que esta web NO hace", inicio));
    expect(resumen.length).toBeGreaterThan(0);
    expect(resumen).toMatch(/otros servidores.*cookie/);
  });

  it("la metadescripción no resume la página como si YouTube no existiera", () => {
    expect(String(privacidadMetadata.description)).toMatch(/YouTube/);
  });

  it("la metadescripción dice «sin cookies» de esta web, no del navegador", () => {
    const descripcion = String(privacidadMetadata.description);
    expect(descripcion).not.toMatch(/sin cookies/);
    expect(descripcion).toMatch(/esta web no pone cookies/);
  });

  it("lleva la fecha del cambio", () => {
    expect(texto).toContain("30 de septiembre de 2026");
  });
});

describe("/aviso-legal dice con qué reproductor van los vídeos", () => {
  const html = renderToStaticMarkup(AvisoLegalPage());
  const texto = textoDe(html);

  it("los vídeos van con el reproductor oficial de YouTube y sus Términos, enlazados", () => {
    expect(texto).toMatch(/reproductor oficial de YouTube/);
    expect(html).toContain(`href="${TERMINOS_YOUTUBE}"`);
  });

  it("lleva la fecha del cambio", () => {
    expect(texto).toContain("30 de septiembre de 2026");
  });
});
