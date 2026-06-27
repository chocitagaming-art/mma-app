import { formatPercentage } from "@/lib/format";

// Production-equivalent accuracy of the retrained model (0.629). Single source
// of truth so the pre/post-prediction copy never drifts.
export const MODEL_ACCURACY_LABEL = "~63%";

export type TaleRow = {
  label: string;
  red: string;
  blue: string;
  redNum?: number | null;
  blueNum?: number | null;
};

export function formatAverage(value: number) {
  return value.toFixed(1);
}

export function humanizeFeatureName(name: string) {
  return name
    .replace(/_diff$/u, "")
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

// Spanish labels for the model's feature names (the model uses red-blue diffs;
// feature.name carries the _diff suffix). Falls back to humanize for new keys.
export const FEATURE_LABELS_ES: Record<string, string> = {
  height_cm: "Altura",
  reach_cm: "Alcance",
  age: "Edad",
  sig_strikes_landed_per_fight: "Golpes significativos por pelea",
  sig_strike_accuracy: "Precisión de golpeo",
  knockdowns_per_fight: "Knockdowns por pelea",
  takedowns_landed_per_fight: "Derribos por pelea",
  takedown_accuracy: "Precisión de derribo",
  control_time_seconds_per_fight: "Tiempo de control por pelea",
  wins_last_5: "Victorias en las últimas 5",
  total_prior_fights: "Experiencia (peleas previas)",
  total_rounds_fought: "Asaltos disputados",
  pct_wins_by_ko: "Victorias por KO (%)",
  days_since_last_fight: "Días desde la última pelea",
  ranking_position: "Posición en el ranking",
  sig_strikes_absorbed_per_fight: "Golpes recibidos por pelea",
  sig_strike_defense: "Defensa de golpeo",
  takedowns_absorbed_per_fight: "Derribos recibidos por pelea",
  takedown_defense: "Defensa de derribo",
  avg_opponent_prior_win_rate: "Calidad del rival",
};

export function featureLabel(name: string) {
  const key = name.replace(/_diff$/u, "");
  return FEATURE_LABELS_ES[key] ?? humanizeFeatureName(name);
}

export function formatFeatureValue(value: number | null) {
  if (value === null) {
    return "N/D";
  }
  return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
}

export function formatSignalPercent(value: number | null) {
  return value === null ? "N/D" : formatPercentage(value);
}
