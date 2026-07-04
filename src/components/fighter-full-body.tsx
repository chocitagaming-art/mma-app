"use client";

import { useState } from "react";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { cn } from "@/lib/utils";

type FighterFullBodyProps = {
  name: string;
  fullBodyUrl: string | null;
  headshotUrl: string | null;
  className?: string;
};

// Foto de cuerpo entero estilo ufc.com, anclada abajo del contenedor. El caller
// fija SIEMPRE la altura del contenedor (anti-CLS: la caja no cambia cargue lo
// que cargue). <img> nativo (no next/image) siguiendo el precedente de
// CountryFlag y del póster de eventos: evita configurar remotePatterns y la CSP
// ya permite img-src https:. Si full_body_url es NULL o la carga falla,
// degradamos al headshot centrado (que a su vez cae a iniciales).
export function FighterFullBody({
  name,
  fullBodyUrl,
  headshotUrl,
  className,
}: FighterFullBodyProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showFullBody = fullBodyUrl != null && !imageFailed;

  return (
    <div
      className={cn(
        "relative flex items-end justify-center overflow-hidden",
        className,
      )}
    >
      {showFullBody ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={fullBodyUrl}
          src={fullBodyUrl}
          alt={`Foto de cuerpo entero de ${name}`}
          className="h-full w-auto max-w-full object-contain object-bottom"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <FighterHeadshot
            name={name}
            headshotUrl={headshotUrl}
            size="lg"
            className="sm:size-36 md:size-44"
          />
        </div>
      )}
    </div>
  );
}
