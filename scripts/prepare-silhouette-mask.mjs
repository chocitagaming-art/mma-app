// Convierte una silueta (SVG o PNG; negra-sobre-blanco o con alpha) en una
// máscara PNG transparente recortada, y mide los cortes anatómicos (cuello y
// entrepierna) para derivar los % de las bandas cabeza/torso/piernas.
// Uso: node prepare-mask.mjs <input> <output.png>
import sharp from "sharp";

const [, , input, output] = process.argv;
const TARGET_H = 1000;

// 1) Rasterizar/normalizar a RGBA con altura fija
let img = sharp(input, { density: 300 }).resize({ height: TARGET_H }).ensureAlpha();
let { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

// 2) Alpha de la silueta: si el original ya tiene alpha útil, usarlo;
//    si es opaco (negro sobre blanco), alpha = 255 - luminancia.
let hasRealAlpha = false;
for (let i = 3; i < data.length; i += 4) {
  if (data[i] < 250) { hasRealAlpha = true; break; }
}
const alpha = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) {
  const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2], a = data[p * 4 + 3];
  if (hasRealAlpha) {
    alpha[p] = a;
  } else {
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    alpha[p] = Math.max(0, Math.min(255, Math.round(255 - lum)));
  }
}

// 3) Bounding box del contenido (alpha > 20)
let minX = W, maxX = -1, minY = H, maxY = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (alpha[y * W + x] > 20) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) { console.error("VACIO: no hay silueta"); process.exit(1); }
const bw = maxX - minX + 1, bh = maxY - minY + 1;

// 4) Perfil de anchura por fila (dentro del bbox) para detectar cortes
const widths = [];
const centerAlpha = [];
const cx = Math.round((minX + maxX) / 2);
for (let y = minY; y <= maxY; y++) {
  let count = 0;
  for (let x = minX; x <= maxX; x++) if (alpha[y * W + x] > 20) count++;
  widths.push(count);
  centerAlpha.push(alpha[y * W + cx]);
}
// Cuello: mínimo local de anchura entre 8% y 22% de la altura
let neckY = -1, neckW = Infinity;
for (let i = Math.round(bh * 0.08); i < Math.round(bh * 0.22); i++) {
  if (widths[i] < neckW) { neckW = widths[i]; neckY = i; }
}
// Entrepierna: primera fila desde 40% hacia abajo donde el centro queda vacío
let crotchY = -1;
for (let i = Math.round(bh * 0.40); i < Math.round(bh * 0.75); i++) {
  if (centerAlpha[i] <= 20) { crotchY = i; break; }
}
// Muñecas/manos: fila de máxima anchura (referencia de brazos)
let maxWY = 0;
for (let i = 0; i < bh; i++) if (widths[i] > widths[maxWY]) maxWY = i;

// 5) Exportar PNG recortado: silueta negra pura + alpha limpio
const out = Buffer.alloc(bw * bh * 4);
for (let y = 0; y < bh; y++) {
  for (let x = 0; x < bw; x++) {
    const a = alpha[(y + minY) * W + (x + minX)];
    const o = (y * bw + x) * 4;
    out[o] = 0; out[o + 1] = 0; out[o + 2] = 0;
    out[o + 3] = a > 20 ? a : 0;
  }
}
await sharp(out, { raw: { width: bw, height: bh, channels: 4 } }).png().toFile(output);

console.log(JSON.stringify({
  output, width: bw, height: bh, ratio: (bw / bh).toFixed(3),
  hadAlpha: hasRealAlpha,
  neckPct: neckY >= 0 ? +(neckY / bh * 100).toFixed(1) : null,
  crotchPct: crotchY >= 0 ? +(crotchY / bh * 100).toFixed(1) : null,
  widestRowPct: +(maxWY / bh * 100).toFixed(1),
}, null, 2));
