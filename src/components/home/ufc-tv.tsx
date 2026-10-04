import { Tv } from "lucide-react";

import { LiveEmbedPlayer } from "@/components/playback/live-embed-player";
import { LIVE_PLAYER_COLUMN } from "@/lib/live-player-column";
import {
  isRealLive,
  isYouTubeVideoId,
  liveEmbedUrl,
  loopEmbedUrl,
  youtubeWatchUrl,
  type LiveCandidate,
  type UfcChannel,
} from "@/lib/ufc-tv";

// UFC TV: el reproductor siempre encendido de la portada, bajo el hero del
// próximo evento. Qué pintar lo decide HomeLiveSlot; esto solo lo enmarca.
//
// ⚠️ ESTA WEB NO RETRANSMITE NADA, igual que en event-live-embed.tsx: es el
// reproductor de los canales oficiales de la UFC en YouTube, servido por
// YouTube. Si un vídeo cae, se ve el aviso del propio YouTube dentro del marco.
//
// 🪤 LOS RÓTULOS NO SE INVENTAN (misma filosofía que el bloque del evento):
//   · En directo se pinta el TÍTULO REAL del vídeo y de qué canal es. «EN
//     DIRECTO» solo si de verdad lo es (duración P0D); un estreno de YouTube se
//     rotula «Estreno», que es lo que es: un vídeo grabado emitiéndose a una hora.
//   · En bucle NO se dice qué combate suena: el servidor solo sabe la lista y el
//     orden, y el que está en pantalla en este segundo lo sabe el reproductor.
//     Por eso el texto describe el bucle, no el vídeo.
//
// Componente de SERVIDOR, sin estado. The player (poster or iframe) is the
// client LiveEmbedPlayer (components/playback/live-embed-player.tsx), the SAME
// component EventLiveEmbed uses, so the home slot cannot change size when it
// goes from the loop to the event's broadcast. It mounts the iframe only when
// the turn manager gives it the turn (in view, one player at a time).

type UfcTvProps =
  | { mode: "live"; video: LiveCandidate; className?: string }
  | { mode: "loop"; ids: string[]; channels: UfcChannel[]; className?: string };

const CHANNEL_SOURCE: Record<UfcChannel, string> = {
  ufc: "Canal oficial de la UFC (fuente YouTube)",
  "ufc-es": "Canal oficial de UFC Español (fuente YouTube)",
};

function loopSource(channels: UfcChannel[]): string {
  const en = channels.includes("ufc");
  const es = channels.includes("ufc-es");
  if (en && es) {
    return "Peleas completas de los canales oficiales de la UFC y de UFC Español, en bucle (fuente YouTube)";
  }
  return es
    ? "Peleas completas del canal oficial de UFC Español, en bucle (fuente YouTube)"
    : "Peleas completas del canal oficial de la UFC, en bucle (fuente YouTube)";
}

export function UfcTv(props: UfcTvProps) {
  // Las URLs salen SIEMPRE de los dos constructores de lib/ufc-tv.ts, que
  // llevan el acuerdo «arranca solo y mudo» y devuelven null para cualquier id
  // que no sea de YouTube ('off' incluido). Sin URL no hay bloque.
  const src = props.mode === "live" ? liveEmbedUrl(props.video.videoId) : loopEmbedUrl(props.ids);
  // For a tap under 200x200: the video on youtube.com. The loop's is the one
  // it starts with, the first valid id (the one loopEmbedUrl puts in the path).
  const watchUrl = youtubeWatchUrl(
    props.mode === "live" ? props.video.videoId : (props.ids.find(isYouTubeVideoId) ?? ""),
  );
  if (!src || !watchUrl) {
    return null;
  }

  const live = props.mode === "live";
  const premiere = live && !isRealLive(props.video);
  // The poster names the block, never the fight (in the loop only the player
  // knows which one is on), and «En directo» only when it really is.
  const posterLabel = !live ? "UFC TV · Peleas completas" : premiere ? "UFC TV · Estreno" : "UFC TV · En directo";

  return (
    <section className={props.className} data-ufc-tv={props.mode}>
      {/* El centrado va en la COLUMNA, no en el <iframe>: mismo motivo que en
          event-live-embed.tsx (rótulo y vídeo alineados, no descuadrados). Y
          la columna es la de la portada, la única página donde vive UFC TV:
          crece con el alto de la ventana hasta 1024 px (ver
          lib/live-player-column.ts). */}
      <div className={`mx-auto w-full ${LIVE_PLAYER_COLUMN.home}`}>
        <h2 className="mb-3 flex flex-wrap items-center gap-2 font-display text-sm font-bold tracking-[0.12em] text-muted-foreground uppercase">
          <Tv className="size-4" aria-hidden />
          {live ? "UFC TV" : "UFC TV · Peleas completas"}
          {/* 🪤 EL DISTINTIVO ES EL CHIP «EN VIVO» DE LA CABECERA, clase por
              clase (live-nav-chip.tsx): texto --primary sobre un 5 % de
              --primary, sin hover de fondo. Es una combinación ya medida en
              lib/contrast.test.ts (4,5:1 en los dos temas sobre --background,
              que es el fondo de la portada aquí), y ese test lee también este
              fichero: si alguien sube el tinte, cae. */}
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/5 px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide text-primary">
              <span
                aria-hidden
                className="live-dot inline-block size-1.5 rounded-full bg-primary shadow-[0_0_8px_1px_var(--primary)]"
              />
              {premiere ? "Estreno" : "En directo"}
            </span>
          ) : null}
        </h2>

        {props.mode === "live" ? (
          <>
            <p className="mb-2 text-sm font-medium text-balance">{props.video.title}</p>
            <p className="mb-3 font-mono text-[0.7rem] text-muted-foreground">
              {CHANNEL_SOURCE[props.video.channel]}
            </p>
          </>
        ) : (
          <p className="mb-3 font-mono text-[0.7rem] text-muted-foreground">
            {loopSource(props.channels)}
          </p>
        )}

        {/* The player is a client component under the turn manager; the
            frame is the one EventLiveEmbed uses. */}
        <div className="w-full">
          <LiveEmbedPlayer
            id={live ? "tv-directo" : "tv-bucle"}
            src={src}
            watchUrl={watchUrl}
            title={
              props.mode === "live"
                ? `${props.video.title} · UFC TV`
                : "UFC TV · Peleas completas en bucle"
            }
            label={posterLabel}
          />
        </div>
      </div>
    </section>
  );
}
