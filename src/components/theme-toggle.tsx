"use client";

import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

// Icono fijo mitad-sol-mitad-luna (dueño): un solo símbolo, idéntico en ambos
// temas. La mitad derecha rellena = luna; los rayos de la izquierda = sol. Usa
// currentColor para heredar el color del botón (y su hover/focus).
function HalfSunMoon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Disco */}
      <circle cx="12" cy="12" r="6" />
      {/* Mitad derecha rellena = luna */}
      <path d="M12 6a6 6 0 0 1 0 12z" fill="currentColor" stroke="none" />
      {/* Rayos de sol (mitad izquierda) */}
      <path d="M6.6 6.6 5.1 5.1" />
      <path d="M4.4 12H2.4" />
      <path d="M6.6 17.4 5.1 18.9" />
    </svg>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Cambiar tema"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {/* Símbolo fijo (no depende del tema) → sin flash de hidratación. */}
      <HalfSunMoon className="size-4" />
    </button>
  );
}
