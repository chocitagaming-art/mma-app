// T3-A fase B: stats EN VIVO por pelea (tabla live_fight_stats, migración 017
// de mma-ingesta). El bucle de ventana de evento escribe, esta web solo LEE.
//
// Contrato con el escritor (espn_live_stats.py, verificado con muestras
// reales de UFC 329): stats = JSONB {"<fighter_id>": {claves compactas}} con
//   kd knockdowns · tsl/tsa golpes totales con./int. · ssl/ssa significativos
//   hl/ha cabeza · bl/ba cuerpo · ll/la piernas (sig., sumadas por objetivo)
//   tdl/tda derribos · sub intentos de sumisión · ctrl control en SEGUNDOS
// state: 'in' (en curso, se re-escribe cada ~2 min) | 'post' (total final
// provisional). status_name/status_detail: estado fino crudo de ESPN
// (STATUS_FIGHTERS_WALKING/'Walkouts', STATUS_END_OF_ROUND/'End R2'...).
//
// Mapeo DEFENSIVO estilo mapFighterFacts: un JSONB corrupto degrada a "sin
// stats" y jamás rompe /en-vivo (lección del error boundary de la fase A).

export type LiveStatValues = {
  kd: number | null;
  tsl: number | null;
  tsa: number | null;
  ssl: number | null;
  ssa: number | null;
  hl: number | null;
  ha: number | null;
  bl: number | null;
  ba: number | null;
  ll: number | null;
  la: number | null;
  tdl: number | null;
  tda: number | null;
  sub: number | null;
  ctrl: number | null;
};

export type LiveFightStats = {
  fightId: number;
  state: "in" | "post";
  statusName: string | null;
  statusDetail: string | null;
  period: number | null;
  displayClock: string | null;
  updatedAt: string | null;
  byFighter: Record<string, LiveStatValues>;
};

const STAT_KEYS: (keyof LiveStatValues)[] = [
  "kd", "tsl", "tsa", "ssl", "ssa", "hl", "ha", "bl", "ba", "ll", "la",
  "tdl", "tda", "sub", "ctrl",
];

function toCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

// {"kd": 1, "tsl": 23, ...} -> LiveStatValues; null si no hay NINGÚN número
// usable (un lado corrupto no borra al otro).
export function mapLiveStatValues(value: unknown): LiveStatValues | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const mapped = Object.fromEntries(
    STAT_KEYS.map((key) => [key, toCount(raw[key])]),
  ) as LiveStatValues;
  return STAT_KEYS.some((key) => mapped[key] != null) ? mapped : null;
}

// El JSONB completo {"6320": {...}, "9024": {...}} -> byFighter saneado.
export function mapLiveStatsByFighter(
  value: unknown,
): Record<string, LiveStatValues> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const byFighter: Record<string, LiveStatValues> = {};
  for (const [fighterId, side] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(fighterId)) {
      continue;
    }
    const values = mapLiveStatValues(side);
    if (values) {
      byFighter[fighterId] = values;
    }
  }
  return byFighter;
}

// Fila cruda de la query -> LiveFightStats; null si la fila no es usable.
export function mapLiveFightStatsRow(row: {
  fight_id: unknown;
  state: unknown;
  status_name: unknown;
  status_detail: unknown;
  period: unknown;
  display_clock: unknown;
  stats: unknown;
  updated_at: unknown;
}): LiveFightStats | null {
  const fightId = typeof row.fight_id === "number" ? row.fight_id : Number(row.fight_id);
  if (!Number.isFinite(fightId)) {
    return null;
  }
  const state = row.state === "post" ? "post" : row.state === "in" ? "in" : null;
  if (!state) {
    return null;
  }
  return {
    fightId,
    state,
    statusName: typeof row.status_name === "string" ? row.status_name : null,
    statusDetail: typeof row.status_detail === "string" ? row.status_detail : null,
    period: toCount(row.period),
    displayClock:
      typeof row.display_clock === "string" && row.display_clock.trim()
        ? row.display_clock
        : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    byFighter: mapLiveStatsByFighter(row.stats),
  };
}

// Marcadores de estado ESPN para peleas canceladas/aplazadas (mismo criterio
// que el escritor is_cancelled_status). El escritor ya borra esas filas, pero
// como defensa una fila cancelada que se colara NO debe leerse como "Final".
const CANCELLED_STATUS_MARKERS = ["CANCEL", "POSTPON", "FORFEIT", "ABANDON", "SUSPEND"];

export function isCancelledLiveStatus(statusName: string | null): boolean {
  if (!statusName) {
    return false;
  }
  const upper = statusName.toUpperCase();
  return CANCELLED_STATUS_MARKERS.some((marker) => upper.includes(marker));
}

