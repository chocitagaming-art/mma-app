import type Anthropic from "@anthropic-ai/sdk";

// Slugs de división válidos (de queries/rankings.ts) — el enum evita que el modelo invente divisiones.
export const DIVISION_SLUGS = [
  "mens_pound_for_pound",
  "flyweight",
  "bantamweight",
  "featherweight",
  "lightweight",
  "welterweight",
  "middleweight",
  "light_heavyweight",
  "heavyweight",
  "womens_pound_for_pound",
  "womens_strawweight",
  "womens_flyweight",
  "womens_bantamweight",
  "womens_featherweight",
] as const;

// Etiqueta amistosa en español para el indicador de la UI.
export const TOOL_LABELS: Record<string, string> = {
  buscar_luchador: "Buscó al luchador",
  ficha_y_stats: "Consultó ficha y stats",
  historial_peleas: "Revisó el historial",
  evento: "Buscó el evento",
  ranking: "Consultó el ranking",
  comparar: "Comparó luchadores",
  noticias: "Buscó noticias",
  trayectoria_ranking: "Revisó la trayectoria de ranking",
};

export const MAESTRO_SYSTEM_PROMPT = `Eres "el Maestro", un experto en MMA y UFC dentro de la web MMA STATUS. Hablas SIEMPRE en español, con tono cercano y apasionado pero preciso, como un analista de cartelera.

Tienes HERRAMIENTAS que consultan la base de datos REAL del proyecto (luchadores, récords, estadísticas, rankings, eventos, peleas y noticias). Úsalas para cualquier dato concreto y verificable:
- Cuando el usuario nombre a un luchador, llama primero a "buscar_luchador" para obtener su id; luego usa "ficha_y_stats", "historial_peleas", "trayectoria_ranking" o "comparar" con ese id.
- Para preguntas sobre el ascenso/caída de un luchador en el ranking, cuándo fue campeón o su evolución por divisiones, usa "trayectoria_ranking" con su id.
- Para rankings, mapea el nombre de la división en español al slug correcto (p.ej. "peso ligero" -> "lightweight", "peso wélter" -> "welterweight", "libra por libra" -> "mens_pound_for_pound"; femenino -> "womens_*").
- Para eventos (p.ej. "UFC 300") usa "evento". Para noticias recientes usa "noticias".

REGLAS:
- NUNCA inventes récords, estadísticas, fechas ni resultados. Si necesitas un dato exacto, obténlo con una herramienta. Si una herramienta no devuelve nada, dilo con honestidad.
- En tus análisis o comentarios cita ÚNICAMENTE cifras que aparezcan literalmente en los datos devueltos por las herramientas (récords, porcentajes, totales). No estimes, no redondees al alza ni inventes porcentajes que no estén en los datos. Si una stat no está disponible, no la menciones con un número.
- Para historia, curiosidades, estilos de pelea, reglas o contexto general, puedes usar tu propio conocimiento de MMA, pero deja claro cuándo es conocimiento general y no un dato sacado de la base de datos.
- En el historial, "winner_id" nulo significa empate o resultado no registrado; NO afirmes que fue "no contest" salvo que el método lo diga.
- Responde en markdown, conciso y bien estructurado (usa **negritas**, listas y, si procede, enlaces). No muestres ids internos al usuario salvo que ayuden.
- Si la pregunta es ambigua (varios luchadores con nombre parecido), pide que aclare o presenta las opciones que devolvió la búsqueda.`;

export const MAESTRO_TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_luchador",
    description:
      "Busca luchadores por nombre (o parte) y devuelve sus ids, récord y nacionalidad. Úsalo SIEMPRE primero cuando el usuario menciona a un luchador, para obtener su id.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre o parte del nombre del luchador" },
      },
      required: ["nombre"],
    },
  },
  {
    name: "ficha_y_stats",
    description:
      "Ficha completa de un luchador por id: récord, físico (altura, alcance, peso, guardia, nacionalidad) y estadísticas de carrera agregadas (golpes significativos, derribos, intentos de sumisión, tiempo de control, knockdowns).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "ID del luchador (de buscar_luchador)" },
      },
      required: ["id"],
    },
  },
  {
    name: "historial_peleas",
    description:
      "Historial de peleas de un luchador por id: oponente, resultado (victoria/derrota/empate), método, ronda, evento y fecha. Ordenado de la más reciente a la más antigua.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "ID del luchador" },
        limit: { type: "integer", description: "Máximo de peleas a devolver (por defecto 15, máximo 25)" },
      },
      required: ["id"],
    },
  },
  {
    name: "evento",
    description:
      "Busca un evento por nombre (p.ej. 'UFC 300') o por fecha (YYYY-MM-DD) y devuelve sus datos y la cartelera de combates.",
    input_schema: {
      type: "object",
      properties: {
        nombre_o_fecha: {
          type: "string",
          description: "Nombre del evento o fecha en formato YYYY-MM-DD",
        },
      },
      required: ["nombre_o_fecha"],
    },
  },
  {
    name: "ranking",
    description:
      "Ranking oficial actual de una división (campeón + contendientes) del último snapshot. Mapea la división en español al slug correcto.",
    input_schema: {
      type: "object",
      properties: {
        division: {
          type: "string",
          description: "Slug de la división",
          enum: [...DIVISION_SLUGS],
        },
      },
      required: ["division"],
    },
  },
  {
    name: "trayectoria_ranking",
    description:
      "Evolución histórica del ranking de un luchador por id: para cada división en la que ha estado clasificado, la lista de posiciones (o 'Campeón') por fecha de snapshot, en orden cronológico. Útil para describir su ascenso, caída o cuándo fue campeón.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "ID del luchador (de buscar_luchador)" },
      },
      required: ["id"],
    },
  },
  {
    name: "comparar",
    description:
      "Compara dos luchadores por id: récords, físico, promedios por pelea y su historial directo (si se han enfrentado).",
    input_schema: {
      type: "object",
      properties: {
        a: { type: "integer", description: "ID del luchador A" },
        b: { type: "integer", description: "ID del luchador B" },
      },
      required: ["a", "b"],
    },
  },
  {
    name: "noticias",
    description:
      "Noticias recientes de MMA, opcionalmente filtradas por un tema, categoría o nombre de luchador.",
    input_schema: {
      type: "object",
      properties: {
        tema: {
          type: "string",
          description: "Tema, categoría o nombre de luchador (opcional)",
        },
      },
      required: [],
    },
  },
];
