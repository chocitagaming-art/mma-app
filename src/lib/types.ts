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
  // Campos de la ficha estilo ufc.com (fase 3). Opcionales: el backfill puede
  // dejarlos NULL y algunas queries antiguas no los seleccionan.
  fullBodyUrl?: string | null; // PNG de cuerpo entero con fondo transparente
  // Foto "standing" (cuerpo entero de pie, Ronda B). Cadena de fallback en
  // combates/enfrentamiento: standing → full body → headshot.
  standingBodyUrl?: string | null;
  // F1 (migración 019): variantes direccionales de la foto standing para el
  // cara a cara. _l mira a la derecha (esquina roja), _r a la izquierda (azul).
  standingBodyUrlL?: string | null;
  standingBodyUrlR?: string | null;
  legReachCm?: number | null;
  trainsAt?: string | null; // gimnasio/equipo
  // FE9: procedencia del registro para enlaces externos ('ufcstats', 'espn',
  // 'manual'...). Opcionales: solo las queries de detalle los exponen.
  source?: string | null;
  sourceId?: string | null;
  // BE5: bio extendida de la ficha. Opcionales: pueden faltar en la BD y las
  // queries antiguas no los seleccionan. octagonDebut es ISO "YYYY-MM-DD"
  // (DATE casteado a ::text en las queries de detalle).
  birthPlace?: string | null;
  octagonDebut?: string | null;
  // 1A (migración 021): desglose de acabados de CARRERA desde ufc.com. NULL/
  // undefined = sin dato ufc.com -> la ficha usa el cálculo UFC-only (winMethods).
  // Son totales de carrera, consistentes con el record W-L-D del hero.
  winsByKo?: number | null;
  winsBySubmission?: number | null;
  firstRoundFinishes?: number | null;
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
  // Foto del rival (headshot_url). En filas UFC viene del JOIN a fighters; en
  // las de ESPN es null (no hay headshot). Opcional para no romper las
  // factorías de test que construyen FighterHistoryItem parcial.
  opponentHeadshotUrl?: string | null;
  // Las filas espn (S3-G) no traen esquina: ESPN lista la carrera desde la
  // perspectiva del propio luchador.
  corner?: "red" | "blue";
  result: "win" | "loss" | "draw" | "nc";
  method: string | null;
  endRound: number | null;
  endTime: string | null;
  weightClass: string | null;
  videoUrl: string | null;
  // S3-G: procedencia para el badge del historial. Las filas de `fights`
  // (UFC, ufcstats/ufc.com) no la llevan (=UFC); las de fight_history_espn
  // llegan con origin 'espn' + su promoción ('Bellator', 'CFFC'...).
  origin?: "ufc" | "espn";
  promotion?: string | null;
  isTitleFight?: boolean;
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
//
// null = NO HAY DENOMINADOR: nadie lo intentó, o el luchador no tiene ni una
// fila en fight_stats. No es lo mismo que 0, que significa "lo intentaron y los
// encajó todos" y es un dato real de 207 fichas (medido el 9-ago-2026). Antes
// los dos casos compartían el 0 y la web publicaba "Defensa de derribo 0 %" en
// 398 fichas a las que nadie había intentado derribar. Misma convención que
// `safe_divide` de mma-ingesta (metrics.py), que devuelve None.
export type FighterDefenseStats = {
  strikingDefense: number | null;
  takedownDefense: number | null;
  // Fracción de intentos de sumisión encajados que sobrevivió. null por debajo
  // del umbral (SUBMISSION_DEFENSE_MIN_ATTEMPTS): 36 % de las fichas no han
  // encajado jamás un intento y no hay nada que medir en ellas.
  submissionDefense: number | null;
  oppSubmissionAttempts: number;
  submissionsLost: number;
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

// Promedios POR PELEA + tasas POR MINUTO (FE4). Las tasas por minuto se
// calculan a partir de fights.end_round/end_time (duración real del combate);
// solo entran las peleas con esos campos registrados, y numerador y
// denominador usan SIEMPRE esa misma muestra de peleas.
export type FighterRateStats = {
  sigStrikesLandedPerFight: number;
  sigStrikesAbsorbedPerFight: number;
  fightStatsCount: number;
  // SLpM / SApM: golpes significativos conectados/absorbidos por minuto.
  slpm: number;
  sapm: number;
  // Derribos e intentos de sumisión normalizados a 15 minutos (3 asaltos).
  takedownsPer15Min: number;
  submissionAttemptsPer15Min: number;
  // Duración media (en segundos) de las peleas cronometradas; 0 si no hay.
  avgFightSeconds: number;
  // Nº de peleas con duración conocida usadas como denominador de las tasas.
  timedFightsCount: number;
  // Fracción del combate que pasa controlando (0..1), sobre esa MISMA muestra
  // cronometrada. null cuando no hay muestra, o cuando el dato es imposible
  // (más control que combate). Ver computeControlShare.
  controlShare: number | null;
};

// Récord derivado SOLO de los combates registrados en la BD (historial UFC),
// frente al récord total de la tabla fighters que incluye la carrera completa
// (BE9a). Convención de empate: winner_id NULL con method registrado; los
// combates programados (ambos NULL) no cuentan.
export type FighterUfcRecord = {
  wins: number;
  losses: number;
  draws: number;
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
  // Silueta de golpes (ofensa + defensa) para el cara a cara (#45).
  strikeProfile: FighterStrikeProfile;
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

// Una fila del historial de ranking de un luchador (una división en una fecha).
// `division` es el slug crudo; `snapshotDate` es ISO "YYYY-MM-DD".
export type FighterRankingHistoryEntry = {
  division: string;
  rankPosition: number;
  snapshotDate: string;
  isChampion: boolean;
};

// S2-E: par pregunta/respuesta del bloque Q&A de ufc.com, ya en español.
export type FighterQaItem = {
  q: string;
  a: string;
};

export type FighterDetail = {
  fighter: Fighter;
  latestWeightClass: string | null;
  fightCount: number;
  history: FighterHistoryItem[];
  // S3-G: historial no-UFC (fight_history_espn). SOLO para la tabla del
  // historial (fusionado allí con `history`); las stats/racha/forma de la
  // ficha siguen calculándose únicamente sobre `history` (solo UFC).
  espnHistory: FighterHistoryItem[];
  aggregateStats: FighterAggregateStats;
  news: NewsArticle[];
  // S2-E: Fighter Facts + Q&A de ufc.com traducidos (vacíos si el luchador no
  // tiene el bloque; la sección INFO de la ficha no se renderiza).
  fighterFacts: string[];
  fighterQa: FighterQaItem[];
  // Agregados extra para la ficha estilo UFC.com (#39):
  defenseStats: FighterDefenseStats;
  winMethods: FighterWinMethods;
  rateStats: FighterRateStats;
  // Récord dentro de los combates registrados (historial UFC, BE9a).
  ufcRecord: FighterUfcRecord;
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
  imageUrl?: string | null;
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
  // Posición en el ranking de su división (último snapshot, P4P excluido).
  // 0 = campeón (así lo guarda la tabla rankings); null = sin ranking.
  rank: number | null;
  // Ficha física para el mini tale-of-the-tape desplegable de la cartelera
  // (FE6). NULL cuando el luchador es TBD o el dato falta en la BD.
  heightCm: number | null;
  reachCm: number | null;
  stance: string | null;
  birthDate: string | null;
  // BE3: bono "Actuación de la Noche" (POTN) de este evento. Opcional: solo
  // lo rellena getEventDetail; el resto de queries (hero, home) no lo cargan.
  isPotn?: boolean;
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
  // BE7: fights.status crudo (NULL = programada/celebrada, 'cancelled' =
  // cancelada). Las queries excluyen canceladas por defecto; solo
  // getEventDetail las trae aparte (EventDetail.cancelledBouts).
  status: string | null;
  // BE9b: pelea por el título (fights.is_title_fight).
  isTitleFight: boolean;
  // BE3: bono "Pelea de la Noche" (FOTN). Opcional: solo getEventDetail.
  isFotn?: boolean;
  oddsRed: number | null;
  oddsBlue: number | null;
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
  // Careo oficial de UFC (face-off) en YouTube: solo el video id (migración 022).
  faceoffVideoId: string | null;
  broadcast: string | null;
  ticketUrl: string | null;
  tagline: string | null;
  headliner: string | null;
  // FE9: procedencia del evento ('ufc.com' guarda el slug en sourceId) para
  // el enlace externo "Ver en UFC.com".
  source: string | null;
  sourceId: string | null;
  // FE5b: horarios por sección (timestamptz ::text de Postgres). startTime
  // sigue siendo la cartelera estelar; estos dos son sus tramos previos.
  earlyPrelimsTime: string | null;
  prelimsTime: string | null;
  bouts: EventBout[];
  // BE7: peleas canceladas, separadas de `bouts` para que ni la cartelera ni
  // el conteo "N peleas" las incluyan. Solo la vista de futuros las pinta.
  cancelledBouts: EventBout[];
};

// BE2: una fila del pesaje oficial del evento (weigh_ins JOIN fighters).
// weightLbs llega como NUMERIC ::text y se convierte con Number(); null si el
// registro existe sin peso (p.ej. luchador que no se presentó a la báscula).
export type EventWeighIn = {
  fightId: number;
  fighterId: number;
  fighterName: string;
  headshotUrl: string | null;
  weightLbs: number | null;
  missedWeight: boolean;
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

// --- Módulo "Up Next" de la home (FE1) ---

// Protagonista del combate estelar del próximo evento: lo mismo que una esquina
// de EventBout más las fotos de cuerpo entero para el cara a cara grande
// (cadena standing → full body → headshot, como en combates/enfrentamiento).
export type NextEventHeroFighter = EventBoutFighter & {
  fullBodyUrl: string | null;
  standingBodyUrl: string | null;
  // F1: variantes direccionales de la foto standing (roja=_l, azul=_r).
  standingBodyUrlL?: string | null;
  standingBodyUrlR?: string | null;
};

export type NextEventMainBout = {
  fightId: number;
  weightClass: string | null;
  red: NextEventHeroFighter;
  blue: NextEventHeroFighter;
};

export type NextEventHero = {
  id: number;
  name: string;
  eventDate: string | null;
  startTime: string | null;
  // Los cuatro campos juntos forman un `LiveEventTimes`, que es lo que piden
  // `diaLogicoDeVelada` y la cuenta atrás para no contradecirse entre sí.
  prelimsTime: string | null;
  earlyPrelimsTime: string | null;
  location: string | null;
  imageUrl: string | null;
  broadcast: string | null;
  // null cuando el evento aún no tiene cartelera registrada.
  mainEvent: NextEventMainBout | null;
};

// --- Sección "Acaba de pasar" de la home (FE10) ---

// Último evento completado con las primeras peleas de su cartelera estelar.
// Los bouts son EventBout EXACTOS para reutilizar EventBoutRow tal cual.
export type LastEventResults = {
  id: number;
  name: string;
  eventDate: string | null;
  location: string | null;
  bouts: EventBout[];
};

// Resultado de la ÚLTIMA pelea completada de un luchador (fila "Última pelea"
// del tale-of-the-tape, Fase 4). Sigue el criterio de FighterHistoryItem:
// winner_id NULL con method registrado = empate/no contest.
export type FightLastResult = {
  // null cuando la última pelea es regional (fight_history_espn): esa pelea no
  // vive en la tabla `fights`, así que no hay ficha de combate a la que enlazar.
  fightId: number | null;
  eventName: string | null;
  eventDate: string | null;
  result: "win" | "loss" | "draw" | "nc";
  method: string | null;
};

export type FightCompetitor = {
  // null cuando el rival está por anunciar (combate próximo TBD): no hay ficha.
  id: number | null;
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
  // Campos opcionales añadidos en Fase 4 (ficha de combate estilo ufc.com).
  // Opcionales para no romper a otros constructores de FightCompetitor.
  fullBodyUrl?: string | null;
  standingBodyUrl?: string | null; // foto de pie (Ronda B), prioritaria en combates
  // F1: variantes direccionales de la foto standing (roja=_l, azul=_r).
  standingBodyUrlL?: string | null;
  standingBodyUrlR?: string | null;
  weightGrams?: number | null;
  birthDate?: string | null;
  legReachCm?: number | null;
  lastFight?: FightLastResult | null;
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
  // null = el acta no registra el control (152 combates de 1995-1999). NO es 0.
  controlTimeSeconds: number | null;
  knockdowns: number;
};

// BE8: tarjeta de UN juez (fight_scorecards). Solo hay filas cuando la pelea
// se decidió en las tarjetas; red/blue son los totales que ese juez otorgó a
// cada esquina (p.ej. 48-47).
export type FightScorecard = {
  judgeName: string;
  redScore: number;
  blueScore: number;
};

// BE4: stats de UN luchador en UN asalto (fight_stats_rounds). Peleas antiguas
// no tienen desglose por asalto: entonces la tabla no devuelve filas.
export type FightRoundStats = {
  fighterId: number;
  round: number;
  sigStrikesLanded: number;
  sigStrikesAttempted: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  submissionAttempts: number;
  // null = el acta no registra el control (152 combates de 1995-1999). NO es 0.
  controlTimeSeconds: number | null;
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
  // BE8: árbitro del combate (fights.referee); null si no está registrado.
  referee: string | null;
  winnerId: number | null;
  // fights.status crudo (mismo convenio que EventBout): NULL =
  // programada/celebrada, 'cancelled' = cancelada.
  status: string | null;
  videoUrl: string | null;
  oddsRed: number | null;
  oddsBlue: number | null;
  red: FightCompetitor;
  blue: FightCompetitor;
  redStats: FightCompetitorStats | null;
  blueStats: FightCompetitorStats | null;
  // BE8: tarjetas de los jueces; vacío salvo en decisiones.
  scorecards: FightScorecard[];
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

// Próximo combate de un favorito (franja "Tus favoritos" de la home): versión
// compacta multi-luchador de FighterUpcomingBout.
export type FavoriteUpcomingBout = {
  fighterId: number;
  fightId: number;
  eventId: number | null;
  eventName: string | null;
  eventDate: string | null;
  opponentId: number | null;
  opponentName: string | null;
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