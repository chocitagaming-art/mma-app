"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

import { inferFighterGender, silhouetteHeadshot } from "@/lib/fighter-silhouette";
import { parsePhotoFocus, type PhotoMode } from "@/lib/hall-of-fame-display";
import { cn } from "@/lib/utils";

// A Hall of Fame photo: in relief ("cut": a cut-out photo standing on a gold
// back-light) or in the gold frame ("framed": a photo with a background, the
// silhouette). Which one is decided upstream (lib/hall-of-fame-display.ts
// photoMode) from what mma-ingesta measured; here only one thing can change
// it: a photo that fails to load falls to the silhouette, framed.
//
// Not FighterHeadshot: that one forces a square with object-cover, and the
// relief needs object-contain at the bottom of a wide box.
//
// The look lives in app/salon-de-la-fama/salon.css (.hof-photo…), validated in
// the 17-oct mockup.

export type HofPhotoVariant = "card" | "feature" | "corner" | "modal";

export type HofPhotoState = {
  src: string | null;
  mode: PhotoMode;
  onError: () => void;
};

/** The photo to paint and its final mode, with the load failure folded in. */
export function useHofPhoto(url: string | null, mode: PhotoMode): HofPhotoState {
  // The URL that failed (not a flag): a different photo gets its own chance.
  const [failed, setFailed] = useState<string | null>(null);
  const src = url && url !== failed ? url : null;
  return { src, mode: src ? mode : "framed", onError: () => setFailed(url) };
}

const SIZES: Record<HofPhotoVariant, string> = {
  card: "(min-width: 1024px) 240px, 50vw",
  feature: "(min-width: 1024px) 320px, 50vw",
  corner: "185px",
  modal: "(min-width: 768px) 720px, 100vw",
};

export function HofPhoto({
  name,
  photo,
  focus,
  variant,
  priority = false,
  wide = false,
}: {
  name: string;
  photo: HofPhotoState;
  // hall_of_fame.photo_focus: where the face is in a 16:9 portrait.
  focus?: string | null;
  variant: HofPhotoVariant;
  priority?: boolean;
  // The modal shows a 16:9 portrait whole (no zoom) in a 16:9 frame.
  wide?: boolean;
}) {
  const parsed = photo.mode === "framed" && photo.src ? parsePhotoFocus(focus) : null;
  const style: CSSProperties | undefined = parsed
    ? ({
        objectPosition: parsed.position,
        transformOrigin: parsed.position,
        "--hof-zoom": wide ? 1 : parsed.zoom,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={cn(
        "hof-photo",
        `hof-photo--${photo.mode}`,
        `hof-photo--${variant}`,
        wide && parsed ? "hof-photo--wide" : null,
      )}
    >
      {photo.src ? (
        <Image
          src={photo.src}
          alt={`Foto de ${name}`}
          fill
          preload={priority}
          sizes={SIZES[variant]}
          style={style}
          onError={photo.onError}
        />
      ) : (
        <Image
          src={silhouetteHeadshot(inferFighterGender(name))}
          alt={`Silueta de ${name} (sin foto)`}
          fill
          sizes={SIZES[variant]}
          className="hof-photo__silhouette"
        />
      )}
    </div>
  );
}
