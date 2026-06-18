"use client";

import { Swords } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FighterSearchResult } from "@/lib/types";

export function SearchHero() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FighterSearchResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trimmedQuery = query.trim();

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
      setResults([]);
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
          `/api/fighters/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("La búsqueda falló");
        }

        const data = (await response.json()) as FighterSearchResult[];
        setResults(data);
        setOpen(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
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
    () => trimmedQuery.length >= 1 && !loading && results.length === 0,
    [loading, results.length, trimmedQuery.length],
  );

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
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results.length) {
              setOpen(true);
            }
          }}
          placeholder="Buscar luchador..."
          className="h-12 border-border bg-card text-base text-foreground placeholder:text-muted-foreground"
        />
        <Button type="submit" size="lg" className="h-12 px-6 sm:px-8">
          Explorar plantilla
        </Button>
      </form>
      {open && (results.length > 0 || loading || showEmpty) ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover py-2 shadow-xl">
          <div className="max-h-80 overflow-y-auto px-2">
            {loading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Buscando luchadores…
              </div>
            ) : null}
            {results.map((fighter) => (
              <button
                key={fighter.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted"
                onClick={() => {
                  setOpen(false);
                  router.push(`/fighters/${fighter.id}`);
                }}
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
            {showEmpty ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Swords className="size-4" />
                No se encontraron luchadores
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
