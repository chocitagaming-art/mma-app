// Helper PURO (sin API key, sin red, sin server-only): construye un enlace de
// búsqueda de YouTube para el combate. Es el MVP de #42 — "Ver combate" cae aquí
// cuando no hay un vídeo curado (fights.video_url, #43). Lo pueden usar tanto
// Server como Client Components.

export function buildFightVideoSearchUrl(
  red: string,
  blue: string,
  event?: string,
): string {
  const query = [red, "vs", blue, event, "full fight"]
    .filter(Boolean)
    .join(" ");
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

// Resolve the link for a fight's "watch" button: a curated video URL
// (fights.video_url, #43) when one exists, otherwise the YouTube search
// fallback (#42). Empty/whitespace-only curated values are treated as absent.
export function resolveFightVideoUrl(
  curatedUrl: string | null | undefined,
  red: string,
  blue: string,
  event?: string,
): string {
  const trimmed = curatedUrl?.trim();
  return trimmed ? trimmed : buildFightVideoSearchUrl(red, blue, event);
}
