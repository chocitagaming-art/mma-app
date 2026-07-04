"use client";

import Image from "next/image";
import { useState } from "react";

import { FighterHeadshot } from "@/components/fighter-headshot";

type FighterFullBodyProps = {
  name: string;
  fullBodyUrl: string | null;
  headshotUrl: string | null;
};

// Foto de cuerpo entero estilo ufc.com para el hero de la ficha (fase 3).
// PNG transparente directamente sobre el fondo (sin marco/carta). El backfill
// deja full_body_url NULL en ~la mitad de luchadores, así que SIEMPRE hay
// fallback elegante al headshot actual; también cubre errores de carga.
// Alturas fijas por variante para no provocar CLS.
export function FighterFullBody({
  name,
  fullBodyUrl,
  headshotUrl,
}: FighterFullBodyProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!fullBodyUrl || imageFailed) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center sm:h-[340px] lg:h-[540px]">
        <FighterHeadshot
          name={name}
          headshotUrl={headshotUrl}
          size="xl"
          priority
          className="border-0 bg-transparent shadow-md ring-1 ring-border"
          imageClassName="object-cover object-top"
        />
      </div>
    );
  }

  return (
    <div className="relative h-[420px] w-full sm:h-[480px] lg:h-[540px]">
      {/* "Suelo" sutil bajo el atleta para asentarlo, como en ufc.com */}
      <div
        aria-hidden
        className="absolute inset-x-10 bottom-1 h-8 rounded-[100%] bg-foreground/10 blur-xl"
      />
      <Image
        src={fullBodyUrl}
        alt={`Foto de cuerpo entero de ${name}`}
        fill
        preload
        sizes="(min-width: 1024px) 400px, 85vw"
        className="object-contain object-bottom drop-shadow-xl"
        onError={() => setImageFailed(true)}
      />
    </div>
  );
}
