"use client";

import Image from "next/image";
import { useState } from "react";

import {
  inferFighterGender,
  silhouetteHeadshot,
} from "@/lib/fighter-silhouette";
import { headshotSrcSet } from "@/lib/headshot-hd";
import { localHeadshot, localHeadshotOverride } from "@/lib/local-headshots";
import { cn } from "@/lib/utils";

type FighterHeadshotProps = {
  name: string;
  headshotUrl: string | null;
  // División o clase de peso del luchador (texto UFC o slug de rankings), solo
  // para elegir la silueta de fallback por género. Opcional: los call sites sin
  // dato (buscadores, pesajes, Salón) caen a la silueta masculina.
  division?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  // "square": the framed thumbnail used across the app. "cutout": no frame at
  // all, the transparent ufc.com PNG standing on its baseline (object-contain,
  // anchored to the bottom); the caller sizes and positions it via className.
  variant?: "square" | "cutout";
  // Overrides the `sizes` hint derived from `size` (the cutout has no fixed size).
  // With the HD srcset it is what picks the file: give the width the PICTURE is
  // painted at (a 1.6:1 face covering a square box is 1.6 × the box wide), not
  // the box.
  sizes?: string;
  // R5 (18-oct-2026): whether to offer the full-size ufc.com original next to
  // the stored 256×160 copy (srcset, see src/lib/headshot-hd.ts). "auto" = only
  // the big sizes (lg/xl); "hd" forces it (the /fighters cards); "base" never.
  // Only the URL from the database is upgraded, never a curated local file.
  quality?: "auto" | "hd" | "base";
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

// Width the picture is painted at in each square box: the 1.6:1 ufc.com face
// covers the box, so it is 1.6 × the box wide. Only used to pick from the HD
// srcset (next/image with images.unoptimized ignores `sizes` altogether).
const hdSizes = {
  sm: "77px",
  md: "102px",
  lg: "179px",
  xl: "358px",
} as const;

const sizeClasses = {
  sm: "size-12",
  md: "size-16",
  lg: "size-28",
  xl: "size-56",
} as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function FighterHeadshot({
  name,
  headshotUrl,
  division = null,
  size = "md",
  variant = "square",
  sizes,
  className,
  imageClassName,
  priority = false,
  quality = "auto",
}: FighterHeadshotProps) {
  // Failures are remembered PER URL, so a new photo (another fighter in the
  // same slot) starts the chain again instead of inheriting a fallback.
  const [hdFailedFor, setHdFailedFor] = useState<string | null>(null);
  const [imageFailedFor, setImageFailedFor] = useState<string | null>(null);
  // The silhouette too: another fighter in the same slot may need the other
  // file (male/female), so one failed silhouette must not skip theirs.
  const [silhouetteFailedFor, setSilhouetteFailedFor] = useState<string | null>(null);
  const initials = getInitials(name);
  // Prioridad: override curado (color) > BD > fallback curado. El override cubre
  // headshots ausentes o malos (p.ej. la cabeza B/N de Forrest en la BD).
  const override = localHeadshotOverride(name);
  const resolvedUrl = override ?? headshotUrl ?? localHeadshot(name);
  const imageFailed = resolvedUrl != null && imageFailedFor === resolvedUrl;
  // The chain is HD original → the stored URL → silhouette → initials. 🪤 The
  // second step is the point: an original that does not exist (or that ufc.com
  // stops serving) must fall back to the face that loads today, NEVER straight
  // to the silhouette.
  const wantsHd = quality === "hd" || (quality === "auto" && (size === "lg" || size === "xl"));
  const srcSet =
    wantsHd && override == null && headshotUrl && resolvedUrl === headshotUrl
      ? headshotSrcSet(headshotUrl)
      : undefined;
  const useSrcSet = srcSet != null && hdFailedFor !== resolvedUrl;
  // Sin foto: silueta oficial de UFC (gender-aware) en vez de iniciales; las
  // iniciales quedan como último recurso si la propia silueta fallara.
  const silhouetteSrc = silhouetteHeadshot(inferFighterGender(name, division));
  const silhouetteFailed = silhouetteFailedFor === silhouetteSrc;

  const imageSizes =
    sizes ??
    (size === "sm" ? "48px" : size === "md" ? "64px" : size === "lg" ? "112px" : "224px");
  const srcSetSizes = sizes ?? hdSizes[size];
  const isCutout = variant === "cutout";
  const fitClass = isCutout ? "object-contain object-bottom" : "object-cover object-top";
  // ufc.com's athlete_bio_full_body shots (~60 fighters) are a tall head-to-thigh
  // cut: contained, they shrink to a small doll in a row of faces. In the cutout
  // they fill the box from the top instead (head to waist, cut on the baseline),
  // the same split fighter-full-body.tsx makes for the profile hero.
  const photoFitClass =
    isCutout && resolvedUrl?.includes("athlete_bio_full_body")
      ? "object-cover object-top"
      : fitClass;

  return (
    <div
      key={resolvedUrl ?? name}
      className={cn(
        isCutout
          ? "relative"
          : cn("relative overflow-hidden rounded-md border border-border bg-muted", sizeClasses[size]),
        className,
      )}
    >
      {resolvedUrl && !imageFailed && useSrcSet ? (
        // A plain <img>: with images.unoptimized next/image drops any srcSet or
        // sizes it is given (get-img-props.js), and the srcset is the whole
        // point. Same precedent as fighter-full-body.tsx.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedUrl}
          srcSet={srcSet}
          sizes={srcSetSizes}
          alt={`Foto de ${name}`}
          data-headshot-quality="hd"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className={cn("absolute inset-0 h-full w-full text-transparent", photoFitClass, imageClassName)}
          onError={() => setHdFailedFor(resolvedUrl)}
          ref={(img) => {
            // An error BEFORE hydration never reaches onError (the same hole
            // next/image plugs): a finished image with no pixels is a failure.
            if (img && img.complete && img.naturalWidth === 0 && img.currentSrc) {
              setHdFailedFor(resolvedUrl);
            }
          }}
        />
      ) : resolvedUrl && !imageFailed ? (
        <Image
          src={resolvedUrl}
          alt={`Foto de ${name}`}
          fill
          preload={priority}
          sizes={imageSizes}
          className={cn(photoFitClass, imageClassName)}
          onError={() => setImageFailedFor(resolvedUrl)}
        />
      ) : !silhouetteFailed ? (
        <Image
          src={silhouetteSrc}
          alt={`Silueta de ${name} (sin foto)`}
          fill
          preload={priority}
          sizes={imageSizes}
          className={cn(fitClass, imageClassName)}
          onError={() => setSilhouetteFailedFor(silhouetteSrc)}
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center text-center",
            isCutout ? "items-end pb-[12%]" : "bg-secondary",
          )}
        >
          <span
            className={cn(
              "font-display font-bold tracking-wide text-muted-foreground",
              size === "sm"
                ? "text-sm"
                : size === "md"
                  ? "text-base"
                  : size === "lg"
                    ? "text-2xl"
                    : "text-5xl",
            )}
          >
            {initials}
          </span>
        </div>
      )}
    </div>
  );
}
