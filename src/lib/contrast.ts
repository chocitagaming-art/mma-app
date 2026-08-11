// T7 de la película — la aritmética de contraste de WCAG 2.1, para poder
// AFIRMAR que un color cumple en vez de suponerlo.
//
// Por qué existe este fichero: hasta hoy el repo no tenía forma de comprobar un
// contraste. Los tokens de globals.css se eligieron a ojo y la propia
// especificación de la película reconoce que "los ratios citados no se
// recalcularon". Con esto, contrast.test.ts lee globals.css y falla en rojo si
// alguien mueve un color por debajo del umbral.
//
// El criterio que se aplica aquí es 1.4.11 (Non-text Contrast), NO 1.4.3: el
// tramo "nadie sujetaba" de la barra de agarre no es texto ni decoración,
// TRANSMITE INFORMACIÓN, así que el umbral es 3:1 y se mide contra el fondo
// y contra los colores que TOCA.

export type Rgb = [number, number, number];

// "#d20a0a" -> [210, 10, 10]. Acepta las tres y las seis cifras porque
// globals.css es hex puro, sin un solo oklch ni hsl en las declaraciones.
export function parseHex(hex: string): Rgb | null {
  if (typeof hex !== "string") {
    return null;
  }

  const clean = hex.trim().replace(/^#/, "");

  if (clean.length === 3) {
    const [r, g, b] = clean.split("");
    return parseHex(`#${r}${r}${g}${g}${b}${b}`);
  }

  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return null;
  }

  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

// Luminancia relativa, tal cual la define WCAG 2.1. El 0.03928 es el umbral de
// la propia norma; sí, la sRGB dice 0.04045, y sí, la diferencia es irrelevante
// numéricamente — se usa el de la norma para que el número sea el mismo que
// devuelve cualquier auditor.
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Ratio de contraste entre dos colores opacos. Simétrico: el orden no importa,
// porque el más claro va siempre arriba de la fracción. Rango 1..21.
// Devuelve null si alguno de los dos no es un hex legible, en vez de un NaN que
// se propaga silencioso.
export function contrastRatio(a: string, b: string): number | null {
  const rgbA = parseHex(a);
  const rgbB = parseHex(b);

  if (!rgbA || !rgbB) {
    return null;
  }

  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return (lighter + 0.05) / (darker + 0.05);
}

// Composición de `fg` sobre `bg` con opacidad `alpha`.
//
// Hace falta porque la superficie real de las secciones de la ficha NO es
// --card: PREMIUM_TILE es `bg-gradient-to-b from-card to-muted/60` (y /30 en
// oscuro), así que la mitad de abajo del tile es --muted mezclado con --card.
// Medir contra --card a secas da un número OPTIMISTA, y en al menos un caso
// medido (--chart-4 en claro) la diferencia decide entre cumplir y no cumplir:
// 3.30:1 contra --card, 2.96:1 contra la base real.
export function blend(fg: string, bg: string, alpha: number): string | null {
  const rgbFg = parseHex(fg);
  const rgbBg = parseHex(bg);

  if (!rgbFg || !rgbBg || !Number.isFinite(alpha)) {
    return null;
  }

  const clamped = Math.min(1, Math.max(0, alpha));
  const mixed = rgbFg.map((value, index) =>
    Math.round(value * clamped + rgbBg[index] * (1 - clamped)),
  );

  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

// Extrae los tokens `--nombre: #hex;` de un bloque de CSS.
//
// Deliberadamente tonto: no entiende CSS, solo busca el patrón. Es suficiente
// porque globals.css declara todos sus colores como hex literal, y si alguien
// cambiara un token a oklch() este parser dejaría de verlo y el test que lo
// exige fallaría en rojo — que es exactamente lo que debe pasar.
export function parseColorTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const pattern = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;

  let match = pattern.exec(css);
  while (match !== null) {
    tokens[match[1]] = match[2];
    match = pattern.exec(css);
  }

  return tokens;
}

// Aísla el cuerpo de un selector de primer nivel (`:root { … }`, `.dark { … }`)
// contando llaves, para no mezclar los dos temas al leer los tokens.
//
// 🪤 Exige que el selector vaya SEGUIDO de `{`, y no vale con encontrar el
// texto suelto. globals.css:5 declara `@custom-variant dark (&:is(.dark *));`,
// así que un `indexOf(".dark")` a pelo casa ahí y acaba devolviendo el bloque
// de `@theme inline`, con los tokens del tema equivocado y sin dar ningún
// error. Se cazó en el primer rojo de este test.
export function extractBlock(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(`${escaped}\\s*\\{`, "g");
  const found = opening.exec(css);

  if (found === null) {
    return null;
  }

  const open = found.index + found[0].length - 1;

  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") {
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, i);
      }
    }
  }

  return null;
}
