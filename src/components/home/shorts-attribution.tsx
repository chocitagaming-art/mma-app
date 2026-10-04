import { cn } from "@/lib/utils";

// Where the hero's shorts come from (YouTube Developer Policies III.F.2),
// OUTSIDE the player's frame: nothing may sit on top of it.
//
// 🪤 The NAME «YouTube» as text, not the icon: YouTube's brand guidelines ask
// the icon and the logo for 100 px of height at least on screen, and at
// 10-12 px it would break them (checked 29-sep-2026, maqueta-shorts). The
// owner accepted the text name after reviewing the mockup.
//
// No hooks and no "use client": the desktop copy renders inside the client
// hero (shorts-hero.tsx) and the mobile one in the text column of the home
// page (a server component).

export const UFC_SHORTS_CHANNEL_URL = "https://www.youtube.com/@ufc/shorts";

export function ShortsAttribution({ className }: { className?: string }) {
  return (
    <p className={cn("font-mono text-[0.625rem] leading-4 text-muted-foreground", className)}>
      Shorts del canal oficial de la UFC ·{" "}
      <a
        href={UFC_SHORTS_CHANNEL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        YouTube
      </a>
    </p>
  );
}
