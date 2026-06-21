"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatWeightClass } from "@/lib/format";
import type { FighterSearchResult } from "@/lib/types";

type FightersFilterBarProps = {
  weightClasses: string[];
  stances: string[];
  nationalities: string[];
  current: {
    q: string;
    weightClass: string;
    stance: string;
    nationality: string;
    sort: string;
  };
};

export function FightersFilterBar({
  weightClasses,
  stances,
  nationalities,
  current,
}: FightersFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());

    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    next.delete("page");
    router.push(`${pathname ?? "/fighters"}${next.toString() ? `?${next.toString()}` : ""}`);
  }

  // Typeahead de luchadores (mismo patrón que SearchHero): mientras escribes sugiere
  // perfiles; Enter filtra la lista por el texto, y un clic salta directo al perfil.
  const [query, setQuery] = useState(current.q);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FighterSearchResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
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

  const showEmpty = trimmedQuery.length >= 1 && !loading && results.length === 0;

  const weightClassItems = {
    all: "Todas las categorías de peso",
    ...Object.fromEntries(
      weightClasses.map((weightClass) => [weightClass, formatWeightClass(weightClass)]),
    ),
  };
  const nationalityItems = {
    all: "Todas las nacionalidades",
    ...Object.fromEntries(nationalities.map((nationality) => [nationality, nationality])),
  };
  const stanceItems = {
    all: "Todas las guardias",
    ...Object.fromEntries(stances.map((stance) => [stance, stance])),
  };
  const sortItems = {
    relevance: "Ordenar: Relevancia",
    name: "Ordenar: Nombre",
    wins: "Ordenar: Victorias",
    losses: "Ordenar: Derrotas",
  };

  return (
    <div className="space-y-5">
      <div ref={searchRef} className="relative">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results.length) {
              setOpen(true);
            }
          }}
          placeholder="Buscar por nombre del luchador"
          className="h-11 w-full border-border bg-card text-foreground"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setOpen(false);
              updateParam("q", event.currentTarget.value);
            }
          }}
        />
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
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  No se encontraron luchadores
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2 block">
          Categoría de peso
        </label>
        <Select
          items={weightClassItems}
          value={current.weightClass || "all"}
          onValueChange={(value) => updateParam("weightClass", value ?? "all")}
        >
          <SelectTrigger className="h-11 w-full border-border bg-card text-foreground">
            <SelectValue placeholder="Categoría de peso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías de peso</SelectItem>
            {weightClasses.map((weightClass) => (
              <SelectItem key={weightClass} value={weightClass ?? "unknown-weight-class"}>
                {formatWeightClass(weightClass)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2 block">
          Nacionalidad
        </label>
        <Select
          items={nationalityItems}
          value={current.nationality || "all"}
          onValueChange={(value) => updateParam("nationality", value ?? "all")}
        >
          <SelectTrigger className="h-11 w-full border-border bg-card text-foreground">
            <SelectValue placeholder="Nacionalidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las nacionalidades</SelectItem>
            {nationalities.map((nationality) => (
              <SelectItem key={nationality} value={nationality ?? "unknown-nationality"}>
                {nationality}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2 block">
          Guardia
        </label>
        <Select
          items={stanceItems}
          value={current.stance || "all"}
          onValueChange={(value) => updateParam("stance", value ?? "all")}
        >
          <SelectTrigger className="h-11 w-full border-border bg-card text-foreground">
            <SelectValue placeholder="Guardia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las guardias</SelectItem>
            {stances.map((stance) => (
              <SelectItem key={stance} value={stance ?? "unknown-stance"}>
                {stance}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2 block">
          Ordenar por
        </label>
        <Select
          items={sortItems}
          value={current.sort}
          onValueChange={(value) =>
            updateParam("sort", value === "relevance" ? "" : value ?? "")
          }
        >
          <SelectTrigger className="h-11 w-full border-border bg-card text-foreground">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Ordenar: Relevancia</SelectItem>
            <SelectItem value="name">Ordenar: Nombre</SelectItem>
            <SelectItem value="wins">Ordenar: Victorias</SelectItem>
            <SelectItem value="losses">Ordenar: Derrotas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      </div>
    </div>
  );
}