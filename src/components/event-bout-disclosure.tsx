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
  defaultOpen = false,
  toggleLabel = "Ver comparativa física",
}: {
  row: ReactNode;
  panel: ReactNode;
  // T3-A fase B: /en-vivo abre de serie el panel de la pelea EN CURSO. Como
  // los router.refresh() de AutoRefresh conservan el estado cliente, el prop
  // recalculado no bastaba: hace falta sincronizarlo en los cambios de estado
  // (ver el efecto de abajo).
  defaultOpen?: boolean;
  toggleLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  // Revisión adversarial (hallazgo 3): useState(defaultOpen) solo aplica en el
  // montaje, así que con la pestaña abierta toda la velada la nueva pelea EN
  // CURSO se quedaba cerrada y la vieja abierta. Sincronizamos las TRANSICIONES
  // de defaultOpen AJUSTANDO EL ESTADO EN EL RENDER (patrón oficial de React
  // para derivar de un cambio de prop sin efecto ni renders en cascada): al
  // pasar a EN CURSO (false→true) abrimos y olvidamos el toque manual previo
  // (empieza un tramo live nuevo); al dejar de estarlo (true→false) cerramos
  // SALVO que el usuario la abriera/cerrara a mano durante el directo.
  const [prevDefaultOpen, setPrevDefaultOpen] = useState(defaultOpen);
  const [userToggled, setUserToggled] = useState(false);
  if (defaultOpen !== prevDefaultOpen) {
    setPrevDefaultOpen(defaultOpen);
    if (defaultOpen) {
      setUserToggled(false);
      setOpen(true);
    } else if (!userToggled) {
      setOpen(false);
    }
  }

  const handleToggle = () => {
    setUserToggled(true);
    setOpen((value) => !value);
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">{row}</div>
        <button
          type="button"
          aria-label={toggleLabel}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={handleToggle}
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
