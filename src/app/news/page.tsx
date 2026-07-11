import { permanentRedirect } from "next/navigation";

type NewsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// T3-B: /news se fusionó en /tendencias (decisión del dueño: sustituir el
// chip Noticias, como ufc.com/trending). Redirección permanente conservando
// el filtro de categoría (?category=X → pestaña Noticias con esa categoría);
// la paginación por páginas se traduce al ?mostrar acumulativo del feed.
export default async function NewsPage({ searchParams }: NewsPageProps) {
  const params = await searchParams;
  const redirectParams = new URLSearchParams();

  const category = getSingleValue(params.category);
  const page = Number.parseInt(getSingleValue(params.page), 10);

  redirectParams.set("tipo", "noticias");
  if (category) {
    redirectParams.set("categoria", category);
  }
  if (Number.isFinite(page) && page > 1) {
    redirectParams.set("mostrar", String(page * 12));
  }

  permanentRedirect(`/tendencias?${redirectParams.toString()}`);
}
