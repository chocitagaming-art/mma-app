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

// Luchadores: decisión del dueño (18-jul) — NO mostrar enlaces externos en la
// ficha (ni ESPN ni ufcstats). Antes 'espn' exponía un enlace a espn.com; se
// retiró a petición del dueño. La función se conserva (mismo contrato) por si se
// quisiera reactivar alguna fuente en el futuro, pero hoy no devuelve ninguno, así
// que la fila "Enlaces" del perfil no llega a renderizarse (guardada por length>0).
export function fighterExternalLinks(_ref: SourceRef): ExternalLink[] {
  return [];
}
