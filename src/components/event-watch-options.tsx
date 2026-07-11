"use client";

import { useState } from "react";
import { ChevronDown, Tv } from "lucide-react";

import { buildWatchOptions } from "@/lib/watch-options";

// Botón "Ver el combate" (S2-F) para eventos próximos: despliega el módulo
// "Dónde verlo" con las opciones oficiales en España etiquetadas GRATIS /
// DE PAGO. Va como hermano del botón Entradas dentro de un contenedor
// flex-wrap: el panel usa basis-full para saltar a su propia línea completa.
export function EventWatchOptions({ hasEarlyPrelims }: { hasEarlyPrelims: boolean }) {
  const [open, setOpen] = useState(false);
  const options = buildWatchOptions({ hasEarlyPrelims });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="donde-verlo"
        className="inline-flex items-center gap-1.5 rounded-md border border-primary px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
      >
        <Tv className="size-3.5" aria-hidden />
        Ver el combate
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id="donde-verlo"
          className="basis-full rounded-lg border border-border bg-card p-4"
        >
          <p className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
            Dónde verlo en España
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {options.map((option) => (
              <li
                key={option.label}
                className="flex items-start gap-3 rounded-md border border-border bg-background/40 p-3"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.12em] ${
                    option.kind === "free"
                      ? "bg-win/10 text-win"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {option.kind === "free" ? "Gratis" : "De pago"}
                </span>
                <span className="min-w-0">
                  <a
                    href={option.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display text-sm font-bold uppercase tracking-tight text-foreground transition-colors hover:text-primary"
                  >
                    {option.label}
                  </a>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {option.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
            Según la emisión oficial de UFC en España · Horarios en hora local arriba
          </p>
        </div>
      ) : null}
    </>
  );
}
