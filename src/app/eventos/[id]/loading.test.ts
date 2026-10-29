import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EventDetailLoading from "@/app/eventos/[id]/loading";
import { EventBoutRow } from "@/components/event-bout-row";
import { Skeleton } from "@/components/ui/skeleton";
import type { EventBout, EventBoutFighter } from "@/lib/types";

// EL ESQUELETO DE CARGA DE LA FICHA DEL EVENTO, con la forma de la página real.
//
// Lo que sale mientras llega la ficha (de /eventos a /eventos/1099 con la
// respuesta retrasada, medido el 29-oct): el póster en pequeño AL LADO del
// título, cuando la página lo pone grande ENCIMA, y filas con caras de 48 px.
// Con las caras grandes en la cartelera (el dueño, 30-oct) la página salta
// todavía más al llegar. Aquí se juzga la FORMA, sin DOM (vitest va en
// environment "node"): las filas del esqueleto llevan la misma geometría que la
// fila grande de verdad, sin lo que la hace un enlace (group, hover,
// transition), con su columna del chevron, y el póster va a lo ancho. Dónde cae
// cada cosa, en píxeles, contra la página real, lo mide
// e2e/evento-caras.spec.ts.
//
// 🪤 Todo se cuenta POR ESTRUCTURA (filas × 2 caras), no con un número fijo: el
// esqueleto tiene 2 secciones de 5 filas, y un «10 caras» escrito a mano ya se
// equivocó una vez (son 20).

type Nodo = { el: ReactElement<{ className?: string; children?: unknown }>; padres: Nodo[] };

/** Todos los elementos del árbol que devuelve el esqueleto, con sus padres.
 *  Un componente propio del esqueleto (una función que no sea Skeleton) se
 *  pinta en el sitio: si no, sus filas no se verían y el test saldría verde
 *  sin mirar nada. */
function elementos(raiz: unknown, padres: Nodo[] = []): Nodo[] {
  if (Array.isArray(raiz)) return raiz.flatMap((hijo) => elementos(hijo, padres));
  if (!isValidElement(raiz)) return [];
  if (typeof raiz.type === "function" && raiz.type !== Skeleton) {
    return elementos((raiz.type as (props: unknown) => unknown)(raiz.props), padres);
  }
  const nodo: Nodo = { el: raiz as Nodo["el"], padres };
  return [nodo, ...elementos(nodo.el.props.children, [...padres, nodo])];
}

function hijos(nodo: Nodo): Nodo["el"][] {
  const lista = ([] as unknown[]).concat(nodo.el.props.children ?? []).flat(Infinity);
  return lista.filter(isValidElement) as Nodo["el"][];
}

function clases(el: { props: { className?: string } }): string[] {
  return (el.props.className ?? "").split(/\s+/).filter(Boolean);
}

const INTERACCION = ["group", "transition-colors", "hover:bg-muted/50"];

// La fila grande DE VERDAD, pintada: de ella salen las clases que el esqueleto
// tiene que repetir (la fila sin lo interactivo, las esquinas, la caja de la
// cara y el centro).
function filaGrandeReal() {
  const luchador = (id: number, name: string): EventBoutFighter => ({
    id,
    name,
    nickname: null,
    headshotUrl: null,
    nationality: null,
    wins: 1,
    losses: 0,
    draws: 0,
    rank: null,
    heightCm: 180,
    reachCm: null,
    stance: null,
    birthDate: null,
  });
  const bout: EventBout = {
    fightId: 1,
    weightClass: "Lightweight",
    method: null,
    endRound: null,
    endTime: null,
    scheduledRounds: 3,
    winnerId: null,
    boutOrder: 1,
    cardSegment: "main",
    status: null,
    isTitleFight: false,
    oddsRed: null,
    oddsBlue: null,
    red: luchador(1, "Rojo"),
    blue: luchador(2, "Azul"),
  };
  const html = renderToStaticMarkup(createElement(EventBoutRow, { bout, headshotSize: "large" }));
  const clase = (re: RegExp) => {
    const m = re.exec(html);
    if (!m) throw new Error(`no encuentro ${re} en la fila grande`);
    return m[1].split(" ");
  };
  return {
    fila: clase(/<a [^>]*data-testid="bout-row" class="([^"]*)"/).filter((c) => !INTERACCION.includes(c)),
    roja: clase(/data-bout-corner="red" class="([^"]*)"/),
    azul: clase(/data-bout-corner="blue" class="([^"]*)"/),
    centro: clase(/<div class="([^"]*)"><span class="font-mono[^"]*">VS<\/span>/),
  };
}

