import { Radio } from "lucide-react";

import { LIVE_PLAYER_COLUMN, type LivePlayerColumn } from "@/lib/live-player-column";
import { isYouTubeVideoId, type UfcChannel } from "@/lib/ufc-tv";

// El directo que la UFC emite EN ABIERTO la noche de la velada, incrustado.
//
// ⚠️ ESTA WEB NO RETRANSMITE NADA. Lo que hay aquí es el reproductor del canal
// oficial de la UFC en YouTube, servido por YouTube. Si el vídeo desaparece o
// deja de estar disponible, se ve el aviso del propio YouTube dentro del marco,
// que es más honesto que cualquier cosa que pudiéramos escribir nosotros.
//
// 🪤 EL RÓTULO NO SE INVENTA: sale del TÍTULO REAL DEL VÍDEO.
//
// La tentación era poner «EN DIRECTO» o «Ver la velada en directo», y las dos
// serían falsas. La UFC NO emite los combates gratis en YouTube —el estelar es
// de pago, Paramount+ o DAZN según el mercado— y lo que sí publica en abierto es
// la PREVIA del evento, a veces las preliminares iniciales. Un rótulo escrito a
// mano haría que alguien se siente a esperar el combate delante de una tertulia.
// El título del vídeo lo dice solo: «UFC 330 | Previa del Evento ¡EN VIVO!».
//
// Y por eso tampoco pone la hora ni «empieza en X minutos»: el vídeo puede estar
// programado, en directo o acabado, y la única fuente que sabe cuál de las tres
// es en este segundo es el propio reproductor. Lo dice él dentro del marco.
//
// Es un componente de SERVIDOR: no lleva estado ni "use client". El iframe
// ARRANCA SOLO Y MUDO (`autoplay=1&mute=1&playsinline=1`, más `autoplay` en
// `allow`): el acuerdo con el dueño es que el directo se vea sin darle a play.
// Arrancar con sonido no es opción —es de las pocas cosas que un navegador
// bloquea por su cuenta— y por eso el `mute=1` es obligatorio, no estético. Va
// con `loading="lazy"` para que no arranque hasta que el bloque entra en
// pantalla. El detalle, junto al <iframe>, y la red que lo vigila en
// lib/live-embed-callsites.test.ts.
//
// El vídeo lo elige quien llama, con resolveEventVideo (lib/ufc-tv.ts): el id
// escrito a mano en events.live_video_id si lo hay, y si no el directo de la
// velada que haya detectado UFC TV.

// De quién es la señal. Solo se sabe cuando el vídeo lo ha detectado UFC TV;
// un id escrito a mano no dice de qué canal es, y entonces se queda el rótulo
// genérico de siempre.
const CHANNEL_SOURCE: Record<UfcChannel, string> = {
  ufc: "En abierto en el canal oficial de la UFC (fuente YouTube)",
  "ufc-es": "En abierto en el canal oficial de UFC Español (fuente YouTube)",
};

