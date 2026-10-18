"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

import { inferFighterGender, silhouetteHeadshot } from "@/lib/fighter-silhouette";
import {
  hofPhotoHd,
  parsePhotoFocus,
  type HofPhotoVariant,
  type PhotoMode,
} from "@/lib/hall-of-fame-display";
import { cn } from "@/lib/utils";

// A Hall of Fame photo: in relief ("cut": a cut-out photo standing on a gold
// back-light) or in the gold frame ("framed": a photo with a background, the
// silhouette). Which one is decided upstream (lib/hall-of-fame-display.ts
// photoMode) from what mma-ingesta measured; here only one thing can change
// it: a photo that fails to load falls to the silhouette, framed.
//
// Salón HD (18-oct-2026): a ufc.com photo with a bigger original behind it is
// painted with a srcset (lib/hall-of-fame-display.ts hofPhotoHd), so a retina
// screen downloads the original and a 1x one keeps the stored copy. 🪤 The
// chain is HD → the stored URL → silhouette: an original that fails falls
// back to the photo that loads today, never straight to the silhouette. And
// the HD never touches the mode nor the framing: both come from the STORED
// URL (photo_cutout is keyed by it), and the style below is the same.
//
// Not FighterHeadshot: that one forces a square with object-cover, and the
// relief needs object-contain at the bottom of a wide box.
//
// The look lives in app/salon-de-la-fama/salon.css (.hof-photo…), validated in
// the 17-oct mockup.

export type { HofPhotoVariant };

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

// next/image with images.unoptimized ignores `sizes`; kept for the day the
// optimizer comes back. The srcset's own sizes live in hofPhotoHd.
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
  // Failure of the HD original, remembered per URL (another photo in the
  // same slot gets its own chance).
  const [hdFailedFor, setHdFailedFor] = useState<string | null>(null);
  const parsed = photo.mode === "framed" && photo.src ? parsePhotoFocus(focus) : null;
  const zoom = parsed ? (wide ? 1 : parsed.zoom) : 1;
  const style: CSSProperties | undefined = parsed
    ? ({
        objectPosition: parsed.position,
        transformOrigin: parsed.position,
        "--hof-zoom": zoom,
      } as CSSProperties)
    : undefined;
  const hd =
    photo.src && hdFailedFor !== photo.src
      ? hofPhotoHd(photo.src, variant, { wide: wide && parsed != null, zoom })
      : null;
  const failHd = () => setHdFailedFor(photo.src);

  return (
    <div
      className={cn(
        "hof-photo",
        `hof-photo--${photo.mode}`,
        `hof-photo--${variant}`,
        wide && parsed ? "hof-photo--wide" : null,
      )}
    >
      {photo.src && hd ? (
        // A plain <img>: with images.unoptimized next/image drops any srcSet
        // (same as fighter-headshot.tsx). Same box as next/image's `fill`.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.src}
          srcSet={hd.srcSet}
          sizes={hd.sizes}
          alt={`Foto de ${name}`}
          data-headshot-quality="hd"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          style={{ ...FILL, ...style }}
          onError={failHd}
          ref={(img) => {
            // An error BEFORE hydration never reaches onError: a finished
            // image with no pixels is a failure.
            if (img && img.complete && img.naturalWidth === 0 && img.currentSrc) failHd();
          }}
        />
      ) : photo.src ? (
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

// What next/image's `fill` puts on its <img>.
const FILL: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  color: "transparent",
};
