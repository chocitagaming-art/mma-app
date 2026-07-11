// Dónde ver UFC en España (S2-F). Config ESTÁTICA es-ES: en España los
// derechos 2026 no varían por evento (HBO Max emite todas las veladas con el
// Complemento Deportes; Eurosport 2 una selección en TV de pago; UFC Fight
// Pass los early prelims + biblioteca; el canal oficial de YouTube emite en
// abierto los early prelims de algunos eventos y los resúmenes), así que no
// hace falta dato por evento en BD — la única regla por evento es mostrar la
// opción de early prelims solo cuando el evento los tiene programados.
// Investigado el 11-jul-2026 (Eurosport, La Jaula MMA, MMA Magazine, HBO Max).
// Solo fuentes oficiales/legales.

export type WatchOption = {
  label: string;
  detail: string;
  url: string;
  kind: "free" | "paid";
};

export function buildWatchOptions({
  hasEarlyPrelims,
}: {
  hasEarlyPrelims: boolean;
}): WatchOption[] {
  const options: WatchOption[] = [
    {
      label: "YouTube de UFC",
      detail: hasEarlyPrelims
        ? "Early prelims en abierto (según el evento) y resúmenes oficiales."
        : "Resúmenes y mejores momentos oficiales tras el evento.",
      url: "https://www.youtube.com/@UFC",
      kind: "free",
    },
    {
      label: "HBO Max",
      detail: "Todas las veladas de UFC en directo con el Complemento Deportes; también bajo demanda al terminar.",
      url: "https://www.hbomax.com/es/es/sports/ufc",
      kind: "paid",
    },
    {
      label: "Eurosport 2",
      detail: "Una selección de veladas al año en TV de pago (Movistar+, Orange y otros operadores).",
      url: "https://www.eurosport.es/mma/ufc/",
      kind: "paid",
    },
    {
      label: "UFC Fight Pass",
      detail: "Early prelims en directo y la biblioteca completa de combates de UFC.",
      url: "https://ufcfightpass.com/",
      kind: "paid",
    },
  ];
  return options;
}