export function EventLiveEmbed({
  videoId,
  videoTitle,
  channel = null,
  eventName,
  eventOver = false,
  column = "page",
  className,
}: {
  videoId: string;
  videoTitle: string | null;
  // 🪤 Casi todos los directos DETECTADOS son de UFC Español (se prefiere el
  // español, y las previas medidas lo son todas): con el rótulo fijo, cada
  // «Retransmisión oficial» automática decía «canal oficial de la UFC».
  channel?: UfcChannel | null;
  eventName: string;
  // El estelar ya cayó. Lo pasan la ficha del evento y /en-vivo.
  //
  // 🪤 AQUÍ PONÍA que «en la portada y en /en-vivo el evento nunca está
  // terminado». La mitad de /en-vivo era FALSA y costó una noche entera de UFC
  // 330: esa página NO salta al siguiente evento cuando el estelar cae, se
  // queda en el mismo en modo «Finalizado», así que necesita la prop. Sin ella
  // la cabecera decía «Finalizado» y debajo seguía «Retransmisión oficial»
  // sobre «UFC 330 | Previa del Evento ¡EN VIVO!» durante 2-4 h.
  //
  // La portada sí es cierta, y por eso el default es `false`: getNextEventHero
  // excluye el evento por SQL (`AND NOT MAIN_EVENT_FINISHED_SQL`, en
  // queries/events.ts) y pasa al siguiente. Matiz honesto: va con
  // unstable_cache revalidate 1800, así que puede arrastrar el embed hasta 30
  // min. Es desfase de caché acotado, no falta de esta prop.
  eventOver?: boolean;
  // El ancho de la columna (lib/live-player-column.ts). Por defecto los 768 px
  // de la ficha y de /en-vivo; la portada pasa "home", la misma de UFC TV.
  column?: LivePlayerColumn;
  className?: string;
}) {
  // 🪤 DOS MOTIVOS PARA NO PINTAR NADA, y los dos son el mismo: no afirmar algo
  // que ha dejado de ser cierto.
  //
  //   · Sin título no se puede decir QUÉ es el vídeo, y un rótulo escrito a mano
  //     haría creer que ahí se ve el combate. Ver la cabecera del fichero.
  //   · Con el evento ya terminado, «Retransmisión oficial» es falso —y el
  //     título de YouTube suele llevar un «¡EN VIVO!» dentro, así que la ficha
  //     de una velada de hace meses estaría anunciando un directo que acabó.
  //
  // Se probó a cambiar el rótulo en pasado («Vídeo previo del evento») y se
  // descartó por decisión del dueño: si no está, no puede mentir. Es también lo
  // que ya hacía la portada, donde la franja desaparece sola en cuanto el
  // estelar cae y `getNextEventHero` pasa al siguiente evento.
  //
  // La diferencia con el careo, que SÍ se queda para siempre: «Careo oficial»
  // sigue siendo cierto dentro de un año. «Retransmisión» no.
  //
  // Y un tercero: 'off' en events.live_video_id es el interruptor que apaga el
  // directo sin desplegar, no un id de vídeo. Quien llama ya lo resuelve con
  // resolveEventVideo; esto es la última puerta antes del iframe, por si un
  // sitio de llamada nuevo se lo salta. Por eso no compara con 'off' sin más:
  // 'OFF', ' off' o una URL pegada con SQL tampoco son un id de YouTube, y
  // cualquiera de ellos acabaría en `embed/OFF`.
  if (!videoTitle || eventOver || !isYouTubeVideoId(videoId)) {
    return null;
  }

  return (
    <section className={className}>
      {/* 🪤 EL CENTRADO VA EN ESTA COLUMNA, NO EN EL <iframe>. El reproductor ya
          estaba acotado a 768 px, así que centrar solo el marco habría dejado
          el rótulo y el título pegados al borde izquierdo y el vídeo en medio:
          descuadrado. Se centra la COLUMNA entera y el texto sigue alineado a la
          izquierda dentro de ella, que es como se lee un bloque, no como se lee
          un cartel.

          Y el ancho vive aquí ahora: si vuelve al <div> del iframe, el rótulo se
          vuelve a escapar a lo ancho del contenedor padre. La clase sale de
          lib/live-player-column.ts, escrita entera allí: aquí no se monta. */}
      <div className={`mx-auto w-full ${LIVE_PLAYER_COLUMN[column]}`}>
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold tracking-[0.12em] text-muted-foreground uppercase">
          <Radio className="size-4" aria-hidden />
          Retransmisión oficial
        </h2>

        {/* El título real, y la fuente al lado. «Canal oficial de la UFC» importa:
            deja claro de quién es la señal y que esta web solo la enmarca. */}
        <p className="mb-2 text-sm font-medium text-balance">{videoTitle}</p>
        <p className="mb-3 font-mono text-[0.7rem] text-muted-foreground">
          {CHANNEL_SOURCE[channel ?? "ufc"]}
        </p>

        {/* 🪤 EL MARCO NO SE TOCA sin mirar los TRES sitios donde vive: /en-vivo,
            la ficha del evento y la portada. Al arreglar la portada estuvo a punto
            de cambiarse aquí el tamaño y las esquinas, y eso habría movido las
            otras dos, que ya estaban bien. Lo que fallaba era la franja que lo
            envolvía en la portada, no el reproductor.

            Y un cuarto que lo COPIA: UFC TV (components/home/ufc-tv.tsx, el
            iframe en ufc-tv-player.tsx) usa este mismo marco para que el hueco
            de la portada no cambie de tamaño al pasar del bucle de peleas al
            directo de la velada. Si se toca aquí, se toca allí.

            🪤 ARRANCA SOLO, Y ARRANCA MUDO — las dos cosas son obligatorias, no
            una preferencia. `autoplay=1` sin `mute=1` NO arranca: Chrome y Safari
            bloquean por su cuenta cualquier vídeo que empiece con sonido, así que
            el resultado sería un reproductor parado y la sensación de que el
            arreglo no funcionó. Y `autoplay` tiene que estar ADEMÁS en el
            atributo `allow`, o la política de permisos del iframe lo corta antes
            de que YouTube lea el parámetro.

            `playsinline=1` es para iOS: sin él, Safari de iPhone se lleva el
            vídeo a pantalla completa él solo en cuanto arranca.

            Sigue con `loading="lazy"` a propósito: así no arranca al cargar la
            página, sino cuando el bloque entra en pantalla. Es lo que evita que
            la portada se ponga a consumir datos de alguien que nunca baja hasta
            aquí.

            ⚠️ LO QUE ESTO NO HACE: no respeta `prefers-reduced-motion`. No se
            puede desde aquí — el src se fija al renderizar y esto es un
            componente de SERVIDOR, así que para leer la preferencia del
            navegador habría que convertirlo en cliente (lo que hace ufc-tv-player.tsx).
            Lo que sí se cumple es la WCAG 2.2.2: el reproductor de YouTube trae
            su propio botón de pausa, que es el mecanismo que la norma exige.
            UFC TV sí la respeta (ufc-tv-player.tsx, un iframe de cliente)
            porque arranca en CADA visita a la portada; este solo la noche de
            la velada. Si se quiere aquí también, es reutilizar ese patrón.

            🪤 AL MENOS 200 PX DE ALTO POR DENTRO (`min-h-[202px]`). YouTube
            pide un reproductor de al menos 200×200, y en un móvil de 360 px
            el 16:9 se quedaba en 183. Es 202 y no 200 porque el borde de 1 px
            va por dentro de la caja (border-box): con 200, el visor medía 198.
            Con una columna de menos de 359 px el marco deja de ser 16:9 y el
            propio reproductor pone franjas arriba y abajo. */}
        <div className="w-full">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1`}
            title={`${videoTitle} · ${eventName}`}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="aspect-video min-h-[202px] w-full rounded-lg border border-border bg-muted"
          />
        </div>
      </div>
    </section>
  );
}
