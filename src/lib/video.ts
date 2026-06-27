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

// Extract the 11-char video id from a YouTube URL (watch ?v=, youtu.be/, /embed/,
// /shorts/, incl. youtube-nocookie). Tolerates extra params/querystrings. Returns
// null for non-YouTube URLs or malformed ids — callers degrade to a plain link.
export function parseYouTubeId(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;

  const ID = "([A-Za-z0-9_-]{11})";
  const END = "(?:[^A-Za-z0-9_-]|$)"; // reject longer (invalid) tokens
  const patterns = [
    new RegExp(`youtu\\.be/${ID}${END}`),
    new RegExp(`youtube(?:-nocookie)?\\.com/embed/${ID}${END}`),
    new RegExp(`youtube(?:-nocookie)?\\.com/shorts/${ID}${END}`),
    new RegExp(`youtube\\.com/watch\\?(?:[^#]*&)?v=${ID}${END}`),
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return null;
}
