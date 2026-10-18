import type { ReactNode } from "react";

import type { FighterSocialLink, SocialNetwork } from "@/lib/social-links";

// R6 — the fighter's Instagram and X under the nickname and the record.
//
// Server component, plain links: NOTHING from Instagram or X is embedded or
// loaded. The browser only talks to them when the visitor clicks and leaves
// the site, which is why /privacidad needs one line (point 5) and not a new
// third-party paragraph like YouTube's.
//
// The icons are drawn here, not taken from a library: lucide-react ships no
// brand logos. The Instagram glyph is our own outline (rounded square, lens,
// flash dot); the X mark is the Simple Icons path (CC0 1.0, public domain).
// Both inherit `currentColor`, so they follow the light and dark themes.
//
// 44×44 px hit area on every width (WCAG 2.5.5 on a phone) and the project's
// focus ring (outline on :focus-visible, same as the favourite star).

const ICONS: Record<SocialNetwork, ReactNode> = {
  instagram: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
    </svg>
  ),
  x: (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-[18px]"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  ),
};

type FighterSocialLinksProps = {
  name: string;
  links: FighterSocialLink[];
};

export function FighterSocialLinks({ name, links }: FighterSocialLinksProps) {
  // No profile, no row: nothing to fill the gap with, and an empty
  // "Redes" label would be noise.
  if (links.length === 0) return null;

  return (
    <ul
      aria-label={`Redes sociales de ${name}`}
      data-testid="fighter-social-links"
      className="flex flex-wrap items-center gap-2 pt-2"
    >
      {links.map((link) => (
        <li key={link.network}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.handle}
            data-network={link.network}
            className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-muted/60 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {ICONS[link.network]}
          </a>
        </li>
      ))}
    </ul>
  );
}
