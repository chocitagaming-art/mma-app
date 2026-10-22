import { Mic } from "lucide-react";

import { FightVideoPlayer } from "@/components/fight-video-player";

// La RUEDA DE PRENSA del evento (migración 033 de mma-ingesta): un sitio nuevo
// de la ficha, decidido por el dueño el 22-oct-2026, que hasta ahora tenía
// careo, pesaje y directo pero no la conferencia.
//
// Mismo diseño que el careo y el pesaje: un video id + su título REAL, la misma
// fachada (FightVideoPlayer) y la misma columna de 768 px. Si no hay vídeo no
// se pinta nada, ni un hueco ni un «no disponible». El id se fija SOLO a mano
// con fijar_videos_evento: ningún cron lo busca.
//
// 🪤 «Rueda de prensa» es el rótulo de la SECCIÓN, no del vídeo, y por eso no
// dice «oficial»: la del UFC 333 que eligió el dueño es una RESUBIDA en español
// del canal «MMA Español», no la de la UFC (que la publica en inglés). Debajo se
// lee el título real, que es lo único que dice de verdad qué se está viendo.
// Sin título, el rótulo de reserva va solo en el nombre accesible, como en el
// careo: en pantalla no se escribe algo que el vídeo no ha dicho.
//
// 🪤 FUERA DEL TURNERO, igual que el careo y el pesaje (tarea 8 del BACKLOG):
// con el directo sonando, darle al ▶ aquí deja dos reproductores a la vez. No
// se arregla aquí a propósito: el día que entren las fachadas, entra esta.
export function EventPressConferenceSection({
  videoId,
  videoTitle,
  eventName,
  alreadyShown = [],
}: {
  videoId: string | null;
  videoTitle: string | null;
  eventName: string;
  // Los vídeos que la ficha ya enseña en otra sección (careo, pesaje): el mismo
  // id no se pinta dos veces en la página.
  alreadyShown?: readonly (string | null | undefined)[];
}) {
  if (!videoId || alreadyShown.includes(videoId)) {
    return null;
  }

  return (
    <section className="mx-auto mt-8 w-full max-w-3xl">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <Mic className="size-4" />
        Rueda de prensa
      </h2>
      <div className="w-full">
        <FightVideoPlayer
          videoId={videoId}
          title={videoTitle ?? `Rueda de prensa · ${eventName}`}
        />
        {videoTitle ? (
          <p className="mt-2 text-sm font-medium text-balance">{videoTitle}</p>
        ) : null}
      </div>
    </section>
  );
}
