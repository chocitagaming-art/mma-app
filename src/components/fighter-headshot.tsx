"use client";

import Image from "next/image";
import { useState } from "react";

import {
  inferFighterGender,
  silhouetteHeadshot,
} from "@/lib/fighter-silhouette";
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
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

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
  className,
  imageClassName,
  priority = false,
}: FighterHeadshotProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [silhouetteFailed, setSilhouetteFailed] = useState(false);
  const initials = getInitials(name);
  // Prioridad: override curado (color) > BD > fallback curado. El override cubre
  // headshots ausentes o malos (p.ej. la cabeza B/N de Forrest en la BD).
  const resolvedUrl = localHeadshotOverride(name) ?? headshotUrl ?? localHeadshot(name);
  // Sin foto: silueta oficial de UFC (gender-aware) en vez de iniciales; las
  // iniciales quedan como último recurso si la propia silueta fallara.
  const silhouetteSrc = silhouetteHeadshot(inferFighterGender(name, division));

  const imageSizes =
    size === "sm" ? "48px" : size === "md" ? "64px" : size === "lg" ? "112px" : "224px";

  return (
    <div
      key={resolvedUrl ?? name}
      className={cn(
        "relative overflow-hidden rounded-md border border-border bg-muted",
        sizeClasses[size],
        className,
      )}
    >
      {resolvedUrl && !imageFailed ? (
        <Image
          src={resolvedUrl}
          alt={`Foto de ${name}`}
          fill
          preload={priority}
          sizes={imageSizes}
          className={cn("object-cover object-top", imageClassName)}
          onError={() => setImageFailed(true)}
        />
      ) : !silhouetteFailed ? (
        <Image
          src={silhouetteSrc}
          alt={`Silueta de ${name} (sin foto)`}
          fill
          preload={priority}
          sizes={imageSizes}
          className={cn("object-cover object-top", imageClassName)}
          onError={() => setSilhouetteFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-secondary text-center">
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
