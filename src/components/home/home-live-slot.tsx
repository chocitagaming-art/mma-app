import type { ReactNode } from "react";

import { EventLiveEmbed } from "@/components/event-live-embed";
import { UfcTv } from "@/components/home/ufc-tv";
import type { NextEventHero } from "@/lib/types";
import {
  buildLoopIds,
  getFullFightPool,
  getLivePick,
  needsLiveDetection,
  planHomeSlot,
  utcDaySeed,
  type LivePick,
  type UfcChannel,
} from "@/lib/ufc-tv";

// El hueco de la portada justo debajo del hero del próximo evento. Pinta COMO
// MUCHO UN reproductor, y lo elige planHomeSlot (lib/ufc-tv.ts, con sus tests):
//
//   1. events.live_video_id = 'off'  → NADA. Es el interruptor del dueño para
//      apagar lo automático sin desplegar; apaga también UFC TV. (Sin desplegar
//      no es al instante: la columna llega aquí por getNextEventHero, cacheada
//      30 min, salvo que quien la escribe llame a /api/revalidate.)
//   2. live_video_id escrito a mano  → el directo de la velada, ese (la
//      columna manda, migración 027). Sin título, nada.
//   3. el directo de la velada DETECTADO para el próximo evento (previa,
//      pre-show, preliminares en su ventana) → el mismo bloque, con el id, el
//      título y el canal reales de YouTube.
//   4. un directo de PELEAS de los canales de la UFC → UFC TV en directo.
//   5. si no, el bucle de peleas completas del día → UFC TV en bucle.
//   6. y si YouTube falla del todo → nada: ni hueco.
//
// Es async y la portada lo mete en un <Suspense fallback={null}>: si YouTube va
// lento, el resto de la portada no le espera. Por eso tampoco va en el
// Promise.all de la página.
//
// 🪤 EL EVENTO ES EL DE getNextEventHero Y NINGÚN OTRO. Es lo que permite pintar
// el bloque del evento sin `eventOver`: esa consulta ya saca el evento con el
// estelar caído (ver live-embed-callsites.test.ts, que vigila que este fichero
// no consulte la base por su cuenta).

// El carril de siempre, el mismo que tenía el directo en la portada. Va AQUÍ y
// no en la página para que, cuando no hay nada que pintar, no quede ni el hueco
// (80 px de padding vacíos entre el hero y los contadores).
function Carril({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">{children}</div>;
}

export async function HomeLiveSlot({ nextEvent }: { nextEvent: NextEventHero | null }) {
  const now = new Date();
  const manualId = nextEvent?.liveVideoId ?? null;

  // Con algo escrito a mano no hace falta preguntar a YouTube: gana siempre.
  const pick: LivePick = needsLiveDetection(manualId) ? await getLivePick(nextEvent, now) : {};
  const plan = planHomeSlot(manualId, nextEvent?.liveVideoTitle, pick);

  if (plan.kind === "nada") {
    // 🪤 CALLARSE A PROPÓSITO DEJA RASTRO. Una marca invisible (`hidden`: ni
    // ocupa sitio ni la lee un lector de pantalla) con el motivo, para que el
    // e2e de la portada distinga «el dueño lo ha apagado» de «UFC TV se ha
    // roto» y se salte en vez de ponerse rojo por el estado de la base.
    return <div hidden data-live-slot={plan.reason} />;
  }

  if (plan.kind === "evento" && nextEvent) {
    return (
      <Carril>
        <EventLiveEmbed
          videoId={plan.video.videoId}
          videoTitle={plan.video.title}
          channel={plan.video.channel}
          eventName={nextEvent.name}
        />
      </Carril>
    );
  }

  if (plan.kind === "peleas") {
    return (
      <Carril>
        <UfcTv mode="live" video={plan.video} />
      </Carril>
    );
  }

  // El bucle puede LANZAR a propósito (getFullFightPool: no guarda un bucle
  // vacío 6 h). Aquí se captura: sin bucle, la portada sigue sin el hueco.
  const pool = await getFullFightPool().catch(() => null);
  if (!pool) {
    return null;
  }
  const ids = buildLoopIds(pool.videos, utcDaySeed(now));
  if (ids.length === 0) {
    return null;
  }
  const inLoop = new Set(ids);
  // Qué canales suenan DE VERDAD en el bucle de hoy (tras el tope de 50), para
  // que el texto no nombre un canal que no está.
  const channels: UfcChannel[] = [
    ...new Set(pool.videos.filter((v) => inLoop.has(v.videoId)).map((v) => v.channel)),
  ];

  return (
    <Carril>
      <UfcTv mode="loop" ids={ids} channels={channels} />
    </Carril>
  );
}
