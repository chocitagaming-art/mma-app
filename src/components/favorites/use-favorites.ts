"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  FAVORITES_CHANGED_EVENT,
  FAVORITES_STORAGE_KEY,
  isFavorite as isFavoriteIn,
  parseFavorites,
  serializeFavorites,
  toggleFavorite,
  type FavoriteFighter,
} from "@/lib/favorites";

// Snapshot con estabilidad referencial: useSyncExternalStore exige que
// getSnapshot devuelva la MISMA referencia mientras no haya cambios, o React
// entra en bucle de re-renders. Cacheamos por el string crudo de localStorage.
const EMPTY: FavoriteFighter[] = [];
let cachedRaw: string | null = null;
let cachedList: FavoriteFighter[] = EMPTY;

function readSnapshot(): FavoriteFighter[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
  } catch {
    // Sin localStorage (Safari en privado estricto): favoritos vacíos.
    raw = null;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parseFavorites(raw);
  }

  return cachedList;
}

function subscribe(onStoreChange: () => void): () => void {
  // 'storage' sincroniza otras pestañas (no se dispara en la que escribe);
  // el CustomEvent propio sincroniza los componentes de esta pestaña.
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(FAVORITES_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(FAVORITES_CHANGED_EVENT, onStoreChange);
  };
}

// En SSR/hidratación no hay localStorage: constante estable para no romper la
// hidratación (la estrella pinta vacía un frame; mismo trade-off que use-live-now).
function getServerSnapshot(): FavoriteFighter[] {
  return EMPTY;
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);

  const toggle = useCallback(
    (fighter: { id: number; name: string; headshotUrl: string | null }) => {
      try {
        const next = toggleFavorite(readSnapshot(), fighter);
        localStorage.setItem(FAVORITES_STORAGE_KEY, serializeFavorites(next));
      } catch {
        // Sin persistencia disponible: el clic no rompe la página.
      }
      window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
    },
    [],
  );

  const isFavorite = useCallback(
    (id: number) => isFavoriteIn(favorites, id),
    [favorites],
  );

  return { favorites, toggle, isFavorite };
}
