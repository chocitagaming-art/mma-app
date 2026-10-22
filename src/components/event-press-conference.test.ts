import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EventPressConferenceSection } from "@/components/event-press-conference";

// LA RUEDA DE PRENSA EN LA FICHA DEL EVENTO, pintada en servidor (sin DOM: el
// clic que monta el iframe es del navegador y lo mira e2e/rueda-prensa.spec.ts).
//
// Lo que se juzga aquí es lo que ya se rompió una vez con el careo (UFC 331,
// 18-sep): que el rótulo de la SECCIÓN no se haga pasar por el del VÍDEO. El
// vídeo del UFC 333 lo eligió el dueño el 22-oct y NO es de la UFC: es una
// resubida del canal «MMA Español». Lo único que lo dice es su título real, así
// que ese título tiene que verse y tiene que ser el nombre del reproductor.

const UFC_333 = {
  videoId: "g3h-jwpkxJU",
  videoTitle: "UFC 333: CONFERENCIA DE PRENSA COMPLETA EN ESPAÑOL",
  eventName: "UFC 333: Volkanovski vs. Evloev",
};

function pintar(props: Parameters<typeof EventPressConferenceSection>[0]): string {
  return renderToStaticMarkup(createElement(EventPressConferenceSection, props));
}

describe("la sección «Rueda de prensa»", () => {
  it("🔴 sin vídeo no se pinta nada: ni el rótulo ni un hueco", () => {
    expect(pintar({ ...UFC_333, videoId: null, videoTitle: null })).toBe("");
  });

  it("🔴 con vídeo, el rótulo de la sección y la fachada del careo, en su columna de 768 px", () => {
    const html = pintar(UFC_333);
    expect(html).toMatch(/<section class="mx-auto mt-8 w-full max-w-3xl">/);
    expect(html).toMatch(/<h2[^>]*>.*Rueda de prensa<\/h2>/);
    // La fachada de siempre: miniatura + ▶, sin iframe hasta el clic. La
    // miniatura es la de ESE vídeo. (Aquí next/image no lee el `unoptimized` de
    // next.config.ts y la URL sale por /_next/image, codificada: por eso el
    // separador puede ser «/» o «%2F».)
    expect(html).toMatch(/<img[^>]*\ssrc="[^"]*i\.ytimg\.com(\/|%2F)vi(\/|%2F)g3h-jwpkxJU(\/|%2F)/);
    expect(html).toContain("<button");
    expect(html).not.toContain("<iframe");
  });

  it("🔴 el título REAL del vídeo se ve debajo y es el nombre del reproductor", () => {
    const html = pintar(UFC_333);
    expect(html).toContain(
      '<p class="mt-2 text-sm font-medium text-balance">UFC 333: CONFERENCIA DE PRENSA COMPLETA EN ESPAÑOL</p>',
    );
    expect(html).toContain(
      'aria-label="Reproducir: UFC 333: CONFERENCIA DE PRENSA COMPLETA EN ESPAÑOL"',
    );
  });

  it("🔴 sin título: el rótulo de reserva solo en el nombre accesible, nada inventado a la vista", () => {
    // Igual que el careo sin título: el lector de pantalla necesita un nombre,
    // pero en pantalla no se escribe una frase que el vídeo no ha dicho.
    const html = pintar({ ...UFC_333, videoTitle: null });
    expect(html).toContain('aria-label="Reproducir: Rueda de prensa · UFC 333: Volkanovski vs. Evloev"');
    // `<p` a secas casaría con los <path> del icono.
    expect(html).not.toMatch(/<p[\s>]/);
  });

  it("🔴 un vídeo que la ficha ya enseña (careo o pesaje) no se repite", () => {
    expect(pintar({ ...UFC_333, alreadyShown: [null, "g3h-jwpkxJU"] })).toBe("");
    expect(pintar({ ...UFC_333, alreadyShown: ["hVvIw8K754c", null] })).not.toBe("");
  });
});
