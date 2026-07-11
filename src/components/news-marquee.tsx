import { formatNewsCategory } from "@/lib/format";
import type { NewsArticle } from "@/lib/types";
import { safeExternalUrl } from "@/lib/utils";

export function NewsMarquee({ articles }: { articles: NewsArticle[] }) {
  if (articles.length === 0) return null;

  // Duplicate the list so the RTL animation can loop without a visible seam.
  const items = [...articles, ...articles];

  return (
    <div className="marquee-host group relative overflow-hidden border-y border-border bg-card">
      {/* Fixed "NOTICIAS" label pinned to the left, with a fade into the reel. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center">
        <span className="flex h-full items-center bg-primary px-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
          Noticias
        </span>
        <span className="h-full w-10 bg-gradient-to-r from-card to-transparent" />
      </div>

      <div
        // Separación vía mr-8 en cada item (no gap en el track): así el ancho
        // total es exactamente 2x la primera copia y el bucle -50% no da el
        // saltito de medio gap al reiniciar (revisión adversarial 11-jul).
        className="animate-marquee flex w-max items-center py-2.5"
        // Velocidad de lectura cómoda y constante: ~14s por titular (antes 48s
        // fijos para toda la cinta → con muchas noticias volaba). Mínimo 90s.
        style={{ "--marquee-duration": `${Math.max(90, articles.length * 14)}s` } as React.CSSProperties}
      >
        {items.map((article, index) => {
          // La segunda mitad es la copia que da el bucle sin costura: se oculta a
          // lectores de pantalla y se saca del tabulado para no duplicar titulares.
          const isDuplicate = index >= articles.length;
          return (
          <a
            key={`${article.id}-${index}`}
            href={safeExternalUrl(article.url)}
            target="_blank"
            rel="noreferrer"
            aria-hidden={isDuplicate || undefined}
            tabIndex={isDuplicate ? -1 : undefined}
            className="mr-8 inline-flex items-center gap-2.5 whitespace-nowrap px-1 transition-colors hover:text-primary"
          >
            {article.category ? (
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                {formatNewsCategory(article.category)}
              </span>
            ) : null}
            <span className="text-sm font-medium text-foreground">
              {article.headline}
            </span>
            <span className="text-primary">&rarr;</span>
          </a>
          );
        })}
      </div>
    </div>
  );
}
