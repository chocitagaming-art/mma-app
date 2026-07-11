"use client";

import Image from "next/image";
import { useState } from "react";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { pickBodyPhotoUrl, type BodyPhotoPreference } from "@/lib/fighter-photo";
import { inferFighterGender, silhouetteBody } from "@/lib/fighter-silhouette";
import { localBody } from "@/lib/local-bodies";
import { localHeadshot, localHeadshotOverride } from "@/lib/local-headshots";
import { cn } from "@/lib/utils";

type FighterFullBodyProps = {
  name: string;
  fullBodyUrl: string | null;
  // Foto "standing" (Ronda B). Opcional: el backfill corre en paralelo y los
  // callers antiguos pueden no tenerla aún.
  standingBodyUrl?: string | null;
  headshotUrl: string | null;
  // División o clase de peso (texto UFC o slug), solo para elegir la silueta de
  // fallback por género cuando el luchador no tiene ninguna foto.
  division?: string | null;
  // Cadena de prioridad de la foto (ver pickBodyPhotoUrl). "full-first" por
  // defecto: la ficha del luchador conserva exactamente su foto aprobada.
  preference?: BodyPhotoPreference;
  // "hero": hero de la ficha (next/image, alturas propias, sombra de suelo).
  // "embed": el caller fija la altura vía className (anti-CLS), <img> nativo.
  variant?: "hero" | "embed";
  className?: string;
};

// Foto de cuerpo entero estilo ufc.com. Única fuente para la ficha (hero), el
// tale-of-the-tape del combate y las esquinas de /enfrentamiento (embed).
// Si la URL elegida es NULL o falla la carga, degradamos al headshot (que a su
// vez cae a su silueta/iniciales). Si TAMPOCO hay headshot, mostramos la silueta
// oficial de UFC de cuerpo entero (gender-aware, servida desde /public — la BD
// se mantiene limpia de placeholders a propósito; ver fighter-silhouette.ts).
// <img> nativo en "embed" siguiendo el precedente de CountryFlag (evita
// remotePatterns; la CSP ya permite img-src https:).
export function FighterFullBody({
  name,
  fullBodyUrl,
  standingBodyUrl = null,
  headshotUrl,
  division = null,
  preference = "full-first",
  variant = "embed",
  className,
}: FighterFullBodyProps) {
  const [imageFailed, setImageFailed] = useState(false);
  // Override curado (local-bodies) con prioridad sobre la BD: cubre luchadores
  // sin full/standing en BD (p.ej. Forrest Griffin) o con foto mala.
  const local = localBody(name);
  const dbPhotoUrl =
    local?.src ?? pickBodyPhotoUrl(preference, standingBodyUrl, fullBodyUrl);
  // Sin foto de cuerpo Y sin headshot al que degradar: silueta oficial de UFC
  // de cuerpo entero. Se renderiza por la misma ruta que una foto real (con
  // sombra y "suelo" en el hero), como en ufc.com.
  const hasHeadshot = Boolean(
    localHeadshotOverride(name) ?? headshotUrl ?? localHeadshot(name),
  );
  const silhouetteUrl =
    dbPhotoUrl == null && !hasHeadshot
      ? silhouetteBody(inferFighterGender(name, division))
      : null;
  const photoUrl = dbPhotoUrl ?? silhouetteUrl;
  const showPhoto = photoUrl != null && !imageFailed;
  const altText =
    photoUrl === silhouetteUrl && silhouetteUrl != null
      ? `Silueta de ${name} (sin foto)`
      : `Foto de cuerpo entero de ${name}`;
  // Encuadre explícito en vez de inferirlo del substring de la URL: los cuerpos
  // curados (local-bodies) traen su propio fit; la silueta oficial usa el mismo
  // recorte cabeza-muslo de ufc.com (cover-top); para las fotos de BD seguimos
  // distinguiendo el recorte oficial de ufc.com (athlete_bio_full_body =
  // cabeza-muslo → cover-top) del resto (standing/cuerpo entero → contain-bottom).
  const bodyFit =
    local?.fit ??
    (silhouetteUrl != null || photoUrl?.includes("athlete_bio_full_body")
      ? "cover-top"
      : "contain-bottom");

  if (variant === "hero") {
    if (!showPhoto) {
      return (
        <div className="flex h-[300px] w-full items-center justify-center sm:h-[340px] lg:h-[540px]">
          <FighterHeadshot
            name={name}
            headshotUrl={headshotUrl}
            division={division}
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
          src={photoUrl}
          alt={altText}
          fill
          preload
          // Subimos el ancho pedido: al pasar a cover el atleta llena el marco,
          // así que un srcset mayor evita el reescalado borroso (Royce/Ken/GSP…).
          sizes="(min-width: 1024px) 440px, 90vw"
          className={cn(
            "drop-shadow-xl",
            // Mismo criterio que la variante embed: los recortes
            // athlete_bio_full_body de ufc.com (cabeza-muslo, sin pies) quedan
            // "enterrados"/pequeños con contain en la caja alta del hero; con
            // cover anclado arriba llenan el marco (recorta laterales, no la
            // cara). El resto (standing, full-body curado en local-bodies) se
            // asienta en la base con contain.
            bodyFit === "cover-top"
              ? "object-cover object-top"
              : "object-contain object-bottom",
          )}
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-end justify-center overflow-hidden",
        className,
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photoUrl}
          src={photoUrl}
          alt={altText}
          className={cn(
            "h-full",
            // Las fotos athlete_bio_full_body de ufc.com son un recorte fijo
            // cabeza-muslo (sin pies): con contain quedan "enterradas" o con
            // letterbox flotante según el ancho de columna, así que llenan la
            // caja con cover anclado arriba (recorta laterales, no la cara).
            // El resto (standing, cuerpo completo) se asienta en la base.
            bodyFit === "cover-top"
              ? "w-full object-cover object-top"
              : "w-auto max-w-full object-contain object-bottom",
          )}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <FighterHeadshot
            name={name}
            headshotUrl={headshotUrl}
            division={division}
            size="lg"
            className="sm:size-36 md:size-44"
          />
        </div>
      )}
    </div>
  );
}
