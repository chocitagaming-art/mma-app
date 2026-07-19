// Genera los iconos PWA de public/icons/ a partir de src/app/icon.png (512x512).
// - icon-{192,512}.png: el logo tal cual (purpose "any", fondo transparente).
// - icon-maskable-{192,512}.png: lienzo sólido oscuro con el logo al ~66% centrado,
//   dentro de la zona segura maskable (círculo de radio 40%): Android recorta el
//   lienzo a la forma del launcher sin cortar el logo.
// Uso: node scripts/generate-pwa-icons.mjs
import sharp from "sharp";

const SRC = "src/app/icon.png";
const OUT_DIR = "public/icons";
const CANVAS_BG = { r: 11, g: 11, b: 13, alpha: 1 }; // #0b0b0d (fondo dark de la marca)

await sharp(SRC).resize(192).png({ compressionLevel: 9, palette: true }).toFile(`${OUT_DIR}/icon-192.png`);
await sharp(SRC).resize(512).png({ compressionLevel: 9, palette: true }).toFile(`${OUT_DIR}/icon-512.png`);

for (const size of [192, 512]) {
  const logo = await sharp(SRC).resize(Math.round(size * 0.66)).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: CANVAS_BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(`${OUT_DIR}/icon-maskable-${size}.png`);
}

console.log("Iconos PWA generados en", OUT_DIR);
