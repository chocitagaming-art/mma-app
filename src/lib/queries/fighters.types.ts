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
  fight_count?: string;
  latest_weight_class?: string | null;
};

export type HistoryRow = {
  fight_id: number;
  event_id: number | null;
  event_name: string | null;
  event_date: string | null;
  opponent_id: number | null;
  opponent_name: string | null;
  corner: "red" | "blue";
  result: "win" | "loss" | "draw" | "nc";
  method: string | null;
  end_round: number | null;
  end_time: string | null;
  weight_class: string | null;
  video_url: string | null;
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
