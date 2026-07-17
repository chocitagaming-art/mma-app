import type { FighterListResult } from "@/lib/types";

export type CountRow = {
  fighters: string;
  events: string;
  fights: string;
  fight_stats: string;
};

export type FighterRow = {
  id: number;
  name: string;
  nickname: string | null;
  headshot_url: string | null;
  nationality: string | null;
  birth_date: string | null;
  height_cm: string | null;
  reach_cm: string | null;
  stance: string | null;
  weight_grams: number | null;
  wins: number;
  losses: number;
  draws: number;
  updated_at: string | null;
  // Fase 3 (ficha estilo ufc.com). Opcionales: llegan vía `select f.*`, pero
  // las queries que enumeran columnas explícitas pueden no incluirlos.
  full_body_url?: string | null;
  standing_body_url?: string | null; // foto de pie (Ronda B), backfill en curso
  // F1 (migración 019): variantes direccionales para el cara a cara.
  standing_body_url_l?: string | null;
  standing_body_url_r?: string | null;
  leg_reach_cm?: string | null; // NUMERIC llega como string desde pg
  trains_at?: string | null;
  // FE9: procedencia del registro (scraper) para enlaces externos.
  // 'ufcstats' guarda un path ('/fighter-details/<hash>'), 'espn' un id numérico.
  source?: string | null;
  source_id?: string | null;
  // BE5 (bio extendida): lugar de nacimiento y debut en UFC. Opcionales: las
  // queries de detalle castean octagon_debut (DATE) a ::text; vía `f.*` a secas
  // pg podría entregarlo como Date, así que solo el detalle debe consumirlo.
  birth_place?: string | null;
  octagon_debut?: string | null;
  fight_count?: string;
  latest_weight_class?: string | null;
  // S2-E (migración 015): Fighter Facts + Q&A en español. pg parsea JSONB a
  // JSON automáticamente; `unknown` porque la forma se valida en el mapper.
  fighter_facts?: unknown;
  fighter_qa?: unknown;
};

export type HistoryRow = {
  fight_id: number;
  event_id: number | null;
  event_name: string | null;
  event_date: string | null;
  opponent_id: number | null;
  opponent_name: string | null;
  opponent_headshot: string | null;
  corner: "red" | "blue";
  result: "win" | "loss" | "draw" | "nc";
  method: string | null;
  end_round: number | null;
  end_time: string | null;
  weight_class: string | null;
  video_url: string | null;
  is_title_fight: boolean;
};

// S3-G (migración 016): fila de fight_history_espn — historial no-UFC
// (Bellator/regionales) importado de ESPN. Tabla APARTE de `fights`: estas
// filas solo alimentan la TABLA del historial de la ficha, nunca las stats.
export type EspnHistoryRow = {
  id: number;
  promotion: string | null;
  event_name: string | null;
  event_date: string | null;
  opponent_name: string | null;
  opponent_fighter_id: number | null;
  result: "win" | "loss" | "draw" | "nc";
  method: string | null;
  end_round: number | null;
  end_time: string | null;
  is_title_fight: boolean;
};

export type AggregateRow = {
  sig_strikes_landed: string | null;
  sig_strikes_attempted: string | null;
  takedowns_landed: string | null;
  takedowns_attempted: string | null;
  submission_attempts: string | null;
  control_time_seconds: string | null;
  knockdowns: string | null;
  total_fight_stats: string | null;
};

export type DefenseRow = {
  opp_sig_strikes_landed: string | null;
  opp_sig_strikes_attempted: string | null;
  opp_takedowns_landed: string | null;
  opp_takedowns_attempted: string | null;
};

export type WinMethodRow = {
  ko_tko: string | null;
  submission: string | null;
  decision: string | null;
  other: string | null;
};

export type FighterRankingRow = {
  division: string;
  rank_position: number;
  is_champion: boolean;
};

export type SearchRow = {
  id: number;
  name: string;
  headshot_url: string | null;
  nationality: string | null;
};

export type DirectMatchupRow = {
  fight_id: number;
  event_name: string | null;
  event_date: string | null;
  winner_id: number | null;
  method: string | null;
  end_round: number | null;
  end_time: string | null;
  weight_class: string | null;
};

export type NewsRow = {
  id: number;
  headline: string;
  summary: string | null;
  source: string | null;
  url: string;
  published_at: string | null;
  fighter_id: number | null;
  fighter_name: string | null;
  category: string | null;
  relevance: string | null;
  image_url: string | null;
};

export type StrikeBreakdownRow = {
  head_landed: string | null;
  head_attempted: string | null;
  body_landed: string | null;
  body_attempted: string | null;
  leg_landed: string | null;
  leg_attempted: string | null;
  distance_landed: string | null;
  distance_attempted: string | null;
  clinch_landed: string | null;
  clinch_attempted: string | null;
  ground_landed: string | null;
  ground_attempted: string | null;
};

export type UpcomingBoutRow = {
  fight_id: number;
  event_id: number | null;
  event_name: string | null;
  event_date: string | null;
  opponent_id: number | null;
  opponent_name: string | null;
  opponent_headshot: string | null;
  opponent_wins: number | null;
  opponent_losses: number | null;
  opponent_draws: number | null;
  corner: "red" | "blue";
};

export type FighterFilterOptions = FighterListResult["filterOptions"];
