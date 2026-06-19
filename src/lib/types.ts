export type Fighter = {
  id: number;
  name: string;
  nickname: string | null;
  headshotUrl: string | null;
  nationality: string | null;
  birthDate: string | null;
  heightCm: number | null;
  reachCm: number | null;
  stance: string | null;
  weightGrams: number | null;
  wins: number;
  losses: number;
  draws: number;
  updatedAt: string | null;
};

export type FighterCardData = Fighter & {
  fightCount: number;
  latestWeightClass: string | null;
};

export type HomeStats = {
  fighters: number;
  events: number;
  fights: number;
  fightStats: number;
};

export type FighterFilters = {
  page?: number;
  pageSize?: number;
  query?: string;
  weightClass?: string;
  stance?: string;
  nationality?: string;
  sort?: "relevance" | "name" | "wins" | "losses";
};

export type FighterListResult = {
  fighters: FighterCardData[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: {
    weightClasses: string[];
    stances: string[];
    nationalities: string[];
  };
};

export type FighterHistoryItem = {
  fightId: number;
  eventId: number | null;
  eventName: string | null;
  eventDate: string | null;
  opponentId: number | null;
  opponentName: string | null;
  corner: "red" | "blue";
  result: "win" | "loss" | "draw" | "nc";
  method: string | null;
  endRound: number | null;
  endTime: string | null;
  weightClass: string | null;
};

export type FighterAggregateStats = {
  sigStrikesLanded: number;
  sigStrikesAttempted: number;
  sigStrikeAccuracy: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  takedownAccuracy: number;
  submissionAttempts: number;
  controlTimeSeconds: number;
  knockdowns: number;
  totalFightStats: number;
};

export type FighterSearchResult = {
  id: number;
  name: string;
  headshotUrl: string | null;
  nationality: string | null;
};

export type FighterComparisonAverages = {
  sigStrikesLandedPerFight: number;
  sigStrikeAccuracy: number;
  knockdownsPerFight: number;
  takedownsLandedPerFight: number;
  takedownAccuracy: number;
  submissionAttemptsPerFight: number;
  controlTimePerFightSeconds: number;
  totalFightStats: number;
};

export type FighterComparisonProfile = Fighter & {
  fightCount: number;
  latestWeightClass: string | null;
  aggregateStats: FighterComparisonAverages;
};

export type DirectMatchupFight = {
  fightId: number;
  eventName: string | null;
  eventDate: string | null;
  winnerId: number | null;
  method: string | null;
  endRound: number | null;
  endTime: string | null;
  weightClass: string | null;
};

export type FighterComparisonDetail = {
  fighterA: FighterComparisonProfile;
  fighterB: FighterComparisonProfile;
  directMatchups: DirectMatchupFight[];
};

export type FighterDetail = {
  fighter: Fighter;
  latestWeightClass: string | null;
  fightCount: number;
  history: FighterHistoryItem[];
  aggregateStats: FighterAggregateStats;
  news: NewsArticle[];
};

export type NewsArticle = {
  id: number;
  headline: string;
  summary: string | null;
  source: string | null;
  url: string;
  publishedAt: string | null;
  fighterId: number | null;
  fighterName: string | null;
  category: string | null;
  relevance: number | null;
  imageUrl: string | null;
};

export type NewsListResult = {
  articles: NewsArticle[];
  categories: string[];
  activeCategory: string;
};

export type RankingEntry = {
  rankPosition: number; // 0 = champion
  isChampion: boolean;
  rankChange: number | null; // +N sube, -N baja, null = sin cambio, >=900 = nuevo
  fighterId: number | null;
  fighterName: string;
  headshotUrl: string | null;
  nationality: string | null;
  nickname: string | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
};

export type DivisionRanking = {
  division: string; // slug (p.ej. "lightweight", "mens_pound_for_pound")
  label: string; // etiqueta en español
  champion: RankingEntry | null;
  ranked: RankingEntry[];
};

export type RankingsResult = {
  snapshotDate: string | null;
  divisions: DivisionRanking[];
};

export type EventListItem = {
  id: number;
  name: string;
  eventDate: string | null;
  location: string | null;
  fightCount: number;
};

export type EventListResult = {
  events: EventListItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type EventBoutFighter = {
  id: number | null;
  name: string;
  nickname: string | null;
  headshotUrl: string | null;
  nationality: string | null;
  wins: number;
  losses: number;
  draws: number;
};

export type EventBout = {
  fightId: number;
  weightClass: string | null;
  method: string | null;
  endRound: number | null;
  endTime: string | null;
  scheduledRounds: number | null;
  winnerId: number | null;
  boutOrder: number | null;
  cardSegment: string | null;
  red: EventBoutFighter;
  blue: EventBoutFighter;
};

export type EventDetail = {
  id: number;
  name: string;
  eventDate: string | null;
  location: string | null;
  status: string | null;
  startTime: string | null;
  imageUrl: string | null;
  broadcast: string | null;
  ticketUrl: string | null;
  tagline: string | null;
  headliner: string | null;
  bouts: EventBout[];
};

export type UpcomingEventItem = {
  id: number;
  name: string;
  headliner: string | null;
  eventDate: string | null;
  startTime: string | null;
  location: string | null;
  imageUrl: string | null;
  broadcast: string | null;
  ticketUrl: string | null;
  tagline: string | null;
  fightCount: number;
};

export type FightCompetitor = {
  id: number;
  name: string;
  nickname: string | null;
  headshotUrl: string | null;
  nationality: string | null;
  stance: string | null;
  heightCm: number | null;
  reachCm: number | null;
  wins: number;
  losses: number;
  draws: number;
};

export type FightCompetitorStats = {
  fighterId: number;
  sigStrikesLanded: number;
  sigStrikesAttempted: number;
  sigStrikeAccuracy: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  takedownAccuracy: number;
  submissionAttempts: number;
  controlTimeSeconds: number;
  knockdowns: number;
};

export type FightDetail = {
  id: number;
  eventId: number | null;
  eventName: string | null;
  eventDate: string | null;
  location: string | null;
  weightClass: string | null;
  scheduledRounds: number | null;
  method: string | null;
  endRound: number | null;
  endTime: string | null;
  winnerId: number | null;
  red: FightCompetitor;
  blue: FightCompetitor;
  redStats: FightCompetitorStats | null;
  blueStats: FightCompetitorStats | null;
};