export function formatRecord(wins: number, losses: number, draws: number) {
  return `${wins}-${losses}-${draws}`;
}

export function formatHeight(heightCm: number | null) {
  if (!heightCm) {
    return "—";
  }

  const totalInches = heightCm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);

  return `${feet}'${inches}"`;
}

export function formatReach(reachCm: number | null) {
  if (!reachCm) {
    return "—";
  }

  return `${Math.round(reachCm / 2.54)} in`;
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