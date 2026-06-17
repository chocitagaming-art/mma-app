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

export function formatDate(date: string | null) {
  if (!date) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}