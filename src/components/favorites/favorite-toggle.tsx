"use client";

import { Star } from "lucide-react";

import { useFavorites } from "./use-favorites";

type FavoriteToggleProps = {
  fighter: { id: number; name: string; headshotUrl: string | null };
};

// Estrella de la ficha: guarda/quita al luchador de los favoritos del navegador.
// Ámbar en activo con el criterio de la auditoría dark/light (amber-600 en claro,
// amber-400 en oscuro).
export function FavoriteToggle({ fighter }: FavoriteToggleProps) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(fighter.id);

  return (
    <button
      type="button"
      onClick={() => toggle(fighter)}
      aria-pressed={active}
      aria-label={
        active
          ? `Quitar a ${fighter.name} de favoritos`
          : `Guardar a ${fighter.name} en favoritos`
      }
      title={active ? "Quitar de favoritos" : "Guardar en favoritos"}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active
          ? "border-amber-600/40 bg-amber-500/10 text-amber-600 hover:border-amber-600/70 dark:border-amber-400/40 dark:text-amber-400 dark:hover:border-amber-400/70"
          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      <Star className={`size-5 ${active ? "fill-current" : ""}`} aria-hidden />
    </button>
  );
}
