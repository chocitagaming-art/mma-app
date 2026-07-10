// FE9 — Enlaces externos estilo Tapology, SIN scraping nuevo: se reconstruyen
// a partir de source/source_id que los scrapers ya dejaron en la BD.
// Solo fuentes con URL pública reconstruible; nada de búsquedas de fallback.

export type ExternalLink = {
  label: string;
  url: string;
};

// source/sourceId tal y como los exponen las queries (pueden faltar o venir NULL).
type SourceRef = {
  source?: string | null;
  sourceId?: string | null;
};

// Luchadores: solo 'espn' expone enlace (id numérico de espn.com). 'ufcstats'
// se omite a propósito (decisión de producto: no mostrarlo en la ficha). Otros
// sources ('manual'...) tampoco tienen enlace. Sin source/sourceId → sin enlace.
export function fighterExternalLinks({ source, sourceId }: SourceRef): ExternalLink[] {
  if (!source || !sourceId) {
    return [];
  }

  switch (source) {
    case "espn":
      return [
        {
          label: "ESPN",
          url: `https://www.espn.com/mma/fighter/_/id/${encodeURIComponent(sourceId)}`,
        },
      ];
    default:
      return [];
  }
}

// Eventos: solo 'ufc.com' (source_id = slug del evento). El resto, sin enlace.
export function eventExternalLink({ source, sourceId }: SourceRef): string | null {
  if (source !== "ufc.com" || !sourceId) {
    return null;
  }

  return `https://www.ufc.com/event/${encodeURIComponent(sourceId)}`;
}
