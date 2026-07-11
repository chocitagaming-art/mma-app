"use client";

import { CalendarDays, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import type { EventSearchResult } from "@/lib/types";

// FE7: "salto a evento" en /eventos. Misma arquitectura que
// FighterSearchCombobox (debounce + fetch abortable a una API route + listbox
// ARIA con navegación por teclado), pero al elegir un evento navega directo a
// su cartelera (/eventos/[id]) en vez de guardar la selección en estado.
export function EventSearchCombobox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EventSearchResult[]>([]);
  // Índice de la opción activa para navegación por teclado (-1 = ninguna).
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trimmedQuery = query.trim();

  // ids estables para wiring ARIA (combobox <-> listbox <-> options).
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
    // Con el campo vacío no hay nada que buscar; la limpieza del estado la hace
    // el onChange del input (evita setState síncrono dentro del efecto).
    if (trimmedQuery.length < 1) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      try {
        const response = await fetch(
          `/api/eventos/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("La búsqueda falló");
        }

        const data = (await response.json()) as EventSearchResult[];
        setResults(data);
        setOpen(true);
        setActiveIndex(-1);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
          setActiveIndex(-1);
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

  const visibleResults = trimmedQuery.length < 1 ? [] : results;
  const showEmpty = trimmedQuery.length >= 1 && !loading && visibleResults.length === 0;
  const listboxVisible = open && (visibleResults.length > 0 || loading || showEmpty);

  // Mantener visible la opción activa dentro del scroll del listbox.
  useEffect(() => {
    if (activeIndex < 0) return;
    const node = document.getElementById(optionId(activeIndex));
    node?.scrollIntoView({ block: "nearest" });
    // optionId depende solo de baseId (estable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const selectEvent = (event: EventSearchResult) => {
    setOpen(false);
    setActiveIndex(-1);
    router.push(`/eventos/${event.id}`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Escape se maneja ANTES del guard: debe cerrar el popup también en los
    // estados vacío/cargando (sin opciones navegables).
    if (event.key === "Escape") {
      if (listboxVisible) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (!listboxVisible || visibleResults.length === 0) {
      if (event.key === "ArrowDown" && visibleResults.length > 0) {
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
          index >= visibleResults.length - 1 ? 0 : index + 1,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) =>
          index <= 0 ? visibleResults.length - 1 : index - 1,
        );
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(visibleResults.length - 1);
        break;
      case "Enter":
        if (activeIndex >= 0 && activeIndex < visibleResults.length) {
          event.preventDefault();
          selectEvent(visibleResults[activeIndex]);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        // Cerrar al tabular fuera: si el nuevo foco no está dentro del root.
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={inputId}
        value={query}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          // Campo vacío: se limpia el estado del listbox aquí, en el handler,
          // en lugar de reaccionar con un efecto.
          if (!nextValue.trim()) {
            setResults([]);
            setOpen(false);
            setLoading(false);
            setActiveIndex(-1);
          }
        }}
        onFocus={() => {
          if (visibleResults.length) {
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={listboxVisible}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-label="Buscar evento por nombre"
        placeholder="Ir a un evento..."
        className="h-10 border-border bg-card pl-9 text-foreground placeholder:text-muted-foreground"
      />
      {listboxVisible ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover py-2 shadow-xl">
          <div
            id={listboxId}
            role="listbox"
            aria-label="Resultados de búsqueda de eventos"
            className="max-h-80 overflow-y-auto px-2"
          >
            {loading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Buscando eventos…
              </div>
            ) : null}
            {visibleResults.map((event, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={event.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isActive}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                    isActive ? "bg-muted" : ""
                  }`}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => selectEvent(event)}
                >
                  <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold uppercase tracking-tight text-foreground">{event.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(event.eventDate)}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
            {showEmpty ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                No se encontraron eventos
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
