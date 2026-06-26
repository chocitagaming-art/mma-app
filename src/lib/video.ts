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
