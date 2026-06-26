"use client";

import { Search, Swords, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { Input } from "@/components/ui/input";
import { cleanNationality } from "@/lib/format";
import type { FighterSearchResult } from "@/lib/types";

type FighterSearchComboboxProps = {
  label: string;
  value: FighterSearchResult | null;
  onSelect: (fighter: FighterSearchResult | null) => void;
  excludeId?: number | null;
};

export function FighterSearchCombobox({
  label,
  value,
  onSelect,
  excludeId,
}: FighterSearchComboboxProps) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchedResults, setFetchedResults] = useState<FighterSearchResult[]>([]);
  // Índice de la opción activa para navegación por teclado (-1 = ninguna).
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedName = value?.name ?? "";
  const trimmedQuery = query.trim();
  const results =
    trimmedQuery.length < 1
      ? []
      : fetchedResults.filter((fighter) => fighter.id !== excludeId);

  // ids estables para wiring ARIA (label <-> combobox <-> listbox <-> options).
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

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
    if (trimmedQuery.length < 1) {
      setFetchedResults([]);
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
        setFetchedResults(data);
        setOpen(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFetchedResults([]);
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
    () => query.trim().length >= 1 && !loading && results.length === 0,
    [loading, query, results.length],
  );

  const listboxVisible = open && (results.length > 0 || loading || showEmpty);

  // Al cambiar los resultados, ninguna opción queda activa (evita punteros a
  // opciones que ya no existen).
  useEffect(() => {
    setActiveIndex(-1);
  }, [fetchedResults]);

  // Mantener visible la opción activa dentro del scroll del listbox.
  useEffect(() => {
    if (activeIndex < 0) return;
    const node = document.getElementById(optionId(activeIndex));
    node?.scrollIntoView({ block: "nearest" });
    // optionId depende solo de baseId (estable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const selectFighter = (fighter: FighterSearchResult) => {
    onSelect(fighter);
    setQuery(fighter.name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Si el listbox no muestra opciones navegables, solo ArrowDown lo abre.
    if (!listboxVisible || results.length === 0) {
      if (event.key === "ArrowDown" && results.length > 0) {
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index >= results.length - 1 ? 0 : index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(results.length - 1);
        break;
      case "Enter":
        if (activeIndex >= 0 && activeIndex < results.length) {
          event.preventDefault();
          selectFighter(results[activeIndex]);
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
    <div ref={rootRef} className="relative space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground"
        >
          {label}
        </label>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => {
              onSelect(null);
              setQuery("");
              setFetchedResults([]);
            }}
          >
            <X />
            Limpiar
          </Button>
        ) : null}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          value={selectedName || query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value && event.target.value !== value.name) {
              onSelect(null);
            }
          }}
          onFocus={() => {
            if (results.length) {
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
          placeholder="Buscar luchador..."
          className="h-12 rounded-2xl border-border bg-background pl-11 text-foreground placeholder:text-muted-foreground"
        />
      </div>
      {listboxVisible ? (
        <Card className="absolute z-30 mt-2 w-full border-border bg-popover py-2 text-popover-foreground shadow-2xl backdrop-blur-xl">
          <div
            id={listboxId}
            role="listbox"
            aria-label={`Resultados de búsqueda para ${label}`}
            className="max-h-80 overflow-y-auto px-2"
          >
            {loading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">Buscando luchadores…</div>
            ) : null}
            {results.map((fighter, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={fighter.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isActive}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-accent ${
                    isActive ? "bg-accent" : ""
                  }`}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => selectFighter(fighter)}
                >
                  <div className="flex items-center gap-3">
                    <FighterHeadshot
                      name={fighter.name}
                      headshotUrl={fighter.headshotUrl}
                      size="sm"
                      className="size-10 shrink-0"
                    />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{fighter.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {cleanNationality(fighter.nationality) ?? "Nacionalidad no disponible"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
            {showEmpty ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Swords className="size-4 text-muted-foreground" />
                No se encontraron luchadores
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
