// El ancho de la columna de los reproductores de directo: UFC TV y el directo
// de la velada (EventLiveEmbed).
//
//   page → 768 px. La ficha del evento (alineado con su póster) y /en-vivo.
//   home → la portada. Crece con el ALTO de la ventana:
//          clamp(48rem, (100vh − 10rem) × 16/9, 64rem). Los 10rem son la
//          cabecera fija y los rótulos de encima del vídeo: en una ventana baja
//          el bloque entero sigue cabiendo en la pantalla, en una normal mide
//          1024 px (el tope) y nunca baja de 768, que es lo que medía antes.
//
// UFC TV solo se pinta en la portada y usa siempre `home`. El directo del
// evento la usa allí también (column="home" en home-live-slot.tsx), para que
// el hueco no cambie de tamaño al pasar del bucle al directo de la velada.
//
// 🪤 LAS CLASES VAN LITERALES Y ENTERAS. Tailwind v4 saca el CSS leyendo el
// código fuente y no ve una clase montada a trozos: desaparecería en producción
// sin avisar y el vídeo ocuparía el carril entero. Y sin espacios dentro de los
// corchetes: Tailwind pone solo los de alrededor de - * /. Lo vigila
// lib/live-embed-callsites.test.ts, y los píxeles, e2e/maquetacion.spec.ts.
export const LIVE_PLAYER_COLUMN = {
  page: "max-w-3xl",
  home: "max-w-[clamp(48rem,calc((100vh-10rem)*16/9),64rem)]",
} as const;

export type LivePlayerColumn = keyof typeof LIVE_PLAYER_COLUMN;
