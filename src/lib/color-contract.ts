// ─────────────────────────────────────────────────────────────────────────────
// EL CONTRATO DE COLOR DE MMA STATUS
//
// Destino en el repo: src/lib/color-contract.ts
//
// Esto NO es documentación: es la regla EJECUTABLE. La importan las dos puertas
// (src/lib/color-contract.test.ts, de tokens, y e2e/color.spec.ts, de píxeles)
// para que el número viva en UN sitio y no pueda derivar.
//
// La regla, en tres cláusulas numéricas, válidas en LOS DOS TEMAS:
//
//   R1 · TEXTO. Todo texto cumple WCAG 2.2 AA contra su fondo compuesto:
//        4,5:1 normal, 3:1 grande (≥24 px, o ≥18,66 px con peso ≥700).
//
//   R2 · SUPERFICIE. Toda superficie elevada se separa de su fondo inmediato en
//        TODO su perímetro por AL MENOS UNA de estas dos vías:
//          (a) color propio:   ΔE00(superficie, fondo) ≥ 3,0
//          (b) delimitador:    un borde/ring/sombra con ΔE00 ≥ 3,0 contra AMBOS
//                              lados (contra la superficie y contra el fondo)
//        …y SIEMPRE, sin excepción posible:
//          (c) sin cruce:      sign(L*superficie − L*fondo) constante en todo el
//                              perímetro y |ΔL*| ≥ 1,0 en cada punto.
//
//   R3 · TOKENS. Dos tokens que se usan juntos (superficie sobre fondo, texto
//        sobre superficie) mantienen el MISMO SIGNO de diferencia de L* en claro
//        y en oscuro. Un color no puede depender del tema para saber si sube o
//        baja.
//
// ── POR QUÉ ESTOS NÚMEROS (todos medidos en producción el 6-ago-2026) ─────────
//
// 4,5 / 3,0  → WCAG 2.2 SC 1.4.3. No es opinable.
// 3,0 (UI)   → WCAG 2.2 SC 1.4.11 para límites de componentes no textuales.
// ΔE00 ≥ 3,0 → ΔE00 = 1,0 es el JND de laboratorio. En pantalla sin calibrar el
//              umbral práctico está en 2–3. Y hay un motivo duro: MEDIDO, a
//              L*≈98 la rejilla de 8 bits ya no puede representar pasos de menos
//              de ~1 ΔE00 (color-mix al 45 % y al 48 % dan el MISMO hex #fdfbfb).
//              Por debajo de 3 se está pidiendo precisión que el sRGB no tiene.
// |ΔL*| ≥ 1,0 → es el suelo anti-cruce, no un objetivo. Cuando ΔL* = 0 la razón
//              de contraste vale EXACTAMENTE 1,000: la superficie ES el fondo.
//              MEDIDO hoy en /fighters/6495 (claro), a 123,7 px de 255 del tile.
//
// ── POR QUÉ NO VALE LA REGLA "ΔE00 ≥ 3 EN TODO EL PERÍMETRO" A SECAS ──────────
// Porque MEDIDO condena el diseño entero del modo claro, incluido el que el
// dueño da por bueno: la card blanca #ffffff sobre el fondo #faf7f6 tiene
// ΔE00 = 2,069 en su MEJOR punto. La separación en claro no la hace el color:
// la hace el delimitador (--border #ded2cf da ΔE00 8,646 contra el fondo y
// 10,630 contra la card). Por eso (a) y (b) son alternativas, y solo (c) es
// obligatoria siempre.
// ─────────────────────────────────────────────────────────────────────────────

export const CONTRATO = {
  /** WCAG 2.2 SC 1.4.3 — texto normal. */
  TEXTO_AA: 4.5,
  /** WCAG 2.2 SC 1.4.3 — texto grande (≥24 px, o ≥18,66 px con peso ≥700). */
  TEXTO_AA_GRANDE: 3,
  /** WCAG 2.2 SC 1.4.11 — límites de componentes de interfaz. */
  UI_NO_TEXTUAL: 3,
  /** R2(a): separación por color propio. */
  SUPERFICIE_DE00: 3,
  /** R2(b): un delimitador cuenta si se ve contra los DOS lados. */
  DELIMITADOR_DE00: 3,
  /** R2(c): suelo anti-cruce. Por debajo de esto la superficie se funde. */
  SUPERFICIE_DL_MIN: 1,
} as const;

/** Tamaño a partir del cual WCAG considera el texto "grande". */
export function esTextoGrande(px: number, peso: number): boolean {
  return px >= 24 || (px >= 18.66 && peso >= 700);
}

export function umbralTexto(px: number, peso: number): number {
  return esTextoGrande(px, peso)
    ? CONTRATO.TEXTO_AA_GRANDE
    : CONTRATO.TEXTO_AA;
}

