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

// Luchadores: 'ufcstats' guarda un PATH ('/fighter-details/<hash>') que se
// cuelga de http://ufcstats.com (el sitio no sirve HTTPS); 'espn' guarda el id
// numérico de espn.com. Otros sources ('manual'...) no tienen URL → sin enlace.
export function fighterExternalLinks({ source, sourceId }: SourceRef): ExternalLink[] {
  if (!source || !sourceId) {
    return [];
  }

  switch (source) {
    case "ufcstats": {
      const path = sourceId.startsWith("/") ? sourceId : `/${sourceId}`;
      return [{ label: "UFCStats", url: `http://ufcstats.com${path}` }];
    }
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
