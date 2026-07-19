import type { MetadataRoute } from "next";

// Manifest PWA (convención de Next: se sirve en /manifest.webmanifest y el <link>
// se inyecta solo). Sin service worker a propósito: Chrome/Edge modernos instalan
// con manifest válido + HTTPS + iconos 192/512; iOS usa apple-icon.png y el
// metadata.appleWebApp del layout. No leer headers()/cookies() aquí: la ruta
// queda estática y cacheada.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MMA STATUS",
    short_name: "MMA STATUS",
    description:
      "Perfiles de peleadores de MMA, carteleras, resultados en directo y predicciones con IA.",
    start_url: "/",
    display: "standalone",
    lang: "es",
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
