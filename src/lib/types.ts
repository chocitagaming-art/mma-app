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

// --- Ficha de luchador estilo UFC.com: agregados adicionales (#39) ---

// Defensa = porcentaje de intentos del rival que NO conectaron (0..1).
export type FighterDefenseStats = {
  strikingDefense: number;
  takedownDefense: number;
  oppSigStrikesLanded: number;
  oppSigStrikesAttempted: number;
  oppTakedownsLanded: number;
  oppTakedownsAttempted: number;
};

export type FighterWinMethods = {
  koTko: number;
  submission: number;
  decision: number;
  other: number;
  total: number;
};

// Promedios POR PELEA (no por minuto: la BD no guarda duración de combate).
export type FighterRateStats = {
  sigStrikesLandedPerFight: number;
  sigStrikesAbsorbedPerFight: number;
  fightStatsCount: number;
};

export type FighterSearchResult = {
  id: number;
  name: string;
  headshotUrl: string | null;
  nationality: string | null;
};

// Resultado de evento para la búsqueda global (combobox del Inicio).
export type EventSearchResult = {
  id: number;
  name: string;
  eventDate: string | null;
  location: string | null;
  imageUrl: string | null;
};

// Resultado de noticia para la búsqueda global. `url` apunta al artículo externo
// (las noticias no tienen ficha propia; el listado vive en /news).
export type NewsSearchResult = {
  id: number;
  headline: string;
  source: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  url: string;
};

// Búsqueda GLOBAL: cada resultado lleva un campo `type` discriminante para que
// el cliente sepa a qué ruta enlazar (/fighters/[id], /eventos/[id], /news).
export type GlobalSearchFighter = FighterSearchResult & { type: "fighter" };
export type GlobalSearchEvent = EventSearchResult & { type: "event" };
export type GlobalSearchNews = NewsSearchResult & { type: "news" };

export type GlobalSearchResults = {
  fighters: GlobalSearchFighter[];
  events: GlobalSearchEvent[];
  news: GlobalSearchNews[];
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

// Posición del luchador en el último snapshot de rankings (#14).
// `position` es rank_position de la BD (0 = campeón). `division` es el slug crudo.
export type FighterRanking = {
  division: string; // slug (p.ej. "lightweight")
  position: number; // rank_position (0 = campeón)
  isChampion: boolean;
};

export type FighterDetail = {
  fighter: Fighter;
  latestWeightClass: string | null;
  fightCount: number;
  history: FighterHistoryItem[];
  aggregateStats: FighterAggregateStats;
  news: NewsArticle[];
  // Agregados extra para la ficha estilo UFC.com (#39):
  defenseStats: FighterDefenseStats;
  winMethods: FighterWinMethods;
  rateStats: FighterRateStats;
  // Ranking en el último snapshot (#14): null si el luchador no está rankeado.
  ranking: FighterRanking | null;
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
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  videoUrl: string | null;
  oddsRed: number | null;
  oddsBlue: number | null;
  red: FightCompetitor;
  blue: FightCompetitor;
  redStats: FightCompetitorStats | null;
  blueStats: FightCompetitorStats | null;
};

// --- Silueta de golpes por zona/posición estilo ufc.com (#45) ---

// Golpes (landed/attempted) de una zona o posición concreta.
export type StrikeZoneStat = {
  landed: number;
  attempted: number;
};

// Desglose de golpes significativos por objetivo (cabeza/cuerpo/pierna) y por
// posición (a distancia/clinch/suelo). Invariante de los datos:
// head+body+leg == distance+clinch+ground == golpes significativos.
export type FighterStrikeBreakdown = {
  head: StrikeZoneStat;
  body: StrikeZoneStat;
  leg: StrikeZoneStat;
  distance: StrikeZoneStat;
  clinch: StrikeZoneStat;
  ground: StrikeZoneStat;
  totalLanded: number; // head+body+leg conectados (= golpes significativos)
};

// Dos caras del muñeco: lo que el luchador CONECTA y lo que RECIBE.
export type FighterStrikeProfile = {
  offense: FighterStrikeBreakdown;
  defense: FighterStrikeBreakdown;
};

// --- Próximos combates del luchador (#48) ---
export type FighterUpcomingBout = {
  fightId: number;
  eventId: number | null;
  eventName: string | null;
  eventDate: string | null;
  opponentId: number | null;
  opponentName: string | null;
  opponentHeadshotUrl: string | null;
  opponentWins: number | null;
  opponentLosses: number | null;
  opponentDraws: number | null;
  corner: "red" | "blue"; // esquina de ESTE luchador en ese combate
};