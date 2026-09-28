"use client";

import { useSyncExternalStore } from "react";

// El <iframe> de UFC TV, lo único de UFC TV que corre en el navegador.
//
// 🪤 UFC TV ARRANCA SOLO EN CADA VISITA A LA PORTADA, 24/7 —no solo la noche de
// la velada, como el bloque del evento—, así que aquí sí se respeta
// `prefers-reduced-motion`, igual que VideoHero en esta misma portada y que
// globals.css en todo el sitio. Quien lo pide recibe la URL QUIETA: sin
// autoplay y sin mute (si le da a play, quiere oírlo).
//
// Las dos URLs llegan hechas del servidor, de los constructores probados de
// lib/ufc-tv.ts (liveEmbedUrl/loopEmbedUrl): aquí solo se elige una. Este
// fichero no puede importar lib/ufc-tv.ts, que es solo de servidor.
//
// Mismo patrón useSyncExternalStore que VideoHero: el servidor pinta la de
// autoplay (la preferencia del navegador no la sabe) y el cliente cambia a la
// quieta al hidratar si toca. Como el iframe es `loading="lazy"` y cae bajo
// el pliegue, casi siempre cambia antes de haber cargado nada; si ya estaba a
// la vista, recarga sin autoplay (y lo poco que sonase, sonaba mudo).

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function UfcTvPlayer({
  src,
  calmSrc,
  title,
}: {
  src: string;
  calmSrc: string;
  title: string;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

  // Arranca solo y mudo (lo lleva la URL) y `autoplay` va además en `allow`,
  // o la política de permisos del iframe lo corta antes de que YouTube lea el
  // parámetro. `loading="lazy"`: no arranca hasta que el bloque entra en
  // pantalla, así que no gasta datos de quien no baja hasta aquí. La red de
  // las cuatro cosas: lib/live-embed-callsites.test.ts.
  return (
    <iframe
      src={reducedMotion ? calmSrc : src}
      title={title}
      loading="lazy"
      allow="autoplay; accelerated-rotation; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      className="aspect-video w-full rounded-lg border border-border bg-muted"
    />
  );
}
