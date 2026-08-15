import type { Page } from "@playwright/test";

// La red que le faltaba a la red: resolver el contraste de TEXTO sobre un fondo
// en DEGRADADO, que es justo lo que axe-core no sabe hacer.
//
// EL AGUJERO QUE TAPA, medido el 15-ago-2026 contra producción. Los tiles de la
// ficha usan PREMIUM_TILE, que es `bg-gradient-to-b from-card to-muted/60`. Ante
// un fondo así axe no se moja: no lo cuenta como violación, lo deja en
// `incomplete` — 29 nodos del bloque de agarre en /fights/14232, 37 en
// /fights/3821 — y `accesibilidad.spec.ts` solo leía `violations`. La cabecera
// de ese fichero afirmaba cubrir el contraste de texto, y para todo lo que va
// dentro de un tile era falso.
//
// Por ese hueco se coló que «de 15:00 de combate» (fight-grip.tsx, un
// `text-muted-foreground/80` de 11,2 px) diera 4,35:1 en tema claro, donde el
// texto pequeño pide 4,5. En las 8.612 fichas que publican el bloque.
//
// 🪤 POR QUÉ NO SE ACTIVAN LOS `incomplete` A SECAS: son 76-119 nodos por
// página, y de todos ellos incumple UNO. Una puerta que grita siempre es una
// puerta apagada. Hay que resolverlos, no reenviarlos.

export type NodoSinResolver = {
  target: string;
  motivo: string;
};

export type FalloDeContraste = {
  target: string;
  html: string;
  texto: string;
  ratio: number;
  exigido: number;
  color: string;
  fondo: string;
};

export type ResultadoDegradados = {
  fallos: FalloDeContraste[];
  /** Nodos que este resolvedor NO sabe decidir. Su número se congela en un test. */
  sinResolver: NodoSinResolver[];
  /** Nodos de color-contrast en `incomplete` que sí se han podido medir. */
  resueltos: number;
};

type NodoIncompleto = { target: string[]; html: string; mensaje: string };

/**
 * Mide el contraste real de los nodos que axe dejó en `incomplete` por culpa de
 * un fondo en degradado.
 *
 * El cálculo se hace DENTRO del navegador y con sus propios colores resueltos,
 * no con los hex de globals.css: en producción el CSS compilado emite
 * `oklab(… / 0.8)` para las opacidades de Tailwind, que ningún parseador de hex
 * entiende. Todo color pasa por un canvas de 1×1 (`fillStyle` + `getImageData`),
 * que es el único conversor que acepta cualquier sintaxis CSS y devuelve RGBA.
 *
 * 🪤 Y NO SE INTERPOLA EL DEGRADADO: se mide el texto contra LOS DOS EXTREMOS y
 * se conserva el peor. Interpolar en la posición vertical del nodo daría un
 * número más bonito y podría regalar un aprobado a un texto de varias líneas o
 * a un elemento transformado. El peor extremo es una cota: si pasa ahí, pasa en
 * todo el tile.
 */
