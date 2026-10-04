import { Radio } from "lucide-react";

import { LiveEmbedPlayer } from "@/components/playback/live-embed-player";
import { LIVE_PLAYER_COLUMN, type LivePlayerColumn } from "@/lib/live-player-column";
import { liveEmbedUrl, youtubeWatchUrl, type UfcChannel } from "@/lib/ufc-tv";

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
// Es un componente de SERVIDOR: no lleva estado ni "use client". The player
// is the client LiveEmbedPlayer (components/playback/live-embed-player.tsx,
// shared with UFC TV): it ARRANCA SOLO Y MUDO (`autoplay=1&mute=1&playsinline=1`,
// más `autoplay` en `allow`), because the owner wants the broadcast seen
// without pressing play, but only when the turn manager gives it the turn:
// more than half of it in view for 400 ms, one player at a time, nothing
// under prefers-reduced-motion. `mute=1` es obligatorio, no estético: sin él
// no arranca. La red que lo vigila: lib/live-embed-callsites.test.ts.
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
  // liveEmbedUrl / youtubeWatchUrl return null for anything that is not a
  // YouTube id: that is the "last gate" above.
  const src = liveEmbedUrl(videoId);
  const watchUrl = youtubeWatchUrl(videoId);
  if (!videoTitle || eventOver || !src || !watchUrl) {
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

            Y un cuarto que lo COMPARTE: UFC TV (components/home/ufc-tv.tsx)
            uses the same LiveEmbedPlayer, so the home slot does not change
            size when it goes from the loop to the event's broadcast. Tocar
            el marco es tocarlo en los cuatro.

            The iframe is not written here any more: LiveEmbedPlayer (client)
            shows a poster and the turn manager mounts the iframe only in
            view and one player at a time (the home short, UFC TV, this). The
            URL comes from liveEmbedUrl (lib/ufc-tv.ts), whose exact params
            lib/ufc-tv.test.ts pins: autoplay=1 AND mute=1 (Chrome and Safari
            block a start with sound) AND playsinline=1 (iOS would go full
            screen). prefers-reduced-motion is honoured now: nothing starts
            on its own, the poster's ▶ does.

            🪤 AL MENOS 200 PX DE ALTO POR DENTRO (`min-h-[202px]` on the
            player's box, see live-embed-player.tsx). YouTube pide un
            reproductor de al menos 200×200, y en un móvil de 360 px el 16:9
            se quedaba en 183. Es 202 y no 200 porque el borde de 1 px va por
            dentro de la caja (border-box). Con una columna de menos de 359 px
            el marco deja de ser 16:9 y el
            propio reproductor pone franjas arriba y abajo. */}
        <div className="w-full">
          <LiveEmbedPlayer
            id="evento"
            src={src}
            watchUrl={watchUrl}
            title={`${videoTitle} · ${eventName}`}
            label="Retransmisión oficial"
          />
        </div>
      </div>
    </section>
  );
}
