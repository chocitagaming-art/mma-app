"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// FE6: acordeón del mini tale-of-the-tape de la cartelera. Recibe la fila
// (el <Link> server de EventBoutRow) y el panel de comparativa ya renderizados
// y solo aporta el estado abierto/cerrado. El chevron es un botón HERMANO del
// Link (no está dentro), así desplegar nunca navega al detalle del combate.
export function EventBoutDisclosure({
  row,
  panel,
}: {
  row: ReactNode;
  panel: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">{row}</div>
        <button
          type="button"
          aria-label="Ver comparativa física"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-9 shrink-0 cursor-pointer items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground sm:w-10"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </div>
      {/* Animación con grid-template-rows (0fr → 1fr): transiciona a altura
          "auto" sin medir el contenido, mismo truco que un max-h pero exacto. */}
      <div
        id={panelId}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">{panel}</div>
      </div>
    </div>
  );
}
