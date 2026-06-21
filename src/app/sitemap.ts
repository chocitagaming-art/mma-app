import type { MetadataRoute } from "next";

import { sql } from "@/lib/db";

const SITE = "https://mma-app-ruby.vercel.app";

// Páginas estáticas + un nodo por cada perfil de luchador y cada evento (leídos en vivo
// de Neon). Si la BD no responde, degradamos a solo las rutas estáticas para que
// /sitemap.xml nunca rompa.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/fighters`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/eventos`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/clasificacion`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/news`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/enfrentamiento`, changeFrequency: "monthly", priority: 0.6 },
  ];

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
