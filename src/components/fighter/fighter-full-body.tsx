"use client";

import Image from "next/image";
import { useState } from "react";

import { FighterHeadshot } from "@/components/fighter-headshot";
import {
  pickBodyPhotoUrl,
  pickCornerBodyPhoto,
  type BodyPhotoPreference,
  type Corner,
} from "@/lib/fighter-photo";
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
  // F1 Tanda 4: variantes direccionales de la foto standing (migración 019).
  // _l mira a la derecha (esquina roja), _r mira a la izquierda (esquina azul).
  standingBodyUrlL?: string | null;
  standingBodyUrlR?: string | null;
  // Esquina del cara a cara. Cuando se pasa, la foto standing se elige por
  // dirección (roja=_l, azul=_r) y se espeja si hace falta para que se miren.
  // Sin `corner` (ficha del luchador) el comportamiento es el de siempre.
  corner?: Corner;
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
  standingBodyUrlL = null,
  standingBodyUrlR = null,
  corner,
  headshotUrl,
  division = null,
  preference = "full-first",
  variant = "embed",
  className,
}: FighterFullBodyProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [silhouetteFailed, setSilhouetteFailed] = useState(false);
  // Override curado (local-bodies) con prioridad sobre la BD: cubre luchadores
  // sin full/standing en BD (p.ej. Forrest Griffin) o con foto mala.
  const local = localBody(name);
  // F1: en el cara a cara (corner definido) elegimos la variante direccional y
  // su flag de espejo; en la ficha (sin corner) se conserva la cadena de siempre.
  const cornerPhoto =
    corner != null && !local
      ? pickCornerBodyPhoto(corner, {
          standingL: standingBodyUrlL,
          standingR: standingBodyUrlR,
          standing: standingBodyUrl,
          fullBody: fullBodyUrl,
        })
      : null;
  const dbPhotoUrl =
    local?.src ??
    (cornerPhoto
      ? cornerPhoto.url
      : pickBodyPhotoUrl(preference, standingBodyUrl, fullBodyUrl));
  // Sin foto de cuerpo utilizable (NULL o que falló en cargar) Y sin headshot al
  // que degradar: silueta oficial de UFC de cuerpo entero. Se renderiza por la
  // misma ruta que una foto real (con sombra y "suelo" en el hero), como en
  // ufc.com. Si la propia silueta fallara, degradamos al headshot (iniciales).
  const hasHeadshot = Boolean(
    localHeadshotOverride(name) ?? headshotUrl ?? localHeadshot(name),
  );
  const usableDbPhotoUrl = imageFailed ? null : dbPhotoUrl;
  const silhouetteUrl =
    usableDbPhotoUrl == null && !hasHeadshot && !silhouetteFailed
      ? silhouetteBody(inferFighterGender(name, division))
      : null;
  const photoUrl = usableDbPhotoUrl ?? silhouetteUrl;
  const isSilhouette = photoUrl != null && photoUrl === silhouetteUrl;
  const showPhoto = photoUrl != null;
  // F1: espejar horizontalmente solo cuando mostramos la foto de BD elegida por
  // esquina y su dirección real no coincide con la esquina (la silueta/headshot
  // no se espejan; no tienen orientación).
  const mirror =
    (cornerPhoto?.mirror ?? false) &&
    usableDbPhotoUrl != null &&
    photoUrl === usableDbPhotoUrl;
  const handleImageError = () =>
    isSilhouette ? setSilhouetteFailed(true) : setImageFailed(true);
  const altText = isSilhouette
    ? `Silueta de ${name} (sin foto)`
    : `Foto de cuerpo entero de ${name}`;
  // Encuadre explícito en vez de inferirlo del substring de la URL: los cuerpos
  // curados (local-bodies) traen su propio fit; la silueta oficial usa el mismo
  // recorte cabeza-muslo de ufc.com (cover-top); para las fotos de BD seguimos
  // distinguiendo el recorte oficial de ufc.com (athlete_bio_full_body =
  // cabeza-muslo → cover-top) del resto (standing/cuerpo entero → contain-bottom).
  const bodyFit = isSilhouette
    ? "cover-top"
    : (local?.fit ??
      (photoUrl?.includes("athlete_bio_full_body") ? "cover-top" : "contain-bottom"));

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
            // F1: espejo para que la esquina mire hacia el centro.
            mirror && "-scale-x-100",
          )}
          onError={handleImageError}
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
            // F1: espejo para que la esquina mire hacia el centro.
            mirror && "-scale-x-100",
          )}
          onError={handleImageError}
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
