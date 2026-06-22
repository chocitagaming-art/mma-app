"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Clip = {
  src: string;
  poster: string;
};

// Local vertical (9:16) hero reel clips, played back-to-back on an endless loop.
const CLIPS: Clip[] = [
  { src: "/videos/topuria-ko.mp4", poster: "/videos/topuria-ko.jpg" },
  { src: "/videos/mcgregor-ko.mp4", poster: "/videos/mcgregor-ko.jpg" },
  { src: "/videos/mvp-cannonier.mp4", poster: "/videos/mvp-cannonier.jpg" },
];

export function VideoHero({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const advanceTimer = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  // Default to motion allowed; flip to true if the user opts out so we never
  // autoplay against their preference.
  const [reducedMotion, setReducedMotion] = useState(false);

  // Respect prefers-reduced-motion: if set, show only the first poster (no playback).
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // When the active clip changes, swap the source and start playing. We keep a
  // single <video> element and drive it imperatively for a seamless sequence.
  useEffect(() => {
    if (reducedMotion) return;

    const video = videoRef.current;
    if (!video) return;

    video.load();
    setVisible(true);

    const promise = video.play();
    if (promise) {
      // Autoplay can be rejected (e.g. before any interaction); ignore quietly.
      promise.catch(() => {});
    }
  }, [index, reducedMotion]);

  const handleEnded = () => {
    // Brief fade-out before advancing to the next clip for a smooth transition.
    setVisible(false);
    advanceTimer.current = window.setTimeout(() => {
      setIndex((current) => (current + 1) % CLIPS.length);
    }, 300);
  };

  // Clear any pending advance timer on unmount (avoids setState-after-unmount).
  useEffect(() => {
    return () => {
      if (advanceTimer.current) {
        window.clearTimeout(advanceTimer.current);
      }
    };
  }, []);

  const active = CLIPS[index];

  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[300px] sm:max-w-[330px]",
        className,
      )}
    >
      {/* Soft brand glow behind the portrait frame. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-[80px]"
      />

      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl mask-feather">
        {reducedMotion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={CLIPS[0].poster}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            aria-hidden
            muted
            autoPlay
            playsInline
            preload="metadata"
            poster={active.poster}
            onEnded={handleEnded}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-300",
              visible ? "opacity-100" : "opacity-0",
            )}
          >
            <source src={active.src} type="video/mp4" />
          </video>
        )}
      </div>
    </div>
  );
}