// Estado fino en español para la cabecera del panel. Los nombres conocidos se
// traducen; lo desconocido degrada al detail crudo de ESPN ("End R2") antes
// que inventar. El reloj de ESPN solo se muestra si parece un reloj.
export function liveStatusLabel(stats: LiveFightStats): string | null {
  const clock =
    stats.displayClock && /\d:\d\d$/.test(stats.displayClock)
      ? stats.displayClock
      : null;
  const name = stats.statusName ?? "";

  if (isCancelledLiveStatus(name)) {
    return "Cancelada";
  }
  if (stats.state === "post" || name === "STATUS_FINAL") {
    return "Final";
  }
  if (name === "STATUS_PRE_FIGHT") {
    // Observado en vivo (UFC 329): ESPN marca 'in' con "Pre-fight" unos
    // minutos antes de los walkouts.
    return "A punto de empezar";
  }
  if (name === "STATUS_FIGHTERS_WALKING") {
    return "Salida al octágono";
  }
  if (name === "STATUS_END_OF_ROUND") {
    return stats.period
      ? `Descanso · fin del asalto ${stats.period}`
      : "Descanso entre asaltos";
  }
  if (name.startsWith("STATUS_IN_PROGRESS")) {
    const round = stats.period ? `Asalto ${stats.period}` : "En curso";
    return clock ? `${round} · ${clock}` : round;
  }
  return stats.statusDetail;
}

// Segundos de control -> "1:01" (formato del panel de ESPN). null -> "—".
export function formatControlTime(seconds: number | null): string {
  if (seconds == null || seconds < 0) {
    return "—";
  }
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

// "con./int." al estilo ESPN: 23/52. Sin conectados no hay dato; sin
// intentados se muestra solo el conectado.
export function formatLandedPair(
  landed: number | null,
  attempted: number | null,
): string {
  if (landed == null) {
    return "—";
  }
  return attempted != null ? `${landed}/${attempted}` : String(landed);
}

// Filas del panel comparativo (rojo | etiqueta | azul), en el orden del panel
// de ESPN. `num` alimenta el coloreado "mejor" (más conectado/control gana).
export type LiveStatRow = {
  label: string;
  red: string;
  blue: string;
  redNum: number | null;
  blueNum: number | null;
};

export function buildLiveStatRows(
  red: LiveStatValues | null,
  blue: LiveStatValues | null,
): LiveStatRow[] {
  const defs: {
    label: string;
    value: (side: LiveStatValues | null) => string;
    num: (side: LiveStatValues | null) => number | null;
  }[] = [
    {
      label: "KD",
      value: (s) => (s?.kd != null ? String(s.kd) : "—"),
      num: (s) => s?.kd ?? null,
    },
    {
      label: "Golpes totales",
      value: (s) => formatLandedPair(s?.tsl ?? null, s?.tsa ?? null),
      num: (s) => s?.tsl ?? null,
    },
    {
      label: "Golpes sig.",
      value: (s) => formatLandedPair(s?.ssl ?? null, s?.ssa ?? null),
      num: (s) => s?.ssl ?? null,
    },
    {
      label: "Cabeza",
      value: (s) => formatLandedPair(s?.hl ?? null, s?.ha ?? null),
      num: (s) => s?.hl ?? null,
    },
    {
      label: "Cuerpo",
      value: (s) => formatLandedPair(s?.bl ?? null, s?.ba ?? null),
      num: (s) => s?.bl ?? null,
    },
    {
      label: "Piernas",
      value: (s) => formatLandedPair(s?.ll ?? null, s?.la ?? null),
      num: (s) => s?.ll ?? null,
    },
    {
      label: "Derribos",
      value: (s) => formatLandedPair(s?.tdl ?? null, s?.tda ?? null),
      num: (s) => s?.tdl ?? null,
    },
    {
      label: "Int. sumisión",
      value: (s) => (s?.sub != null ? String(s.sub) : "—"),
      num: (s) => s?.sub ?? null,
    },
    {
      label: "Control",
      value: (s) => formatControlTime(s?.ctrl ?? null),
      num: (s) => s?.ctrl ?? null,
    },
  ];

  return defs
    .map((def) => ({
      label: def.label,
      red: def.value(red),
      blue: def.value(blue),
      redNum: def.num(red),
      blueNum: def.num(blue),
    }))
    // Una fila sin dato en NINGUNA esquina no aporta: fuera (p.ej. walkouts
    // recién empezados solo traen ceros, que sí se muestran).
    .filter((row) => row.redNum != null || row.blueNum != null);
}
