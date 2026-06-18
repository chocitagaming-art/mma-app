"use client";

import Image from "next/image";
import { useState } from "react";

import { localHeadshot } from "@/lib/local-headshots";
import { cn } from "@/lib/utils";

type FighterHeadshotProps = {
  name: string;
  headshotUrl: string | null;
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
  size = "md",
  className,
  imageClassName,
  priority = false,
}: FighterHeadshotProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getInitials(name);
  const resolvedUrl = headshotUrl ?? localHeadshot(name);

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
          sizes={
            size === "sm"
              ? "48px"
              : size === "md"
                ? "64px"
                : size === "lg"
                  ? "112px"
                  : "224px"
          }
          className={cn("object-cover object-top", imageClassName)}
          onError={() => setImageFailed(true)}
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
