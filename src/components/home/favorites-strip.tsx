"use client";

import { CalendarDays, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { SectionHeading } from "@/components/section-heading";
import { useFavorites } from "@/components/favorites/use-favorites";
import { formatDate } from "@/lib/format";
import type { FavoriteUpcomingBout } from "@/lib/types";

// Franja "Tus favoritos" de la home (isla client, patrón LiveBanner): sin
// favoritos guardados devuelve null y la home queda exactamente igual. Con
// favoritos pinta al instante desde localStorage (nombre + foto guardados) y
// enriquece con el próximo combate de cada uno vía /api/fighters/upcoming.
// Tope de tarjetas pintadas: con el máximo de 50 favoritos la sección
// enterraría el resto de la home (en móvil serían ~50 tarjetas a 1 columna).
const MAX_VISIBLE = 12;

export function FavoritesStrip() {
  const { favorites, toggle } = useFavorites();
  const [bouts, setBouts] = useState<Map<number, FavoriteUpcomingBout> | null>(
    null,
  );
  // null en `bouts` = cargando; `failed` distingue el error para no afirmar en
  // falso "Sin combate programado" cuando simplemente no hay respuesta.
  const [failed, setFailed] = useState(false);

  const visible = useMemo(() => favorites.slice(0, MAX_VISIBLE), [favorites]);

  // CSV canónico (ordenado y sin duplicados): clave estable del efecto y misma
  // URL entre visitas para aprovechar la caché CDN del endpoint.
  const idsCsv = useMemo(
    () =>
      [...new Set(visible.map((entry) => entry.id))]
        .sort((a, b) => a - b)
        .join(","),
    [visible],
  );

  useEffect(() => {
    if (!idsCsv) {
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(`/api/fighters/upcoming?ids=${idsCsv}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const data = (await response.json()) as {
          bouts: FavoriteUpcomingBout[];
        };
        setBouts(new Map(data.bouts.map((bout) => [bout.fighterId, bout])));
        setFailed(false);
      } catch (error) {
        // El abort del desmontaje no es un fallo; sin red o BD caída sí.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFailed(true);
        }
      }
    };

    void load();

    return () => controller.abort();
  }, [idsCsv]);

  if (favorites.length === 0) {
    return null;
  }

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Tus favoritos"
          title="Luchadores guardados"
          description="Se guardan en este navegador. Marca la estrella en la ficha de cualquier luchador."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((favorite) => {
            const bout = bouts?.get(favorite.id);
            return (
              <div key={favorite.id} className={`${PREMIUM_TILE} p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/fighters/${favorite.id}`}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <FighterHeadshot
                      name={favorite.name}
                      headshotUrl={favorite.headshotUrl}
                      size="sm"
                      className="size-12 shrink-0"
                    />
                    <span className="min-w-0 font-display text-lg font-bold uppercase leading-tight tracking-tight text-foreground transition-colors hover:text-primary">
                      {favorite.name}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(favorite)}
                    aria-label={`Quitar a ${favorite.name} de favoritos`}
                    title="Quitar de favoritos"
                    className="shrink-0 rounded-md p-1.5 text-amber-600 transition-colors hover:bg-muted dark:text-amber-400"
                  >
                    <Star className="size-4 fill-current" aria-hidden />
                  </button>
                </div>
                <div className="mt-3 min-h-10 border-t border-border pt-3 text-sm text-muted-foreground">
                  {bouts === null ? (
                    <p className="text-muted-foreground/70">
                      {failed
                        ? "No se pudo cargar el próximo combate."
                        : "Cargando próximo combate…"}
                    </p>
                  ) : bout ? (
                    <>
                      <p className="min-w-0">
                        vs{" "}
                        {bout.opponentId ? (
                          <Link
                            href={`/fighters/${bout.opponentId}`}
                            className="font-semibold text-foreground transition-colors hover:text-primary"
                          >
                            {bout.opponentName ?? "Rival por confirmar"}
                          </Link>
                        ) : (
                          <span className="font-semibold text-foreground">
                            {bout.opponentName ?? "Rival por confirmar"}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                        {bout.eventId ? (
                          <Link
                            href={`/eventos/${bout.eventId}`}
                            className="font-display font-bold uppercase tracking-tight text-foreground transition-colors hover:text-primary"
                          >
                            {bout.eventName ?? "Evento por confirmar"}
                          </Link>
                        ) : (
                          (bout.eventName ?? "Evento por confirmar")
                        )}
                        {bout.eventDate ? (
                          <>
                            <span aria-hidden>·</span>
                            {formatDate(bout.eventDate)}
                          </>
                        ) : null}
                      </p>
                    </>
                  ) : (
                    <p>Sin combate programado</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {favorites.length > MAX_VISIBLE ? (
          <p className="text-sm text-muted-foreground">
            Mostrando {MAX_VISIBLE} de {favorites.length} favoritos.
          </p>
        ) : null}
      </div>
    </section>
  );
}
