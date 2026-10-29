import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import LivePageLoading from "@/app/en-vivo/loading";
import { Skeleton } from "@/components/ui/skeleton";

// EL ESQUELETO DE /en-vivo, con las filas grandes del marcador.
//
// Desde el 30-oct /en-vivo pinta la fila grande (caras de 72/96 px, esquinas
// apiladas por debajo de lg) con su franja de estado encima y la columna del
// chevron al lado (el panel de estadísticas). El esqueleto tenía caras de 48 en
// todos los anchos y ninguna columna: al llegar la página, cada fila crecía y
// todo saltaba. Mismo método que src/app/eventos/[id]/loading.test.ts, contado
// por estructura.

type El = ReactElement<{ className?: string; children?: unknown }>;
type Nodo = { el: El; padres: Nodo[] };

function elementos(raiz: unknown, padres: Nodo[] = []): Nodo[] {
  if (Array.isArray(raiz)) return raiz.flatMap((hijo) => elementos(hijo, padres));
  if (!isValidElement(raiz)) return [];
  if (typeof raiz.type === "function" && raiz.type !== Skeleton) {
    return elementos((raiz.type as (props: unknown) => unknown)(raiz.props), padres);
  }
  const nodo: Nodo = { el: raiz as El, padres };
  return [nodo, ...elementos(nodo.el.props.children, [...padres, nodo])];
}

function hijos(el: El): El[] {
  const lista = ([] as unknown[]).concat(el.props.children ?? []).flat(Infinity);
  return lista.filter(isValidElement) as El[];
}

function clases(el: El): string[] {
  return (el.props.className ?? "").split(/\s+/).filter(Boolean);
}

describe("el esqueleto de /en-vivo", () => {
  const arbol = elementos(LivePageLoading());
  const filas = arbol.filter((n) => clases(n.el).includes("grid-cols-[1fr_auto_1fr]"));

  it("tiene filas de cartelera", () => {
    expect(filas.length).toBeGreaterThanOrEqual(4);
  });

  it("🔴 todas las caras con la caja grande (size-18, sm:size-24) y las esquinas apiladas hasta lg", () => {
    const caras: El[] = [];
    for (const fila of filas) {
      const [roja, , azul] = hijos(fila.el);
      expect(clases(roja)).toEqual(expect.arrayContaining(["flex-col", "lg:flex-row"]));
      expect(clases(azul)).toEqual(expect.arrayContaining(["flex-col", "lg:flex-row-reverse"]));
      caras.push(hijos(roja)[0], hijos(azul)[0]);
    }
    expect(caras).toHaveLength(filas.length * 2);
    for (const cara of caras) {
      expect(clases(cara)).toEqual(expect.arrayContaining(["size-18", "sm:size-24"]));
      expect(clases(cara).filter((c) => /(^|:)size-(9|12)$/.test(c))).toEqual([]);
    }
  });

  it("🔴 sin hover (no son enlaces), con la columna del chevron y la franja de estado encima", () => {
    for (const fila of filas) {
      for (const interactiva of ["group", "transition-colors", "hover:bg-muted/50"]) {
        expect(clases(fila.el)).not.toContain(interactiva);
      }
      const tira = fila.padres.at(-2);
      expect(tira && clases(tira.el)).toEqual(expect.arrayContaining(["flex", "items-stretch"]));
      const [, chevron] = tira ? hijos(tira.el) : [];
      expect(chevron, "sin columna del chevron").toBeDefined();
      expect(clases(chevron)).toEqual(expect.arrayContaining(["w-9", "sm:w-10", "border-l"]));
      // La franja del chip («En curso», «Finalizada»…) va antes que la fila.
      const bloque = fila.padres.at(-3);
      const [franja] = bloque ? hijos(bloque.el) : [];
      expect(franja && clases(franja)).toEqual(expect.arrayContaining(["px-4", "pt-2.5", "sm:px-5"]));
    }
  });
});
