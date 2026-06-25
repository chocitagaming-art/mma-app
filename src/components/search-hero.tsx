"use client";

import { Calendar, Newspaper, Search, Swords } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trimmedQuery = query.trim();

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
            placeholder="Buscar luchadores, eventos o noticias..."
            className="h-12 border-border bg-card pl-11 text-base text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <Button type="submit" size="lg" className="h-12 px-6 sm:px-8">
          Explorar plantilla
        </Button>
      </form>
      {open && (totalResults > 0 || loading || showEmpty) ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover py-2 shadow-xl">
          <div className="max-h-96 overflow-y-auto px-2">
            {loading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Buscando…
              </div>
            ) : null}

            {results.fighters.length ? (
              <section className="py-1">
                <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Luchadores
                </p>
                {results.fighters.map((fighter) => (
                  <button
                    key={`fighter-${fighter.id}`}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted"
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
                ))}
              </section>
            ) : null}

            {results.events.length ? (
              <section className="py-1">
                <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Eventos
                </p>
                {results.events.map((event) => (
                  <button
                    key={`event-${event.id}`}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted"
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
                ))}
              </section>
            ) : null}

            {results.news.length ? (
              <section className="py-1">
                <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Noticias
                </p>
                {results.news.map((article) => (
                  <a
                    key={`news-${article.id}`}
                    href={article.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted"
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
                ))}
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