export async function medirContrasteEnDegradados(
  page: Page,
  incompletos: NodoIncompleto[],
): Promise<ResultadoDegradados> {
  const candidatos = incompletos.filter((n) =>
    /gradient/i.test(n.mensaje),
  );

  if (candidatos.length === 0) {
    return { fallos: [], sinResolver: [], resueltos: 0 };
  }

  return page.evaluate((nodos) => {
    const lienzo = document.createElement("canvas");
    lienzo.width = 1;
    lienzo.height = 1;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true })!;

    // Cualquier sintaxis CSS -> [r,g,b,a]. El navegador hace la conversión.
    function aRgba(color: string): [number, number, number, number] | null {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = color;
      // Si el color no se entiende, fillStyle conserva el valor anterior.
      if (ctx.fillStyle === "#000000" && !/^(#000000|black|rgb\(0, 0, 0\))$/i.test(color.trim())) {
        return null;
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    }

    function componer(
      frente: [number, number, number, number],
      fondo: [number, number, number],
    ): [number, number, number] {
      const a = frente[3];
      return [
        Math.round(frente[0] * a + fondo[0] * (1 - a)),
        Math.round(frente[1] * a + fondo[1] * (1 - a)),
        Math.round(frente[2] * a + fondo[2] * (1 - a)),
      ];
    }

    function luminancia([r, g, b]: [number, number, number]): number {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }

    function ratio(a: [number, number, number], b: [number, number, number]): number {
      const la = luminancia(a);
      const lb = luminancia(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    // El fondo OPACO que hay detrás de un elemento: se suben ancestros
    // componiendo sus background-color hasta topar con uno opaco.
    function fondoOpacoDetras(desde: Element | null): [number, number, number] {
      const capas: [number, number, number, number][] = [];
      let el: Element | null = desde;
      while (el) {
        const bg = aRgba(getComputedStyle(el).backgroundColor);
        if (bg && bg[3] > 0) {
          capas.push(bg);
          if (bg[3] >= 1) break;
        }
        el = el.parentElement;
      }
      let base: [number, number, number] = [255, 255, 255];
      for (let i = capas.length - 1; i >= 0; i--) base = componer(capas[i], base);
      return base;
    }

    // Los colores de un linear-gradient() ya resuelto por el navegador. Se
    // parten por comas de primer nivel para no romper `oklab(a b c / .3)`.
    function coloresDelDegradado(imagen: string): string[] {
      const dentro = imagen.slice(imagen.indexOf("(") + 1, imagen.lastIndexOf(")"));
      const partes: string[] = [];
      let nivel = 0;
      let actual = "";
      for (const ch of dentro) {
        if (ch === "(") nivel++;
        if (ch === ")") nivel--;
        if (ch === "," && nivel === 0) {
          partes.push(actual.trim());
          actual = "";
          continue;
        }
        actual += ch;
      }
      partes.push(actual.trim());
      // El primer trozo puede ser la dirección ("to bottom", "180deg").
      return partes
        .filter((p) => !/^(to\s|[\d.]+deg|[\d.]+rad|[\d.]+turn|in\s)/i.test(p))
        .map((p) => p.replace(/\s+[\d.]+%$/, "").trim())
        .filter(Boolean);
    }

    const fallos: {
      target: string;
      html: string;
      texto: string;
      ratio: number;
      exigido: number;
      color: string;
      fondo: string;
    }[] = [];
    const sinResolver: { target: string; motivo: string }[] = [];
    let resueltos = 0;

    for (const nodo of nodos) {
      const sel = nodo.target[nodo.target.length - 1];
      let el: Element | null = null;
      try {
        el = document.querySelector(sel);
      } catch {
        el = null;
      }
      if (!el) {
        sinResolver.push({ target: sel, motivo: "el selector ya no encuentra el nodo" });
        continue;
      }

      const estilo = getComputedStyle(el);
      const color = aRgba(estilo.color);
      if (!color) {
        sinResolver.push({ target: sel, motivo: `color ilegible: ${estilo.color}` });
        continue;
      }

      // El ancestro que pone el degradado.
      let conDegradado: Element | null = el;
      while (conDegradado && !/gradient/i.test(getComputedStyle(conDegradado).backgroundImage)) {
        conDegradado = conDegradado.parentElement;
      }
      if (!conDegradado) {
        sinResolver.push({ target: sel, motivo: "no hay ancestro con degradado" });
        continue;
      }

      const stops = coloresDelDegradado(getComputedStyle(conDegradado).backgroundImage);
      if (stops.length === 0) {
        sinResolver.push({ target: sel, motivo: "el degradado no declara colores" });
        continue;
      }

      const base = fondoOpacoDetras(conDegradado.parentElement);
      const extremos: [number, number, number][] = [];
      for (const stop of stops) {
        const c = aRgba(stop);
        if (c) extremos.push(componer(c, base));
      }
      if (extremos.length === 0) {
        sinResolver.push({ target: sel, motivo: "ningún color del degradado se entiende" });
        continue;
      }

      // Entre el degradado y el texto puede haber fondos intermedios propios.
      let fondoFinal = extremos;
      const propio = aRgba(estilo.backgroundColor);
      if (propio && propio[3] > 0) {
        fondoFinal = extremos.map((e) => componer(propio, e));
      }

      const tinta = componer(color, fondoFinal[0]);
      const ratios = fondoFinal.map((f) => ratio(tinta, f));
      const peor = Math.min(...ratios);

      const px = parseFloat(estilo.fontSize);
      const peso = parseInt(estilo.fontWeight, 10) || 400;
      const grande = px >= 24 || (peso >= 700 && px >= 18.66);
      const exigido = grande ? 3 : 4.5;

      resueltos++;
      if (peor + 0.005 < exigido) {
        const f = fondoFinal[ratios.indexOf(peor)];
        fallos.push({
          target: sel,
          html: nodo.html,
          texto: (el.textContent ?? "").trim().slice(0, 60),
          ratio: Math.round(peor * 1000) / 1000,
          exigido,
          color: `rgb(${tinta.join(", ")})`,
          fondo: `rgb(${f.join(", ")})`,
        });
      }
    }

    return { fallos, sinResolver, resueltos };
  }, candidatos);
}