describe("el esqueleto de /eventos/[id], con la forma de la página real", () => {
  const arbol = elementos(EventDetailLoading());
  const real = filaGrandeReal();
  const filas = arbol.filter((n) => clases(n.el).includes("grid-cols-[1fr_auto_1fr]"));

  it("tiene filas de cartelera (si no, todo lo demás sería un verde vacío)", () => {
    expect(filas.length).toBeGreaterThanOrEqual(5);
  });

  it("🔴 cada fila, con la geometría de la fila grande y sin hover (no es un enlace)", () => {
    for (const fila of filas) {
      expect(new Set(clases(fila.el))).toEqual(new Set(real.fila));
      for (const interactiva of INTERACCION) expect(clases(fila.el)).not.toContain(interactiva);
    }
  });

  it("🔴 TODAS las caras con la caja grande, size-18 y sm:size-24: dos por fila", () => {
    const caras = filas.flatMap((fila) => {
      const [roja, , azul] = hijos(fila);
      return [roja, azul].map((esquina) => hijos({ el: esquina, padres: [] })[0]);
    });
    expect(caras).toHaveLength(filas.length * 2);
    for (const cara of caras) {
      expect(clases(cara)).toEqual(expect.arrayContaining(["size-18", "sm:size-24", "shrink-0"]));
      expect(clases(cara).filter((c) => /(^|:)size-(9|12)$/.test(c))).toEqual([]);
    }
  });

  it("🔴 las esquinas se apilan por debajo de lg, como las de verdad, y el centro es el suyo", () => {
    for (const fila of filas) {
      const [roja, centro, azul] = hijos(fila);
      expect(new Set(clases(roja))).toEqual(new Set(real.roja));
      expect(new Set(clases(azul))).toEqual(new Set(real.azul));
      expect(clases(roja)).toEqual(expect.arrayContaining(["flex-col", "lg:flex-row"]));
      expect(clases(azul)).toEqual(expect.arrayContaining(["flex-col", "lg:flex-row-reverse"]));
      expect(new Set(clases(centro))).toEqual(new Set(real.centro));
    }
  });

  it("🔴 cada fila con su columna del chevron (w-9, sm:w-10), como EventBoutDisclosure", () => {
    for (const fila of filas) {
      // fila ← div.min-w-0.flex-1 ← div.flex.items-stretch, con el chevron de hermano.
      const envoltorio = fila.padres.at(-1);
      const tira = fila.padres.at(-2);
      expect(envoltorio && clases(envoltorio.el)).toEqual(
        expect.arrayContaining(["min-w-0", "flex-1"]),
      );
      expect(tira && clases(tira.el)).toEqual(expect.arrayContaining(["flex", "items-stretch"]));
      const [, chevron] = tira ? hijos(tira) : [];
      expect(chevron, "sin columna del chevron").toBeDefined();
      expect(clases(chevron)).toEqual(
        expect.arrayContaining(["w-9", "sm:w-10", "shrink-0", "border-l"]),
      );
    }
  });

  it("🔴 el póster, grande y a lo ancho encima del título (max-w-3xl), no pequeño al lado", () => {
    const posters = arbol.filter((n) => clases(n.el).includes("aspect-[16/9]"));
    expect(posters).toHaveLength(1);
    const [poster] = posters;
    const columna = [poster, ...poster.padres].find((n) => clases(n.el).includes("max-w-3xl"));
    expect(columna, "el póster no va en la columna max-w-3xl de la página").toBeDefined();
    expect(clases(columna!.el)).toEqual(expect.arrayContaining(["mx-auto", "w-full"]));
    for (const n of arbol) {
      expect(clases(n.el)).not.toContain("sm:w-56");
      expect(clases(n.el)).not.toContain("sm:flex-row");
    }
  });
});
