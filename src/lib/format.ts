export function formatRecord(wins: number, losses: number, draws: number) {
  return `${wins}-${losses}-${draws}`;
}

export function formatHeight(heightCm: number | null) {
  if (!heightCm) {
    return "—";
  }

  return `${Math.round(heightCm)} cm`;
}

export function formatReach(reachCm: number | null) {
  if (!reachCm) {
    return "—";
  }

  return `${Math.round(reachCm)} cm`;
}

export function formatWeight(weightGrams: number | null) {
  if (!weightGrams) {
    return "—";
  }

  return `${(weightGrams / 1000).toFixed(1)} kg`;
}

export function formatPercentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatControlTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

const WEIGHT_CLASS_ES: Record<string, string> = {
  strawweight: "Peso Paja",
  flyweight: "Peso Mosca",
  bantamweight: "Peso Gallo",
  featherweight: "Peso Pluma",
  lightweight: "Peso Ligero",
  welterweight: "Peso Wélter",
  middleweight: "Peso Medio",
  "light heavyweight": "Peso Semipesado",
  heavyweight: "Peso Pesado",
  "women's strawweight": "Peso Paja (F)",
  "women's flyweight": "Peso Mosca (F)",
  "women's bantamweight": "Peso Gallo (F)",
  "women's featherweight": "Peso Pluma (F)",
  catchweight: "Peso Pactado",
  "open weight": "Sin límite",
  openweight: "Sin límite",
};

// Translate UFC weight-class names to Spanish. Falls back to the most specific
// partial match (e.g. "Flyweight Title Bout") and finally to the original text.
export function formatWeightClass(weightClass: string | null): string {
  if (!weightClass) {
    return "—";
  }

  const key = weightClass.trim().toLowerCase();
  if (WEIGHT_CLASS_ES[key]) {
    return WEIGHT_CLASS_ES[key];
  }

  const byLength = Object.entries(WEIGHT_CLASS_ES).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [english, spanish] of byLength) {
    if (key.includes(english)) {
      return spanish;
    }
  }

  return weightClass;
}

// Fighter stance (guardia) → Spanish label. Falls back to the raw value.
const STANCE_ES: Record<string, string> = {
  orthodox: "Ortodoxa",
  southpaw: "Zurda",
  switch: "Cambiante",
  "open stance": "Abierta",
  sideways: "Lateral",
};

export function formatStance(stance: string | null | undefined): string {
  if (!stance) {
    return "—";
  }

  const key = stance.trim().toLowerCase();
  return STANCE_ES[key] ?? stance;
}

// Ranking division slugs (snake_case, written by the backend) → Spanish labels.
// Mirrors DIVISION_ORDER in queries/rankings.ts; kept here for display reuse.
const DIVISION_ES: Record<string, string> = {
  mens_pound_for_pound: "Libra por libra",
  flyweight: "Peso Mosca",
  bantamweight: "Peso Gallo",
  featherweight: "Peso Pluma",
  lightweight: "Peso Ligero",
  welterweight: "Peso Wélter",
  middleweight: "Peso Medio",
  light_heavyweight: "Peso Semipesado",
  heavyweight: "Peso Pesado",
  womens_pound_for_pound: "Libra por libra (F)",
  womens_strawweight: "Peso Paja (F)",
  womens_flyweight: "Peso Mosca (F)",
  womens_bantamweight: "Peso Gallo (F)",
  womens_featherweight: "Peso Pluma (F)",
};

// Translate a ranking division slug to its Spanish label, falling back to the raw slug.
export function formatDivision(division: string | null): string {
  if (!division) {
    return "—";
  }

  return DIVISION_ES[division] ?? division;
}

// Clean, common method strings mapped directly to their Spanish label.
const METHOD_ES: Record<string, string> = {
  "ko/tko": "KO/TKO",
  ko: "KO/TKO",
  tko: "KO/TKO",
  knockout: "KO/TKO",
  submission: "Sumisión",
  sub: "Sumisión",
  decision: "Decisión",
  "decision - unanimous": "Decisión unánime",
  "decision - split": "Decisión dividida",
  "decision - majority": "Decisión mayoritaria",
  "unanimous decision": "Decisión unánime",
  "split decision": "Decisión dividida",
  "majority decision": "Decisión mayoritaria",
  dq: "Descalificación",
  disqualification: "Descalificación",
  "could not continue": "No pudo continuar",
  overturned: "Resultado anulado",
  "no contest": "Sin resultado",
  draw: "Empate",
  other: "Otro",
};

// Translate a UFC victory-method string to Spanish. The raw `method` column is
// free-form (e.g. "Decision - Unanimous", "Submission (Rear-Naked Choke)",
// "KO/TKO", "DQ"), so after an exact-match lookup we match on keywords the same
// way the win-method aggregation does, and finally fall back to the raw value.
export function formatMethod(method: string | null): string {
  if (!method) {
    return "—";
  }

  const key = method.trim().toLowerCase();
  if (METHOD_ES[key]) {
    return METHOD_ES[key];
  }

  if (/\bdecision\b/u.test(key)) {
    if (/unanim/u.test(key)) {
      return "Decisión unánime";
    }
    if (/split/u.test(key)) {
      return "Decisión dividida";
    }
    if (/major/u.test(key)) {
      return "Decisión mayoritaria";
    }
    return "Decisión";
  }

  if (/\b(?:ko|tko)\b|knockout/u.test(key)) {
    return "KO/TKO";
  }

  if (
    /submission|choke|armbar|kimura|guillotine|triangle|americana|rear|naked|crank|\block\b/u.test(
      key,
    )
  ) {
    return "Sumisión";
  }

  if (/\bdq\b|disqualif/u.test(key)) {
    return "Descalificación";
  }

  if (/could not continue/u.test(key)) {
    return "No pudo continuar";
  }

  if (/overturn/u.test(key)) {
    return "Resultado anulado";
  }

  return method;
}

export function formatDate(date: string | null) {
  if (!date) {
    return "Por definir";
  }

  return new Intl.DateTimeFormat("es", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

// News category slugs (written by the backend classifier, see news.py CATEGORIES)
// → Spanish labels. 'other' maps to "General" to match the null fallback below.
const NEWS_CATEGORY_ES: Record<string, string> = {
  fight_announcement: "Anuncio de pelea",
  fight_result: "Resultado de pelea",
  injury: "Lesión",
  ranking_change: "Cambio de ranking",
  transfer: "Fichaje",
  interview: "Entrevista",
  other: "General",
};

// Translate a news category slug to its Spanish label. Falls back to "General"
// for missing values and title-cases any unexpected slug instead of leaking
// raw snake_case to the UI.
export function formatNewsCategory(category: string | null): string {
  if (!category) {
    return "General";
  }

  const key = category.trim().toLowerCase();
  if (NEWS_CATEGORY_ES[key]) {
    return NEWS_CATEGORY_ES[key];
  }

  const spaced = category.trim().replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// The nationality column from ESPN is messy and sometimes holds the literal
// string "Unknown" (or blanks) instead of NULL. Normalize those sentinels to
// null so callers can apply their own Spanish fallback (e.g. "Desconocida").
export function cleanNationality(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return null;
  }

  return trimmed;
}

// Format an ISO date ("2026-06-25" or a full ISO datetime) as a long Spanish
// date like "25 de junio de 2026". Parsed as UTC to avoid timezone drift;
// returns the raw value if it cannot be parsed.
export function formatModelDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}