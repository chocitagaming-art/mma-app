"use client";

import Image from "next/image";

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
  const initials = getInitials(name);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black shadow-lg shadow-black/30",
        sizeClasses[size],
        className,
      )}
    >
      {headshotUrl ? (
        <Image
          src={headshotUrl}
          alt={`${name} headshot`}
          fill
          priority={priority}
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
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-red-500/20 via-zinc-900 to-zinc-950 text-center">
          <span
            className={cn(
              "font-semibold tracking-[0.2em] text-zinc-200",
              size === "sm" ? "text-sm" : size === "md" ? "text-base" : size === "lg" ? "text-2xl" : "text-5xl",
            )}
          >
            {initials}
          </span>
        </div>
      )}
    </div>
  );
}