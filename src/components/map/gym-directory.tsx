"use client";

import { useMemo, useState } from "react";
import { Globe, MapPin, Phone, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GymDirectoryItem } from "@/lib/gyms";

const PAGE_SIZE = 24;

// Directorio completo de gimnasios (bajo el mapa). Filtro por arte marcial con
// chips (selección única + "Todos") + buscador por nombre/ciudad, todo en
// cliente sobre los datos ya cargados en el server (≤250 gimnasios). Paginado
// con "Ver más" para no pintar cientos de tarjetas de golpe.
export function GymDirectory({ gyms }: { gyms: GymDirectoryItem[] }) {
  const [activeSport, setActiveSport] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Disciplinas distintas con recuento, ordenadas por frecuencia desc.
  const sportsWithCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const gym of gyms) {
      for (const sport of gym.sports) {
        counts.set(sport, (counts.get(sport) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
      .map(([label, count]) => ({ label, count }));
  }, [gyms]);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return gyms.filter((gym) => {
      if (activeSport && !gym.sports.includes(activeSport)) return false;
      if (normalizedQuery) {
        const haystack =
          `${gym.name} ${gym.city ?? ""} ${gym.province ?? ""}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [gyms, activeSport, normalizedQuery]);

  const shown = filtered.slice(0, visible);

  function selectSport(sport: string | null) {
    setActiveSport(sport);
    setVisible(PAGE_SIZE);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    setVisible(PAGE_SIZE);
  }

  return (
    <div className="space-y-6">
      {/* Buscador por texto */}
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar por nombre o ciudad…"
          aria-label="Buscar gimnasios por nombre o ciudad"
          className="pl-9"
        />
      </div>

      {/* Chips de filtro por arte marcial */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filtrar por arte marcial"
      >
        <FilterChip
          label="Todos"
          count={gyms.length}
          active={activeSport === null}
          onClick={() => selectSport(null)}
        />
        {sportsWithCount.map(({ label, count }) => (
          <FilterChip
            key={label}
            label={label}
            count={count}
            active={activeSport === label}
            onClick={() => selectSport(label)}
          />
        ))}
      </div>

      {/* Recuento */}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {filtered.length === 0
          ? "No hay gimnasios con ese filtro."
          : `${filtered.length} ${filtered.length === 1 ? "gimnasio" : "gimnasios"}${activeSport ? ` de ${activeSport}` : ""}`}
      </p>

      {/* Grid de gimnasios */}
      {shown.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((gym) => (
            <li
              key={gym.id}
              className="flex flex-col rounded-lg border border-border bg-card p-4"
            >
              <p className="font-display text-sm font-bold uppercase tracking-tight text-foreground">
                {gym.name}
              </p>
              {gym.sports.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {gym.sports.map((sport) => (
                    <span
                      key={sport}
                      className="rounded-sm border border-primary/35 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-primary"
                    >
                      {sport}
                    </span>
                  ))}
                </div>
              ) : null}
              {gym.description ? (
                <p className="mt-2 text-xs leading-5 text-foreground/80">
                  {gym.description}
                </p>
              ) : null}
              {gym.address || gym.city ? (
                <p className="mt-1 flex items-start gap-1 text-xs leading-5 text-muted-foreground">
                  <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {gym.address ??
                    [gym.city, gym.province].filter(Boolean).join(", ")}
                </p>
              ) : null}
              <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-2.5 text-xs">
                {gym.website ? (
                  <a
                    href={gym.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Globe className="size-3" aria-hidden />
                    Web
                  </a>
                ) : null}
                {gym.phone ? (
                  <a
                    href={`tel:${gym.phone.replace(/[^+\d]/g, "")}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Phone className="size-3" aria-hidden />
                    {gym.phone}
                  </a>
                ) : null}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${gym.lat},${gym.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <MapPin className="size-3" aria-hidden />
                  Cómo llegar
                </a>
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Ver más */}
      {visible < filtered.length ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisible((value) => value + PAGE_SIZE)}
          >
            Ver más gimnasios ({filtered.length - visible})
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "font-mono text-[0.6rem]",
          active ? "text-primary-foreground/80" : "text-muted-foreground/70",
        )}
      >
        {count}
      </span>
    </button>
  );
}