// ── Color: sRGB → luminancia relativa, Lab D65, CIEDE2000 ────────────────────
// Sin dependencias: la app no lleva ninguna librería de color y no se va a
// añadir una por una puerta de QA.

export type Rgb = readonly [number, number, number];

const canal = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** Luminancia relativa WCAG. */
export function luminancia([r, g, b]: Rgb): number {
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razón de contraste WCAG (simétrica). */
export function contraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composición alfa: `frente` con opacidad `alfa` sobre `fondo` opaco. */
export function componer(frente: Rgb, alfa: number, fondo: Rgb): Rgb {
  return [
    frente[0] * alfa + fondo[0] * (1 - alfa),
    frente[1] * alfa + fondo[1] * (1 - alfa),
    frente[2] * alfa + fondo[2] * (1 - alfa),
  ];
}

/** CIELAB D65. */
export function lab([r, g, b]: Rgb): [number, number, number] {
  const R = canal(r);
  const G = canal(g);
  const B = canal(b);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / 0.95047);
  const fy = f(Y);
  const fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Claridad CIELAB (L*). Es la métrica del anti-cruce. */
export function claridad(c: Rgb): number {
  return lab(c)[0];
}

/** CIEDE2000. La métrica de "¿se distingue del fondo?". */
export function deltaE00(c1: Rgb, c2: Rgb): number {
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G =
    0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);
  let hp1 = Math.atan2(b1, ap1) * deg;
  if (hp1 < 0) hp1 += 360;
  if (Cp1 === 0) hp1 = 0;
  let hp2 = Math.atan2(b2, ap2) * deg;
  if (hp2 < 0) hp2 += 360;
  if (Cp2 === 0) hp2 = 0;
  const dL = L2 - L1;
  const dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2;
  const Cpb = (Cp1 + Cp2) / 2;
  let hpb: number;
  if (Cp1 * Cp2 === 0) hpb = hp1 + hp2;
  else {
    hpb = Math.abs(hp1 - hp2) > 180 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2) / 2;
    if (hpb >= 360) hpb -= 360;
  }
  const T =
    1 -
    0.17 * Math.cos((hpb - 30) * rad) +
    0.24 * Math.cos(2 * hpb * rad) +
    0.32 * Math.cos((3 * hpb + 6) * rad) -
    0.2 * Math.cos((4 * hpb - 63) * rad);
  const dTh = 30 * Math.exp(-Math.pow((hpb - 275) / 25, 2));
  const Rc =
    2 * Math.sqrt(Math.pow(Cpb, 7) / (Math.pow(Cpb, 7) + Math.pow(25, 7)));
  const Sl =
    1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
  const Sc = 1 + 0.045 * Cpb;
  const Sh = 1 + 0.015 * Cpb * T;
  const Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt(
    Math.pow(dL / Sl, 2) +
      Math.pow(dC / Sc, 2) +
      Math.pow(dH / Sh, 2) +
      Rt * (dC / Sc) * (dH / Sh),
  );
}

/** #rgb / #rrggbb → [r,g,b]. Lanza si no es un hex sólido. */
export function hexARgb(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) {
    throw new Error(`hexARgb: "${hex}" no es un hex sólido de 3 o 6 dígitos`);
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ── Qué tokens juega cada papel ──────────────────────────────────────────────
// R3 se comprueba sobre estas listas. Si mañana nace un token de superficie hay
// que meterlo aquí: es el único mantenimiento que pide la puerta.

/** Tokens que se pintan COMO SUPERFICIE elevada sobre --background. */
export const SUPERFICIES = [
  "--card",
  "--popover",
  "--sidebar",
  "--muted",
  "--secondary",
  "--accent",
] as const;

/** Pares (texto, fondo) que el producto usa de verdad y deben cumplir AA. */
export const PARES_DE_TEXTO = [
  ["--foreground", "--background"],
  ["--card-foreground", "--card"],
  ["--popover-foreground", "--popover"],
  ["--muted-foreground", "--card"],
  ["--muted-foreground", "--background"],
  ["--secondary-foreground", "--secondary"],
  ["--accent-foreground", "--accent"],
  ["--primary-foreground", "--primary"],
  ["--corner-red-foreground", "--corner-red"],
  ["--corner-blue-foreground", "--corner-blue"],
  ["--win-foreground", "--win"],
  ["--loss-foreground", "--loss"],
  ["--brand-ink-foreground", "--brand-ink"],
  // --primary NO es solo una superficie: se usa como COLOR DE TEXTO en 147
  // sitios (`text-primary`). Estos dos pares son el freno que impide "arreglar"
  // el botón oscuro oscureciendo el rojo: al bajarlo, estos se caen.
  ["--primary", "--background"],
  ["--primary", "--card"],
] as const;
