import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Solo permite enlaces externos http/https. Defensa en profundidad ante una URL
// comprometida en la BD (p. ej. "javascript:"/"data:"); devuelve "#" si no es válida.
export function safeExternalUrl(url: string | null | undefined): string {
  if (!url) return "#"
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : "#"
  } catch {
    return "#"
  }
}
