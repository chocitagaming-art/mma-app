import Link from "next/link";
import { Scale } from "lucide-react";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { FightVideoPlayer } from "@/components/fight-video-player";
import { formatKgFromLbs, formatLbs } from "@/lib/weigh-in";
import type { EventWeighIn } from "@/lib/types";

// BE2: tabla compacta del pesaje oficial ("weigh-ins") de un evento. Server
// component puro: la página decide cuándo pedir los datos (pasados o semana
// de evento) y esta sección solo se pinta si hay filas registradas.
//
// Migración 029: la sección lleva ADEMÁS el vídeo del pesaje, encima de la
// tabla. Las dos mitades son independientes —hay eventos con pesos y sin vídeo,
// y la víspera hay vídeo antes de que el pesaje esté volcado—, así que cada una
// se pinta por su cuenta y la sección entera desaparece si no hay ninguna.
//
// 🪤 LA FUENTE DEL VÍDEO NO SE ROTULA COMO OFICIAL. El pesaje lo retransmiten
// también canales de terceros (el del UFC 331 es de TheMacLife, no de la UFC),
// así que lo único que se afirma es lo que el vídeo dice ser: su título real.
// Mismo criterio que el componente EventLiveEmbed, y por el mismo motivo.
//
// (Y sin la etiqueta JSX escrita en este comentario a propósito:
// live-embed-callsites.test.ts cuenta los ficheros que la mencionan.)
export function EventWeighInsSection({
  weighIns,
  videoId = null,
  videoTitle = null,
  eventName,
}: {
  weighIns: EventWeighIn[];
  videoId?: string | null;
  videoTitle?: string | null;
  // Solo para el texto accesible del reproductor cuando el vídeo no trae
  // título. Opcional porque la tabla sola nunca lo ha necesitado.
  eventName?: string;
}) {
  if (weighIns.length === 0 && !videoId) {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <Scale className="size-4" />
        Pesaje oficial
      </h2>

      {videoId ? (
        <div className="mb-4 w-full max-w-3xl">
          {/* 🪤 EL MARCO NO SE TOCA AQUÍ: FightVideoPlayer es el mismo
              reproductor del careo y de la ficha de combate, y su 16:9 vive en
              youtube-facade.tsx. Cambiarlo mueve los otros dos sitios.
              (Nombrado sin la etiqueta JSX a propósito, por lo mismo que se
              explica arriba: un guard que cuente ficheros por la etiqueta no
              debe contar este comentario.) */}
          <FightVideoPlayer
            videoId={videoId}
            title={videoTitle ?? `Pesaje · ${eventName ?? "UFC"}`}
          />
          {videoTitle ? (
            <p className="mt-2 text-sm font-medium text-balance">{videoTitle}</p>
          ) : null}
          <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground">
            Vídeo alojado en YouTube
          </p>
        </div>
      ) : null}

      {weighIns.length === 0 ? null : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                  Luchador
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">
                  Peso
                </th>
              </tr>
            </thead>
            <tbody>
              {weighIns.map((weighIn) => (
                <tr
                  key={`${weighIn.fightId}-${weighIn.fighterId}`}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <td className="px-4 py-2 sm:px-5">
                    <Link
                      href={`/fighters/${weighIn.fighterId}`}
                      className="flex min-w-0 items-center gap-2.5 transition-colors hover:text-primary"
                    >
                      <FighterHeadshot
                        name={weighIn.fighterName}
                        headshotUrl={weighIn.headshotUrl}
                        size="sm"
                        className="size-8 shrink-0"
                      />
                      <span className="truncate font-display text-sm font-bold uppercase tracking-tight">
                        {weighIn.fighterName}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right sm:px-5">
                    <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                      {weighIn.missedWeight ? (
                        // Badge rojo: no alcanzó el límite de su categoría.
                        <span
                          className="inline-flex shrink-0 items-center rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em] text-destructive"
                          title="No alcanzó el límite de peso de su categoría"
                        >
                          No dio el peso
                        </span>
                      ) : null}
                      <span className="tabular font-mono text-xs text-foreground">
                        {formatLbs(weighIn.weightLbs)}
                      </span>
                      <span className="tabular font-mono text-xs text-muted-foreground">
                        {formatKgFromLbs(weighIn.weightLbs)}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
