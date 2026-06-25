"use client";

import { Calendar, Newspaper, Search, Swords } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import type { GlobalSearchResults } from "@/lib/types";

const EMPTY_RESULTS: GlobalSearchResults = {
  fighters: [],
  events: [],
  news: [],
};

export function SearchHero() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY_RESULTS);
  // Índice de la opción activa para navegación por teclado (-1 = ninguna).
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trimmedQuery = query.trim();

  // ids estables para wiring ARIA (combobox <-> listbox <-> options).
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const totalResults =
    results.fighters.length + results.events.length + results.news.length;

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!trimmedQuery) {
      setResults(EMPTY_RESULTS);
      setOpen(false);
      setLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("La búsqueda falló");
        }

        const data = (await response.json()) as GlobalSearchResults;
        setResults(data);
        setOpen(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults(EMPTY_RESULTS);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      abortRef.current?.abort();
      window.clearTimeout(timeoutId);
    };
  }, [trimmedQuery]);

  const showEmpty = useMemo(
    () => trimmedQuery.length >= 1 && !loading && totalResults === 0,
    [loading, totalResults, trimmedQuery.length],
  );

  const closeAndPush = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  // Lista plana de opciones en orden de aparición (luchadores -> eventos ->
  // noticias). Cada opción sabe activarse (navegar/abrir). El índice de este
  // array es el que mueve el teclado y el que referencia aria-activedescendant.
  const flatItems = useMemo(() => {
    const items: { key: string; activate: () => void }[] = [];

    for (const fighter of results.fighters) {
      items.push({
        key: `fighter-${fighter.id}`,
        activate: () => closeAndPush(`/fighters/${fighter.id}`),
      });
    }
    for (const event of results.events) {
      items.push({
        key: `event-${event.id}`,
        activate: () => closeAndPush(`/eventos/${event.id}`),
      });
    }
    for (const article of results.news) {
      items.push({
        key: `news-${article.id}`,
        activate: () => {
          setOpen(false);
          window.open(article.url, "_blank", "noopener,noreferrer");
        },
      });
    }

    return items;
    // closeAndPush es estable en la práctica (router de Next); reconstruimos la
    // lista solo cuando cambian los resultados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  // Offsets para mapear el índice local de cada sección al índice plano global.
  const eventBase = results.fighters.length;
  const newsBase = results.fighters.length + results.events.length;

  const listboxVisible = open && (totalResults > 0 || loading || showEmpty);

  // Al cambiar los resultados, ninguna opción queda activa (evita punteros a
  // opciones que ya no existen).
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  // Mantener visible la opción activa dentro del scroll del listbox.
  useEffect(() => {
    if (activeIndex < 0) return;
    const node = document.getElementById(optionId(activeIndex));
    node?.scrollIntoView({ block: "nearest" });
    // optionId depende solo de baseId (estable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Si el listbox no muestra opciones navegables, solo ArrowDown lo abre.
    if (!listboxVisible || flatItems.length === 0) {
      if (event.key === "ArrowDown" && totalResults > 0) {
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) =>
          index >= flatItems.length - 1 ? 0 : index + 1,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) =>
          index <= 0 ? flatItems.length - 1 : index - 1,
        );
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(flatItems.length - 1);
        break;
      case "Enter":
        // Solo interceptamos si hay opción activa; si no, dejamos que el form
        // haga submit (explorar plantilla, comportamiento de #21).
        if (activeIndex >= 0 && activeIndex < flatItems.length) {
          event.preventDefault();
          flatItems[activeIndex].activate();
        }
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams();

          if (trimmedQuery) {
            params.set("q", trimmedQuery);
          }

          router.push(`/fighters${params.toString() ? `?${params.toString()}` : ""}`);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              if (totalResults) {
                setOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={listboxVisible}
            aria-controls={listboxId}
            aria-activedescendant={
              activeIndex >= 0 ? optionId(activeIndex) : undefined
            }
            aria-autocomplete="list"
            aria-haspopup="listbox"
            placeholder="Buscar luchadores, eventos o noticias..."
            className="h-12 border-border bg-card pl-11 text-base text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <Button type="submit" size="lg" className="h-12 px-6 sm:px-8">
          Explorar plantilla
        </Button>
      </form>
      {listboxVisible ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover py-2 shadow-xl">
          <div
            id={listboxId}
            role="listbox"
            aria-label="Resultados de búsqueda"
            className="max-h-96 overflow-y-auto px-2"
          >
            {loading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Buscando…
              </div>
            ) : null}

            {results.fighters.length ? (
              <section
                role="group"
                aria-labelledby={`${baseId}-group-fighters`}
                className="py-1"
              >
                <p
                  id={`${baseId}-group-fighters`}
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Luchadores
                </p>
                {results.fighters.map((fighter, index) => {
                  const itemIndex = index;
                  const isActive = itemIndex === activeIndex;
                  return (
                    <button
                      key={`fighter-${fighter.id}`}
                      id={optionId(itemIndex)}
                      role="option"
                      aria-selected={isActive}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted ${
                        isActive ? "bg-muted" : ""
                      }`}
                      onMouseMove={() => setActiveIndex(itemIndex)}
                      onClick={() => closeAndPush(`/fighters/${fighter.id}`)}
                    >
                      <FighterHeadshot
                        name={fighter.name}
                        headshotUrl={fighter.headshotUrl}
                        size="sm"
                        className="size-10 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {fighter.name}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {fighter.nationality ?? "Nacionalidad no disponible"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {results.events.length ? (
              <section
                role="group"
                aria-labelledby={`${baseId}-group-events`}
                className="py-1"
              >
                <p
                  id={`${baseId}-group-events`}
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Eventos
                </p>
                {results.events.map((event, index) => {
                  const itemIndex = eventBase + index;
                  const isActive = itemIndex === activeIndex;
                  return (
                    <button
                      key={`event-${event.id}`}
                      id={optionId(itemIndex)}
                      role="option"
                      aria-selected={isActive}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted ${
                        isActive ? "bg-muted" : ""
                      }`}
                      onMouseMove={() => setActiveIndex(itemIndex)}
                      onClick={() => closeAndPush(`/eventos/${event.id}`)}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                        <Calendar className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {event.name}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {[formatDate(event.eventDate), event.location]
                            .filter(Boolean)
                            .join(" · ") || "Fecha por confirmar"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {results.news.length ? (
              <section
                role="group"
                aria-labelledby={`${baseId}-group-news`}
                className="py-1"
              >
                <p
                  id={`${baseId}-group-news`}
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Noticias
                </p>
                {results.news.map((article, index) => {
                  const itemIndex = newsBase + index;
                  const isActive = itemIndex === activeIndex;
                  return (
                    <a
                      key={`news-${article.id}`}
                      id={optionId(itemIndex)}
                      role="option"
                      aria-selected={isActive}
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted ${
                        isActive ? "bg-muted" : ""
                      }`}
                      onMouseMove={() => setActiveIndex(itemIndex)}
                      onClick={() => setOpen(false)}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                        <Newspaper className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {article.headline}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {[article.source, formatDate(article.publishedAt)]
                            .filter(Boolean)
                            .join(" · ") || "Fuente desconocida"}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </section>
            ) : null}

            {showEmpty ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Swords className="size-4" />
                No se encontraron resultados
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
