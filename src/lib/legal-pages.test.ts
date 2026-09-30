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

// Qué ficheros incrustan el reproductor. Solo app/, components/ y lib/, sin
// tests: un vigilante que se cuenta entre los vigilados no vigila nada.
function ficherosConYoutube(rutaRelativa: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(fileURLToPath(new URL(rutaRelativa, SRC)), {
    withFileTypes: true,
  })) {
    const hijo = `${rutaRelativa}${entrada.name}`;
    if (entrada.isDirectory()) {
      encontrados.push(...ficherosConYoutube(`${hijo}/`));
    } else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      const fuente = readFileSync(fileURLToPath(new URL(hijo, SRC)), "utf8");
      if (fuente.includes("youtube-nocookie.com/embed")) {
        encontrados.push(hijo);
      }
    }
  }
  return encontrados;
}

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
    const sitios = [
      ...ficherosConYoutube("app/"),
      ...ficherosConYoutube("components/"),
      ...ficherosConYoutube("lib/"),
    ];
    expect(sitios.length).toBeGreaterThan(0);
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

  it("la metadescripción no resume la página como si YouTube no existiera", () => {
    expect(String(privacidadMetadata.description)).toMatch(/YouTube/);
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
