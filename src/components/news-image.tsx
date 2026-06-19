"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type NewsImageProps = {
  src: string | null;
  alt: string;
  className?: string;
};

// News thumbnails come from arbitrary third-party CDNs (espncdn, …). We use a
// native <img> — like the event posters — to avoid allowlisting every hostname
// in next.config, and fall back to a branded octagon placeholder when there is
// no image or the CDN blocks hotlinking.
export function NewsImage({ src, alt, className }: NewsImageProps) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const showImage = Boolean(src) && !failed;

  // The <img> is server-rendered with the real src, so the browser can fire its
  // 'error' event before React attaches onError (common with CDNs that block
  // hotlinking). Re-check on mount: a broken image is complete with naturalWidth 0.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setFailed(true);
    }
  }, [src]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-muted",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src ?? undefined}
          alt={alt}
          loading="lazy"
          // Some news CDNs (e.g. sherdog) block hotlinking by Referer; dropping
          // the referrer lets those images load instead of 403-ing to the octagon.
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          aria-hidden
          className="octagon flex size-14 items-center justify-center bg-primary/40 sm:size-20"
        >
          <div className="octagon size-[86%] bg-card" />
        </div>
      )}
    </div>
  );
}
