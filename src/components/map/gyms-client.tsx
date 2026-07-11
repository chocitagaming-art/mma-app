"use client";

import dynamic from "next/dynamic";
import { useState, type FormEvent } from "react";
import { MapPin, Navigation, Search } from "lucide-react";

import type { MapMarker } from "@/components/map/leaflet-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// El mapa toca window/document al cargar Leaflet, así que va con ssr:false. En
// Next 16 ssr:false sólo se permite dentro de un Client Component (este).
const LeafletMap = dynamic(() => import("@/components/map/leaflet-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

// Madrid como centro por defecto antes de cualquier búsqueda.
const DEFAULT_CENTER: [number, number] = [40.4168, -3.7038];

type GymsResponse = { center: [number, number]; gyms: MapMarker[] };

export function GymsClient() {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [gyms, setGyms] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [searched, setSearched] = useState(false);

  // Toda la búsqueda pasa por /api/gyms (server-side): geocoding con Nominatim y
  // gimnasios con Overpass. El cliente no puede llamar a esos dominios por la CSP,
  // y el proxy añade caché y respeta sus políticas de uso.
  async function loadFromApi(params: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gyms?${params}`);
      if (res.status === 404) {
        setError("No encontramos esa ciudad. Prueba con otro nombre.");
        return;
      }
      if (!res.ok) {
        setError("No pudimos cargar los gimnasios. Inténtalo de nuevo en un momento.");
        return;
      }
      const data = (await res.json()) as GymsResponse;
      setCenter(data.center);
      setGyms(data.gyms);
      setSearched(true);
    } catch {
      setError("No pudimos cargar los gimnasios. Inténtalo de nuevo en un momento.");
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("Tu navegador no permite geolocalización. Busca por ciudad.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => void loadFromApi(`lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`),
      () => {
        setLoading(false);
        setError("No diste permiso de ubicación. Prueba a buscar por ciudad.");
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const query = city.trim();
    if (!query) return;
    void loadFromApi(`city=${encodeURIComponent(query)}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="button" onClick={useMyLocation} disabled={loading} className="gap-2">
          <Navigation className="size-4" aria-hidden />
          Usar mi ubicación
        </Button>
        <form onSubmit={onSearch} className="flex flex-1 gap-2">
          <Input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="…o busca por ciudad (p. ej. Madrid, Barcelona)"
            aria-label="Buscar gimnasios por ciudad"
          />
          <Button type="submit" variant="secondary" disabled={loading} className="gap-2">
            <Search className="size-4" aria-hidden />
            Buscar
          </Button>
        </form>
      </div>

      {error ? (
        <p className="rounded-lg border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-foreground">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-[420px] w-full overflow-hidden rounded-lg border border-border">
          <LeafletMap center={center} markers={gyms} />
        </div>

        <div className="flex flex-col rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <MapPin className="size-4 text-primary" aria-hidden />
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              {loading ? "Buscando…" : searched ? `${gyms.length} gimnasios cerca` : "Gimnasios"}
            </h2>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : gyms.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm leading-6 text-muted-foreground">
                {searched
                  ? "No encontramos gimnasios de artes marciales cerca. Prueba a buscar otra ciudad."
                  : "Usa tu ubicación o busca una ciudad para ver los gimnasios de MMA, boxeo y muay thai cercanos."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {gyms.map((gym) => (
                  <li key={gym.id} className="px-4 py-3">
                    <p className="font-display text-sm font-bold uppercase tracking-tight text-foreground">{gym.name}</p>
                    <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="capitalize">{gym.type}</span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${gym.lat},${gym.lon}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-primary hover:underline"
                      >
                        Cómo llegar
                      </a>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <p className="text-center font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        Datos de gimnasios © colaboradores de OpenStreetMap
      </p>
    </div>
  );
}
