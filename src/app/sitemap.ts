import type { MetadataRoute } from "next";

import { sql } from "@/lib/db";
import { SITE_URL as SITE } from "@/lib/site-url";

// Páginas estáticas + un nodo por cada perfil de luchador y cada evento (leídos en vivo
// de Neon). Si la BD no responde, degradamos a solo las rutas estáticas para que
// /sitemap.xml nunca rompa.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/fighters`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/eventos`, changeFrequency: "daily", priority: 0.8 },
    // Su respuesta cambia cada día, así que lleva lastModified: sin él, Google
    // la rastrea a su ritmo, que es lo contrario de lo que necesita una página
    // que se llama "hoy".
    {
      url: `${SITE}/ufc-hoy`,
      changeFrequency: "daily",
      priority: 0.8,
      lastModified: new Date(),
    },
    { url: `${SITE}/en-vivo`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/clasificacion`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/tendencias`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/enfrentamiento`, changeFrequency: "monthly", priority: 0.6 },
    // Estaban construidas y sin una sola entrada de sitemap: Google no tenía
    // por dónde llegar. Son las MISMAS que le faltaban al pie de página, por
    // eso las dos cosas se arreglaron a la vez (ver `site-footer.tsx`).
    { url: `${SITE}/videos`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/gimnasios`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/salon-de-la-fama`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/maestro`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/creditos`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/contacto`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE}/aviso-legal`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/privacidad`, changeFrequency: "yearly", priority: 0.3 },
  ];
  // ⚠️ NO AÑADIR AQUÍ, y cada exclusión tiene su motivo:
  //  · `/estado` — está oculto a propósito; meterlo en el sitemap sería
  //    exactamente el cartel que evita no ponerlo en robots.txt.
  //  · `/offline` — la sirve el service worker cuando no hay red; indexarla
  //    pondría "sin conexión" en los resultados de búsqueda.
  //  · `/compare` y `/predict` — son `permanentRedirect` a `/enfrentamiento`.
  //  · `/fights/[id]` — serían +8.800 URLs sobre una web que sirve todo con
  //    `no-store`. Decisión del 28-jul, sprint propio si algún día se hace.

  try {
    const [fighters, events] = await Promise.all([
      sql<{ id: number }>("SELECT id FROM fighters ORDER BY id"),
      sql<{ id: number }>("SELECT id FROM events ORDER BY id"),
    ]);

    const fighterRoutes: MetadataRoute.Sitemap = fighters.map((row) => ({
      url: `${SITE}/fighters/${row.id}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
    const eventRoutes: MetadataRoute.Sitemap = events.map((row) => ({
      url: `${SITE}/eventos/${row.id}`,
      changeFrequency: "weekly",
      priority: 0.5,
    }));

    return [...staticRoutes, ...fighterRoutes, ...eventRoutes];
  } catch {
    return staticRoutes;
  }
}
