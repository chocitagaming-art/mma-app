"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { nextTabIndex } from "@/lib/tabs-keyboard";
import { cn } from "@/lib/utils";

export type P4PTabPanel = {
  /** Sufijo de los ids: `p4p-tab-<key>` / `p4p-panel-<key>`. */
  key: string;
  label: string;
  /** La rejilla, ya pintada en SERVIDOR: aquí solo se enseña o se esconde. */
  content: ReactNode;
};

// Pestañas «Masculino» / «Femenino» del bloque libra por libra de la portada.
//
// Las dos rejillas llegan hechas del servidor como `content` (el patrón de
// «interleaving» de Next: node_modules/next/dist/docs/01-app/01-getting-started/
// 05-server-and-client-components.md), así que esta isla solo guarda qué
// pestaña está activa. El panel inactivo lleva `hidden`, que Tailwind v4 fuerza
// con `display: none !important` aunque el panel tenga una clase `grid`.
//
// 🪤 El estado es local, sin `?p4p=` en la URL: `useSearchParams` obligaría a
// envolver la portada en <Suspense> para no perder el render estático.
//
// Estilo de píldora copiado de hall-of-fame-tabs.tsx, con sus mismos colores
// (ya medidos en contrast.test.ts: --primary-foreground sobre --primary).
// Teclado: patrón WAI-ARIA «tabs with automatic activation», en
// src/lib/tabs-keyboard.ts.
export function P4PTabs({ label, panels }: { label: string; panels: P4PTabPanel[] }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextTabIndex(active, event.key, panels.length);
    if (next === null) {
      return;
    }
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="space-y-7">
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
        {panels.map((panel, index) => {
          const selected = index === active;
          return (
            <button
              key={panel.key}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              id={`p4p-tab-${panel.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`p4p-panel-${panel.key}`}
              // Tabulador itinerante: solo la pestaña activa entra en el orden
              // del Tab; entre pestañas se va con las flechas.
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={onKeyDown}
              // 🪤 Foco con outline SEPARADO (offset), no con ring pegado: --ring
              // es el mismo rojo que --primary, y sobre la píldora activa un
              // anillo pegado no se vería.
              className={cn(
                "rounded-full border px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {panel.label}
            </button>
          );
        })}
      </div>

      {panels.map((panel, index) => (
        <div
          key={panel.key}
          id={`p4p-panel-${panel.key}`}
          role="tabpanel"
          aria-labelledby={`p4p-tab-${panel.key}`}
          hidden={index !== active}
        >
          {panel.content}
        </div>
      ))}
    </div>
  );
}
