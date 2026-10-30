import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FightVideoPlayer } from "@/components/fight-video-player";
import { isYouTubePlaceholder, youtubeThumbnail } from "@/lib/youtube-thumbnail";

// LA PORTADA DE LOS VÍDEOS DEL EVENTO (careo, pesaje, rueda de prensa y vídeo
// del combate). El 30-oct-2026 YouTube siguió sirviendo durante horas la
// portada VIEJA del pesaje de la 1099 en hqdefault (13 de 40 peticiones) y la
// buena en sddefault (40 de 40): ahora se pide sddefault y hqdefault queda de
// reserva para los vídeos que no tienen ese tamaño. El cambio de imagen en el
// navegador (el 404 o la imagen gris de 120×90) lo mira e2e/rueda-prensa.spec.ts.

describe("youtubeThumbnail", () => {
  it("monta la dirección de i.ytimg.com con el tamaño pedido", () => {
    expect(youtubeThumbnail("AD5HnrXf5MY", "sddefault")).toBe(
      "https://i.ytimg.com/vi/AD5HnrXf5MY/sddefault.jpg",
    );
    expect(youtubeThumbnail("AD5HnrXf5MY", "hqdefault")).toBe(
      "https://i.ytimg.com/vi/AD5HnrXf5MY/hqdefault.jpg",
    );
  });
});

describe("isYouTubePlaceholder", () => {
  it("la imagen gris de 120×90 de un tamaño que no existe es el relleno", () => {
    expect(isYouTubePlaceholder(120)).toBe(true);
    expect(isYouTubePlaceholder(90)).toBe(true);
  });

  it("una portada de verdad no lo es, y una imagen sin decodificar (0) tampoco", () => {
    expect(isYouTubePlaceholder(640)).toBe(false);
    expect(isYouTubePlaceholder(480)).toBe(false);
    expect(isYouTubePlaceholder(0)).toBe(false);
  });
});

describe("FightVideoPlayer", () => {
  it("🔴 pide la portada en sddefault, no en hqdefault", () => {
    const html = renderToStaticMarkup(
      createElement(FightVideoPlayer, { videoId: "AD5HnrXf5MY", title: "Moicano vs Nolan Weigh-Ins" }),
    );
    // En vitest next/image no lee el `unoptimized` de next.config.ts y la URL
    // sale por /_next/image, codificada: «/» o «%2F».
    expect(html).toMatch(/i\.ytimg\.com(\/|%2F)vi(\/|%2F)AD5HnrXf5MY(\/|%2F)sddefault\.jpg/);
    expect(html).not.toContain("hqdefault");
  });
});
