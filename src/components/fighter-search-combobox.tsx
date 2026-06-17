"use client";

import { Search, Swords, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatRecord } from "@/lib/format";
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
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedName = value?.name ?? "";
  const trimmedQuery = query.trim();
  const results =
    trimmedQuery.length < 2
      ? []
      : fetchedResults.filter((fighter) => fighter.id !== excludeId);

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
    if (trimmedQuery.length < 2) {
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
          throw new Error("Search failed");
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
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [trimmedQuery]);

  const showEmpty = useMemo(
    () => query.trim().length >= 2 && !loading && results.length === 0,
    [loading, query, results.length],
  );

  return (
    <div ref={rootRef} className="relative space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
          {label}
        </label>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:bg-white/5 hover:text-white"
            onClick={() => {
              onSelect(null);
              setQuery("");
              setFetchedResults([]);
            }}
          >
            <X />
            Clear
          </Button>
        ) : null}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-500" />
        <Input
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
          placeholder="Search UFC fighters by name"
          className="h-12 rounded-2xl border-white/10 bg-white/5 pl-11 text-white placeholder:text-zinc-500"
        />
      </div>
      {open && (results.length > 0 || loading || showEmpty) ? (
        <Card className="absolute z-30 mt-2 w-full border-white/10 bg-zinc-950/95 py-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="max-h-80 overflow-y-auto px-2">
            {loading ? (
              <div className="px-3 py-4 text-sm text-zinc-400">Searching fighters…</div>
            ) : null}
            {results.map((fighter) => (
              <button
                key={fighter.id}
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-white/5"
                onClick={() => {
                  onSelect(fighter);
                  setQuery(fighter.name);
                  setOpen(false);
                }}
              >
                <div className="space-y-1">
                  <p className="font-medium text-white">{fighter.name}</p>
                  <p className="text-sm text-zinc-400">
                    {fighter.nickname ? `"${fighter.nickname}"` : "No nickname listed"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-red-200">
                    {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
                  </p>
                  <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                    Record
                  </p>
                </div>
              </button>
            ))}
            {showEmpty ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-zinc-400">
                <Swords className="size-4 text-zinc-500" />
                No fighters matched that search.
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}