"use client";

import type { CSSProperties } from "react";

// The <img> that paints a stored ufc.com photo with its full-size original in
// a srcset (src/lib/headshot-hd.ts), shared by FighterHeadshot (R5) and the
// Hall of Fame's HofPhoto (Salón HD) so the failure detection lives in ONE
// place.
//
// A plain <img>: with images.unoptimized next/image drops any srcSet or sizes
// it is given (get-img-props.js), and the srcset is the whole point. Same
// precedent as fighter-full-body.tsx.
//
// `onHdFail` must make the caller paint the stored URL WITHOUT the srcset
// (the second step of the chain HD → stored → silhouette). It is called from
// onError AND from the ref: an error BEFORE hydration never reaches onError
// (the same hole next/image plugs), so a finished image with no pixels is a
// failure too.
export function HdImg({
  src,
  srcSet,
  sizes,
  alt,
  priority = false,
  className,
  style,
  onHdFail,
}: {
  src: string;
  srcSet: string;
  sizes: string;
  alt: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  onHdFail: () => void;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // A new photo in the same slot gets a new element: its `complete` state
      // is never inherited from the previous one.
      key={src}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      data-headshot-quality="hd"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className}
      style={style}
      onError={onHdFail}
      ref={(img) => {
        if (img && img.complete && img.naturalWidth === 0 && img.currentSrc) onHdFail();
      }}
    />
  );
}
