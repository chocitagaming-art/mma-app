// Favoritos de luchadores guardados en localStorage (sin backend ni login: el
// usuario marca la estrella y el navegador recuerda). Lógica pura separada del
// hook para poder testearla con vitest (environment node, solo src/**/*.test.ts).

export type FavoriteFighter = {
  id: number;
  name: string;
  headshotUrl: string | null;
  // epoch ms de cuándo se marcó: orden de inserción estable para la franja.
  addedAt: number;
};

export const FAVORITES_STORAGE_KEY = "mma:favorites";
// El evento 'storage' del navegador solo se dispara en OTRAS pestañas; este
// CustomEvent sincroniza los componentes de la MISMA pestaña (estrella de la
// ficha, franja de la home y buscador conviviendo).
export const FAVORITES_CHANGED_EVENT = "mma:favorites-changed";
export const MAX_FAVORITES = 50;

// localStorage lo puede escribir cualquiera con acceso al navegador: solo se
// aceptan URLs https (o rutas relativas) de longitud acotada — una string
// arbitraria acabaría en el src de un <img> (beacon persistente).
function isValidHeadshotUrl(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }
  return (
    typeof value === "string" &&
    value.length <= 600 &&
    (value.startsWith("https://") || value.startsWith("/"))
  );
}

function isValidEntry(value: unknown): value is FavoriteFighter {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "number" &&
    Number.isSafeInteger(entry.id) &&
    entry.id > 0 &&
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    entry.name.length <= 200 &&
    isValidHeadshotUrl(entry.headshotUrl) &&
    typeof entry.addedAt === "number"
  );
}

// Parseo defensivo: localStorage lo puede editar cualquiera (o corromperse).
// JSON inválido, formas inesperadas o entradas rotas se descartan sin lanzar.
export function parseFavorites(raw: string | null): FavoriteFighter[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seen = new Set<number>();
    const list: FavoriteFighter[] = [];
    for (const entry of parsed) {
      if (isValidEntry(entry) && !seen.has(entry.id)) {
        seen.add(entry.id);
        list.push({
          id: entry.id,
          name: entry.name,
          headshotUrl: entry.headshotUrl,
          addedAt: entry.addedAt,
        });
      }
    }
    return list.slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function isFavorite(list: FavoriteFighter[], id: number): boolean {
  return list.some((entry) => entry.id === id);
}

// Añade o quita al luchador. Al añadir con la lista llena se descarta el
// favorito más antiguo (mejor que ignorar el clic en silencio).
export function toggleFavorite(
  list: FavoriteFighter[],
  fighter: { id: number; name: string; headshotUrl: string | null },
  now: number = Date.now(),
): FavoriteFighter[] {
  if (isFavorite(list, fighter.id)) {
    return list.filter((entry) => entry.id !== fighter.id);
  }

  const next = [
    ...list,
    {
      id: fighter.id,
      name: fighter.name,
      headshotUrl: fighter.headshotUrl,
      addedAt: now,
    },
  ];

  return next.length > MAX_FAVORITES ? next.slice(next.length - MAX_FAVORITES) : next;
}

export function serializeFavorites(list: FavoriteFighter[]): string {
  return JSON.stringify(list);
}
