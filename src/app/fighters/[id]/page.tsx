import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  ChevronDown,
  ExternalLink,
  History,
  Play,
  Trophy,
} from "lucide-react";

import { BackLink } from "@/components/back-link";
import { CountryFlag } from "@/components/country-flag";
import { FavoriteToggle } from "@/components/favorites/favorite-toggle";
import { DefenseMeter } from "@/components/fighter/defense-meter";
import { FighterFullBody } from "@/components/fighter/fighter-full-body";
import { PerFightBars } from "@/components/fighter/per-fight-bars";
import { PREMIUM_TILE } from "@/components/fighter/premium-tile";
import { RankingTrajectory } from "@/components/fighter/ranking-trajectory";
import { StatDonut } from "@/components/fighter/stat-donut";
import { StrikeSilhouette } from "@/components/fighter/strike-silhouette";
import { UpcomingBouts } from "@/components/fighter/upcoming-bouts";
import { WinMethodChart } from "@/components/fighter/win-method-chart";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cleanNationality,
  formatControlTime,
  formatDate,
  formatDivision,
  formatHeight,
  formatMethod,
  formatNewsCategory,
  formatReach,
  formatRecord,
  formatStance,
  formatWeight,
  formatWeightClass,
} from "@/lib/format";
import {
  computeDivisionHistory,
  formatDivisionStint,
} from "@/lib/division-history";
import { fighterExternalLinks } from "@/lib/external-links";
import { mergeFightHistories } from "@/lib/fight-history";
import { computeRecentForm } from "@/lib/fighter-form";
import {
  computeAge,
  countFirstRoundFinishes,
  lastCompletedFight,
  latestRegionalFight,
  resolveFinishHighlights,
} from "@/lib/fighter-highlights";
import { promotionBadge } from "@/lib/promotion-badge";
import { resolveFightVideoUrl } from "@/lib/video";
import {
  controlTileNote,
  getFighterDetail,
  getFighterStrikeProfile,
  getFighterUpcomingBouts,
} from "@/lib/queries/fighters";
import { getFighterRankingHistory } from "@/lib/queries/rankings";
import { parseId } from "@/lib/route-params";
import { buildFighterJsonLd, serializeJsonLd } from "@/lib/structured-data";

type FighterDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: FighterDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const fighterId = parseId(id);
  const detail = fighterId != null ? await getFighterDetail(fighterId) : null;

  // Sin ficha la página es un "no encontrado" que Next ya marca con noindex:
  // ponerle canónica sería decirle a Google que ESA es la versión buena de algo
  // que no existe.
  if (!detail) {
    return {
      title: "Luchador no encontrado",
    };
  }

  return {
    title: `${detail.fighter.name}`,
    description: `Historial de peleas y estadísticas agregadas de rendimiento de ${detail.fighter.name}.`,
    // Canónica con el id NUMÉRICO ya parseado, no con el texto de la ruta:
    // /fighters/06493 y /fighters/006493 sirven la MISMA ficha con un 200
    // (comprobado en producción el 28-jul-2026), y sin esto Google ve varias
    // páginas idénticas compitiendo entre sí. Relativa a propósito: el
    // metadataBase del layout compone la absoluta a partir de SITE_URL.
    alternates: { canonical: `/fighters/${fighterId}` },
  };
}

export default async function FighterDetailPage({
  params,
}: FighterDetailPageProps) {
  const { id } = await params;
  const fighterId = parseId(id);

  if (fighterId == null) {
    notFound();
  }

  const [detail, strikeProfile, upcomingBouts, rankingHistory] =
    await Promise.all([
      getFighterDetail(fighterId),
      getFighterStrikeProfile(fighterId),
      getFighterUpcomingBouts(fighterId),
      getFighterRankingHistory(fighterId),
    ]);

  if (!detail) {
    notFound();
  }

  const {
    fighter,
    aggregateStats,
    history,
    news,
    defenseStats,
    winMethods,
    rateStats,
    ufcRecord,
  } = detail;

  // S3-G: la TABLA del historial muestra la carrera completa (UFC +
  // Bellator/regionales vía ESPN), y el tile "Última pelea" del hero cae al
  // historial espn cuando el luchador aún no tiene combate UFC disputado
  // (fichaje nuevo). Todo lo demás (racha, forma, divisiones, finalizaciones)
  // sigue calculándose SOLO sobre `history` (peleas UFC): las espn no tienen
  // stats y mezclarían promociones.
  const fullHistory = mergeFightHistories(history, detail.espnHistory);

  const recentForm = computeRecentForm(history);
  const streakLabel =
    recentForm.streakType === "win"
      ? `${recentForm.streakCount}V`
      : recentForm.streakType === "loss"
        ? `${recentForm.streakCount}D`
        : "—";
  const streakHelper =
    recentForm.streakType === "win"
      ? `${recentForm.streakCount} ${recentForm.streakCount === 1 ? "victoria seguida" : "victorias seguidas"}`
      : recentForm.streakType === "loss"
        ? `${recentForm.streakCount} ${recentForm.streakCount === 1 ? "derrota seguida" : "derrotas seguidas"}`
        : "Sin racha activa";
  // Incluye empates/NC en la etiqueta solo si los hay (p.ej. "3-1-1").
  const formOther = recentForm.lastFive.draws + recentForm.lastFive.nc;
  const formLabel =
    `${recentForm.lastFive.wins}-${recentForm.lastFive.losses}` +
    (formOther > 0 ? `-${formOther}` : "");

  // Destacados del hero estilo ufc.com (fase 3). "Última pelea" con fallback
  // regional (S3-G): sin combate UFC disputado, la fila más reciente de espn.
  const age = computeAge(fighter.birthDate);
  const firstRoundFinishes = countFirstRoundFinishes(history);
  const lastFight =
    lastCompletedFight(history) ?? latestRegionalFight(detail.espnHistory);
  const isRegionalLastFight = lastFight?.origin === "espn";
  const nextBout = upcomingBouts[0] ?? null;
  const division = detail.latestWeightClass
    ? formatWeightClass(detail.latestWeightClass)
    : null;

  // Récord DENTRO de los combates registrados (BE9a). Se oculta si coincide
  // con el récord total (carrera entera ya en la BD): sería redundante.
  const ufcRecordLabel = formatRecord(
    ufcRecord.wins,
    ufcRecord.losses,
    ufcRecord.draws,
  );
  const showUfcRecord =
    ufcRecord.wins + ufcRecord.losses + ufcRecord.draws > 0 &&
    ufcRecordLabel !==
      formatRecord(fighter.wins, fighter.losses, fighter.draws);

  // Divisiones históricas (BE10): solo se pintan si hay más de una (con una
  // única división sería ruido repetido con el badge de categoría).
  const divisionStints = computeDivisionHistory(history);

  // Enlaces externos (FE9): perfiles reales del luchador en la fuente de origen.
  const externalLinks = fighterExternalLinks(fighter);

  // 1A: preferimos los totales de CARRERA de ufc.com (guardados) — como el
  // record del hero; sin ficha ufc.com caemos al cálculo UFC-only (winMethods).
  const finishHighlights = resolveFinishHighlights(
    {
      winsByKo: fighter.winsByKo,
      winsBySubmission: fighter.winsBySubmission,
      firstRoundFinishes: fighter.firstRoundFinishes,
    },
    {
      koTko: winMethods.koTko,
      submission: winMethods.submission,
      firstRoundFinishes,
    },
  );

  const heroHighlights = [
    // Sin "por": los labels contiguos se amontonaban visualmente (dueño, 11-jul).
    { value: finishHighlights.winsByKo, label: "Victorias KO" },
    { value: finishHighlights.winsBySubmission, label: "Victorias sumisión" },
    { value: finishHighlights.firstRoundFinishes, label: "Finalizaciones en 1er asalto" },
  ];

  const lastFightResultLabel =
    lastFight?.result === "win"
      ? "Victoria"
      : lastFight?.result === "loss"
        ? "Derrota"
        : lastFight?.result === "draw"
          ? "Empate"
          : "Sin resultado";
  const lastFightResultClass =
    lastFight?.result === "win"
      ? "bg-win/10 text-win"
      : lastFight?.result === "loss"
        ? "bg-loss/10 text-loss"
        : lastFight?.result === "nc"
          ? "bg-nc/10 text-nc"
          : "bg-muted text-muted-foreground";
  // Badge de promoción del tile, solo en modo regional (una pelea UFC no lo
  // necesita: toda la ficha ya es contexto UFC). Mismo mapping que la tabla.
  const lastFightPromotion =
    isRegionalLastFight && lastFight ? promotionBadge(lastFight) : null;

  // Fila bio "sin huecos": los campos opcionales (alcance de pierna, edad,
  // gimnasio) se ocultan cuando faltan en vez de mostrar un guion.
  const bioItems: { label: string; content: ReactNode }[] = [
    { label: "Altura", content: formatHeight(fighter.heightCm) },
    { label: "Alcance", content: formatReach(fighter.reachCm) },
    ...(fighter.legReachCm != null
      ? [
          {
            label: "Alcance de pierna",
            content: formatReach(fighter.legReachCm),
          },
        ]
      : []),
    { label: "Peso", content: formatWeight(fighter.weightGrams) },
    ...(age != null ? [{ label: "Edad", content: `${age} años` }] : []),
    // BE5 (bio extendida): lugar de nacimiento y debut en UFC, solo si la BD
    // los tiene (mismo criterio "sin huecos" que el resto de opcionales).
    ...(fighter.birthPlace
      ? [{ label: "Lugar de nacimiento", content: fighter.birthPlace }]
      : []),
    ...(fighter.trainsAt
      ? [{ label: "Gimnasio", content: fighter.trainsAt }]
      : []),
    ...(fighter.octagonDebut
      ? [{ label: "Debut en UFC", content: formatDate(fighter.octagonDebut) }]
      : []),
    ...(divisionStints.length > 1
      ? [
          {
            label: "Divisiones",
            content: divisionStints.map(formatDivisionStint).join(" · "),
          },
        ]
      : []),
    // FE9: enlaces externos reales (UFCStats/ESPN) reconstruidos desde
    // source/source_id. Sin fuente reconocible, la fila no aparece.
    ...(externalLinks.length > 0
      ? [
          {
            label: "Enlaces",
            content: (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                {externalLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                  >
                    <ExternalLink className="size-3.5" />
                    {link.label}
                  </a>
                ))}
              </span>
            ),
          },
        ]
      : []),
  ];

  // Cuando no hay noticias, el hueco se rellena con los próximos combates (#48).
  const showUpcoming = news.length === 0 && upcomingBouts.length > 0;

  // Datos estructurados: describe la ficha como una PERSONA con récord,
  // nacionalidad y equipo, en vez de como texto suelto. Va sin nonce a
  // propósito (ver el encabezado de structured-data.ts).
  const jsonLd = serializeJsonLd(
    buildFighterJsonLd({
      id: fighter.id,
      name: fighter.name,
      nickname: fighter.nickname,
      headshotUrl: fighter.headshotUrl,
      nationality: cleanNationality(fighter.nationality),
      birthDate: fighter.birthDate,
      birthPlace: fighter.birthPlace,
      heightCm: fighter.heightCm,
      trainsAt: fighter.trainsAt,
      wins: fighter.wins,
      losses: fighter.losses,
      draws: fighter.draws,
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <BackLink href="/fighters" label="Luchadores" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {/* HERO estilo ufc.com/athlete: 3 zonas en escritorio (identidad+tiles /
          atleta de cuerpo entero / última pelea y próximo combate); en móvil
          apila badges+nombre → foto → tiles → tarjetas. */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-card via-card to-primary/[0.05] px-5 py-8 sm:px-8 lg:px-10 dark:to-muted/40">
        {/* Haz rojo tras el atleta: en light necesita más alpha y más radio
            para leerse sobre blanco; en dark conserva su tamaño/intensidad. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl lg:block dark:h-[440px] dark:w-[440px] dark:bg-primary/10"
        />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)_minmax(0,1fr)] lg:grid-rows-[auto_auto] lg:gap-x-10">
          {/* IZQUIERDA: identidad */}
          <div className="space-y-5 lg:col-start-1 lg:row-start-1">
            <div className="flex flex-wrap gap-3">
              {detail.ranking ? (
                detail.ranking.isChampion ? (
                  <Badge className="bg-primary text-primary-foreground">
                    <Trophy />
                    Campeón
                  </Badge>
                ) : (
                  <Badge className="border-primary/30 bg-primary/10 text-primary">
                    <Trophy />
                    {`#${detail.ranking.position} ${formatDivision(detail.ranking.division)}`}
                  </Badge>
                )
              ) : null}
              <Badge className="border-primary/20 bg-primary/10 text-primary">
                {division ?? "Categoría no disponible"}
              </Badge>
              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                {fighter.stance ? formatStance(fighter.stance) : "Guardia desconocida"}
              </Badge>
              {/* Nacionalidad con presencia: sustituye a la antigua celda de la
                  fila bio (bandera grande + país en texto destacado). */}
              <Badge
                variant="secondary"
                className="h-auto gap-2 bg-muted px-3 py-1.5 text-sm font-semibold text-foreground"
              >
                <CountryFlag nationality={fighter.nationality} className="h-5 w-7" />
                {cleanNationality(fighter.nationality) ?? "Nacionalidad no disponible"}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Perfil del luchador
              </p>
              <div className="flex items-start justify-between gap-3">
                <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-foreground sm:text-5xl xl:text-6xl">
                  {fighter.name}
                </h1>
                {/* Estrella de favoritos (client): solo recibe props serializables. */}
                <FavoriteToggle
                  fighter={{
                    id: fighter.id,
                    name: fighter.name,
                    headshotUrl: fighter.headshotUrl ?? null,
                  }}
                />
              </div>
              {fighter.nickname ? (
                <p className="text-lg text-muted-foreground">
                  “{fighter.nickname}”
                </p>
              ) : null}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
                <span className="tabular font-display text-3xl font-bold text-foreground">
                  {formatRecord(fighter.wins, fighter.losses, fighter.draws)}
                </span>
                {/* Mismo criterio que la tabla del historial: combates YA
                    disputados (UFC + otras promociones). Los programados van
                    aparte en la tarjeta "Próximo combate". */}
                <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  V-D-E · {fullHistory.length} peleas registradas
                </span>
              </div>
              {/* Récord solo-UFC (BE9a), discreto bajo el récord total. */}
              {showUfcRecord ? (
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  En UFC: <span className="tabular">{ufcRecordLabel}</span>
                </p>
              ) : null}
            </div>
          </div>

          {/* CENTRO: atleta de cuerpo entero (PNG transparente, sin marco) */}
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-end">
            <FighterFullBody
              name={fighter.name}
              fullBodyUrl={fighter.fullBodyUrl ?? null}
              standingBodyUrl={fighter.standingBodyUrl ?? null}
              headshotUrl={fighter.headshotUrl}
              division={detail.latestWeightClass}
              variant="hero"
            />
          </div>

          {/* IZQUIERDA (abajo): tiles de destacados estilo ufc.com */}
          <div className="grid grid-cols-3 gap-4 lg:col-start-1 lg:row-start-2 lg:self-end">
            {heroHighlights.map((highlight) => (
              <div key={highlight.label}>
                <p className="tabular font-display text-3xl font-extrabold leading-none text-foreground sm:text-4xl xl:text-5xl">
                  {highlight.value}
                </p>
                <div className="mt-2.5 h-1 w-10 rounded-full bg-primary" />
                <p className="mt-2 font-mono text-[10px] uppercase leading-snug tracking-[0.12em] text-muted-foreground">
                  {highlight.label}
                </p>
              </div>
            ))}
          </div>

          {/* DERECHA: última pelea, próximo combate y accesos */}
          <div className="flex flex-col gap-4 lg:col-start-3 lg:row-span-2 lg:row-start-1">
            {lastFight ? (
              <div className={`${PREMIUM_TILE} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Última pelea
                  </p>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {lastFightPromotion ? (
                      // Modo regional: promoción junto al resultado (mismas
                      // clases que el badge de la tabla del historial).
                      <span
                        title={lastFightPromotion.label}
                        className={`inline-flex max-w-36 items-center rounded-sm px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${lastFightPromotion.className}`}
                      >
                        <span className="truncate">{lastFightPromotion.label}</span>
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex items-center rounded-sm px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-wide ${lastFightResultClass}`}
                    >
                      {lastFightResultLabel}
                    </span>
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <FighterHeadshot
                    name={lastFight.opponentName ?? "Oponente desconocido"}
                    headshotUrl={lastFight.opponentHeadshotUrl ?? null}
                    // El rival de la última pelea comparte división (y por tanto
                    // género para la silueta de fallback) con el luchador.
                    division={detail.latestWeightClass}
                    size="sm"
                  />
                  <p className="min-w-0 font-display text-xl font-bold uppercase leading-tight tracking-tight text-foreground">
                    {lastFight.opponentId ? (
                      <Link
                        href={`/fighters/${lastFight.opponentId}`}
                        className="transition-colors hover:text-primary"
                      >
                        {lastFight.opponentName ?? "Oponente desconocido"}
                      </Link>
                    ) : (
                      (lastFight.opponentName ?? "Oponente desconocido")
                    )}
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatMethod(lastFight.method)}
                  {lastFight.endRound != null ? ` · R${lastFight.endRound}` : ""}
                  {lastFight.endTime ? ` (${lastFight.endTime})` : ""}
                </p>
                <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                  <CalendarDays className="size-3.5 shrink-0" />
                  {lastFight.eventId ? (
                    <Link
                      href={`/eventos/${lastFight.eventId}`}
                      className="font-display font-bold uppercase tracking-tight transition-colors hover:text-primary"
                    >
                      {lastFight.eventName ?? "Evento desconocido"}
                    </Link>
                  ) : (
                    (lastFight.eventName ?? "Evento desconocido")
                  )}
                  <span aria-hidden>·</span>
                  {formatDate(lastFight.eventDate)}
                </p>
                <div className="mt-4 border-t border-border pt-3">
                  {isRegionalLastFight ? (
                    // El fightId de las filas espn es el id de
                    // fight_history_espn, NO de `fights`: /fights/{id} abriría
                    // una pelea equivocada. Ancla a la tabla del historial,
                    // donde la fila sí aparece con su badge de promoción.
                    <Link
                      href="#historial"
                      className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      Ver en historial →
                    </Link>
                  ) : (
                    <Link
                      href={`/fights/${lastFight.fightId}`}
                      className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      Ver detalles de la pelea →
                    </Link>
                  )}
                </div>
              </div>
            ) : null}

            {nextBout ? (
              <div className={`${PREMIUM_TILE} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Próximo combate
                  </p>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    {formatDate(nextBout.eventDate)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <FighterHeadshot
                    name={nextBout.opponentName ?? "Oponente por confirmar"}
                    headshotUrl={nextBout.opponentHeadshotUrl}
                    // El rival comparte combate (y por tanto género de división)
                    // con el luchador de la ficha.
                    division={detail.latestWeightClass}
                    size="sm"
                  />
                  <div className="min-w-0">
                    {nextBout.opponentId ? (
                      <Link
                        href={`/fighters/${nextBout.opponentId}`}
                        className="font-display text-lg font-bold uppercase leading-tight tracking-tight text-foreground transition-colors hover:text-primary"
                      >
                        {nextBout.opponentName ?? "Oponente por confirmar"}
                      </Link>
                    ) : (
                      <p className="font-display text-lg font-bold uppercase leading-tight tracking-tight text-foreground">
                        {nextBout.opponentName ?? "Oponente por confirmar"}
                      </p>
                    )}
                    {nextBout.opponentWins != null &&
                    nextBout.opponentLosses != null &&
                    nextBout.opponentDraws != null ? (
                      <p className="tabular font-mono text-sm text-muted-foreground">
                        {formatRecord(
                          nextBout.opponentWins,
                          nextBout.opponentLosses,
                          nextBout.opponentDraws,
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {nextBout.eventId ? (
                    <Link
                      href={`/eventos/${nextBout.eventId}`}
                      className="font-display text-sm font-bold uppercase tracking-tight text-foreground transition-colors hover:text-primary"
                    >
                      {nextBout.eventName ?? "Evento por confirmar"}
                    </Link>
                  ) : (
                    (nextBout.eventName ?? "Evento por confirmar")
                  )}
                </p>
              </div>
            ) : null}

            {/* CTAs en rojo UFC (dueño, 11-jul): "Comparar" sólido y
                "Historial" outline — ambos visibles, con jerarquía. */}
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Link href="#historial" className="flex-1">
                <Button
                  variant="outline"
                  // Overrides también con prefijo dark:: la variante outline trae
                  // dark:border-input/dark:bg-input que ganan a las clases sin
                  // prefijo en modo oscuro (revisión adversarial 11-jul).
                  className="w-full border-primary/60 font-semibold text-primary hover:border-primary hover:bg-primary/10 hover:text-primary dark:border-primary/60 dark:bg-transparent dark:hover:border-primary dark:hover:bg-primary/10 dark:hover:text-primary"
                >
                  <History />
                  Ver historial completo
                </Button>
              </Link>
              <Link href={`/enfrentamiento?red=${fighter.id}`} className="flex-1">
                <Button className="w-full font-semibold shadow-[0_0_16px_-4px_var(--primary)]">
                  <ArrowRightLeft />
                  Comparar luchador
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Fila bio completa (los campos sin dato se ocultan, sin huecos) */}
        <div className="relative mt-8 flex flex-wrap gap-x-10 gap-y-6 border-t border-border pt-6 lg:gap-x-14">
          {bioItems.map((item) => (
            <div key={item.label} className="min-w-32">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </p>
              <p className="tabular mt-2 text-lg font-semibold text-foreground">
                {item.content}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Estadísticas inmediatamente tras el hero/bio: dos columnas equilibradas
          (resumen + silueta arriba; volumen + métodos de victoria debajo) para
          que el lateral derecho nunca quede vacío ni las stats enterradas. */}
      <section className="space-y-6">
        <SectionHeading
          eyebrow="Estadísticas"
          title="Perfil de rendimiento"
          description="Racha, precisión, defensa y desglose de victorias, calculado sobre las peleas registradas."
        />
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Resumen de rendimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className={`${PREMIUM_TILE} p-4`}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Racha actual
                  </p>
                  <p
                    className={`tabular mt-2 text-2xl font-bold ${
                      recentForm.streakType === "win"
                        ? "text-win"
                        : recentForm.streakType === "loss"
                          ? "text-loss"
                          : "text-foreground"
                    }`}
                  >
                    {streakLabel}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{streakHelper}</p>
                </div>
                <div className={`${PREMIUM_TILE} p-4`}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Forma (últ. 5)
                  </p>
                  <p className="tabular mt-2 text-2xl font-bold text-foreground">
                    {formLabel}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {recentForm.lastFive.total} combate
                    {recentForm.lastFive.total === 1 ? "" : "s"} · V-D
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatDonut
                  label="Precisión de golpeo"
                  value={aggregateStats.sigStrikeAccuracy}
                  helper={`${aggregateStats.sigStrikesLanded}/${aggregateStats.sigStrikesAttempted}`}
                  colorVar="var(--chart-1)"
                />
                <StatDonut
                  label="Precisión de derribo"
                  value={aggregateStats.takedownAccuracy}
                  helper={`${aggregateStats.takedownsLanded}/${aggregateStats.takedownsAttempted}`}
                  colorVar="var(--chart-2)"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`${PREMIUM_TILE} p-4 text-center`}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Knockdowns
                  </p>
                  <p className="tabular mt-2 text-2xl font-bold text-foreground">
                    {aggregateStats.knockdowns}
                  </p>
                </div>
                <div className={`${PREMIUM_TILE} p-4 text-center`}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Int. sumisión
                  </p>
                  <p className="tabular mt-2 text-2xl font-bold text-foreground">
                    {aggregateStats.submissionAttempts}
                  </p>
                </div>
                <div className={`${PREMIUM_TILE} p-4 text-center`}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Derribos
                  </p>
                  <p className="tabular mt-2 text-2xl font-bold text-foreground">
                    {aggregateStats.takedownsLanded}
                  </p>
                </div>
                {/* 🪤 EL TIEMPO NO SIEMPRE ES EL TOTAL DEL LUCHADOR, y este
                    comentario afirmaba que sí. `sum()` de Postgres ignora los
                    NULL, así que en 38 fichas la cifra es la suma de UNAS
                    CUANTAS actas con rótulo de total: David Abbott enseñaba
                    «T. control 2:03», que salía de 3 de sus 18. No se veía
                    porque el guard de `computeControlShare` ya tapaba la cuota
                    en esos mismos casos — o sea que lo que ocultaba el error
                    era el arreglo de OTRO error.

                    Las tres ramas son EXCLUYENTES a propósito y van en una
                    sola expresión, no en dos bloques `? :` independientes: el
                    tile tiene sitio para una línea y los cuatro de la rejilla
                    están alineados, así que dos líneas a la vez rompen la
                    maqueta. Hoy ninguna ficha las pinta las dos, y por eso un
                    test de altura pasaría igual: la exclusión tiene que ser
                    estructural, no una coincidencia de los datos. */}
                <div className={`${PREMIUM_TILE} p-4 text-center`}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    T. control
                  </p>
                  <p className="tabular mt-2 text-2xl font-bold text-foreground">
                    {formatControlTime(aggregateStats.controlTimeSeconds)}
                  </p>
                  {(() => {
                    const nota = controlTileNote(
                      rateStats.controlShare,
                      aggregateStats.controlTimeSeconds,
                      aggregateStats.fightsWithControl,
                      aggregateStats.totalFightStats,
                    );
                    if (nota === null) return null;
                    return (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {nota.kind === "share"
                          ? `${nota.percent}% del combate`
                          : `solo de ${nota.of} de sus ${nota.total} actas`}
                      </p>
                    );
                  })()}
                </div>
              </div>
              {/* Un medidor sin denominador no se pinta: decir "0 %" cuando
                  nadie lo intentó es afirmar lo contrario de lo que pasó. Mismo
                  criterio que el gráfico de métodos y el historial de ranking,
                  que se ocultan sin datos (más abajo). */}
              {defenseStats.strikingDefense !== null ||
              defenseStats.takedownDefense !== null ||
              defenseStats.submissionDefense !== null ? (
                <div className="grid gap-3">
                  {defenseStats.strikingDefense !== null ? (
                    <DefenseMeter
                      label="Defensa de golpeo"
                      value={defenseStats.strikingDefense}
                      helper={`${defenseStats.oppSigStrikesLanded} de ${defenseStats.oppSigStrikesAttempted} permitidos`}
                    />
                  ) : null}
                  {defenseStats.takedownDefense !== null ? (
                    <DefenseMeter
                      label="Defensa de derribo"
                      value={defenseStats.takedownDefense}
                      helper={`${defenseStats.oppTakedownsLanded} de ${defenseStats.oppTakedownsAttempted} permitidos`}
                    />
                  ) : null}
                  {/* 🪤 "en UFC" no es un adorno: los intentos de sumisión solo
                      existen en `fight_stats`, que es UFC, mientras la tabla de
                      abajo fusiona el historial de PRIDE, Bellator y WSOF. Sin
                      declarar el alcance, 385 fichas afirmaban un 100 % encima
                      de una tabla que lista las sumisiones que sí encajaron
                      fuera — Jon Fitch entre ellas. */}
                  {defenseStats.submissionDefense !== null ? (
                    <DefenseMeter
                      label="Defensa de sumisión"
                      value={defenseStats.submissionDefense}
                      helper={`${defenseStats.oppSubmissionAttempts - defenseStats.submissionsLost} de ${defenseStats.oppSubmissionAttempts} superados en UFC`}
                    />
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <StrikeSilhouette profile={strikeProfile} />

          <div className={winMethods.total > 0 ? undefined : "lg:col-span-2"}>
            <PerFightBars
              landedPerFight={rateStats.sigStrikesLandedPerFight}
              absorbedPerFight={rateStats.sigStrikesAbsorbedPerFight}
              rateStats={rateStats}
            />
          </div>
          {winMethods.total > 0 ? <WinMethodChart methods={winMethods} /> : null}
        </div>
      </section>

      {rankingHistory.length > 0 ? (
        <section className="space-y-6">
          <SectionHeading
            eyebrow="Ranking"
            title="Trayectoria de ranking"
            description={`Evolución de la posición de ${fighter.name} en el ranking oficial a lo largo del tiempo. El #1 (y el campeón) aparecen arriba.`}
            descriptionClassName="max-w-none"
          />
          <RankingTrajectory history={rankingHistory} />
        </section>
      ) : null}

      <section id="historial" className="scroll-mt-24 space-y-6">
        <SectionHeading
          eyebrow="Historial de peleas"
          title="Cada enfrentamiento registrado"
          description="La carrera completa: UFC y también Bellator u otras promociones (vía ESPN). Las estadísticas de la ficha solo cuentan peleas UFC."
        />
        {fullHistory.length ? (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Fecha
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Oponente
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Resultado
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Método
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Rnd
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Tiempo
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Org.
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Evento
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Vídeo
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fullHistory.map((fight) => {
                    const resultLabel =
                      fight.result === "win"
                        ? "Victoria"
                        : fight.result === "loss"
                          ? "Derrota"
                          : fight.result === "draw"
                            ? "Empate"
                            : "Sin resultado";
                    const resultClass =
                      fight.result === "win"
                        ? "bg-win/10 text-win"
                        : fight.result === "loss"
                          ? "bg-loss/10 text-loss"
                          : fight.result === "nc"
                            ? "bg-nc/10 text-nc"
                            : "bg-muted text-muted-foreground";
                    // Badge de promoción (S3-G): UFC rojo, Bellator ámbar,
                    // resto (regionales) gris con su nombre corto. Mapping
                    // compartido con el tile "Última pelea" del hero.
                    const { label: promotionLabel, className: promotionClass } =
                      promotionBadge(fight);

                    return (
                      <TableRow
                        key={`${fight.origin ?? "ufc"}-${fight.fightId}`}
                        className="hover:bg-muted"
                      >
                        <TableCell className="tabular text-muted-foreground">
                          {formatDate(fight.eventDate)}
                        </TableCell>
                        <TableCell className="font-display text-sm font-bold uppercase tracking-tight text-foreground">
                          {fight.opponentId ? (
                            <Link
                              href={`/fighters/${fight.opponentId}`}
                              className="transition-colors hover:text-primary"
                            >
                              {fight.opponentName ?? "Oponente desconocido"}
                            </Link>
                          ) : (
                            (fight.opponentName ?? "Oponente desconocido")
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-sm px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-wide ${resultClass}`}
                          >
                            {resultLabel}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatMethod(fight.method)}
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {fight.endRound ?? "—"}
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {fight.endTime ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            title={promotionLabel}
                            className={`inline-flex max-w-36 items-center rounded-sm px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${promotionClass}`}
                          >
                            <span className="truncate">{promotionLabel}</span>
                          </span>
                        </TableCell>
                        <TableCell className="font-display text-sm font-bold uppercase tracking-tight text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {fight.isTitleFight ? (
                              <Trophy
                                aria-label="Pelea por el título"
                                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                              />
                            ) : null}
                            {fight.eventId ? (
                              <Link
                                href={`/eventos/${fight.eventId}`}
                                className="transition-colors hover:text-primary"
                              >
                                {fight.eventName ?? "Evento desconocido"}
                              </Link>
                            ) : (
                              (fight.eventName ?? "Evento desconocido")
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {/* El historial solo contiene combates disputados
                              (la query excluye los programados), así que
                              siempre hay pelea que ver. */}
                          <a
                            href={resolveFightVideoUrl(
                              fight.videoUrl,
                              fighter.name,
                              fight.opponentName ?? "",
                              fight.eventName ?? undefined,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Ver el combate ${fighter.name} vs ${fight.opponentName ?? "oponente"}`}
                            className="inline-flex items-center gap-1.5 font-medium text-primary transition-colors hover:text-primary/80"
                          >
                            <Play className="size-3.5" />
                            Ver
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <Card className="border-dashed border-border bg-card">
            <CardContent className="px-6 py-16 text-center text-muted-foreground">
              Sin peleas registradas.
            </CardContent>
          </Card>
        )}
      </section>

      {detail.fighterFacts.length > 0 || detail.fighterQa.length > 0 ? (
        <section id="info" className="scroll-mt-24 space-y-6">
          <SectionHeading
            eyebrow="Info"
            title={`Conoce a ${fighter.name}`}
            description="Datos y respuestas del propio luchador, publicados por la UFC y traducidos al español."
          />
          <div
            className={`grid gap-4 ${
              detail.fighterFacts.length > 0 && detail.fighterQa.length > 0
                ? "lg:grid-cols-[1fr_1.4fr]"
                : ""
            }`}
          >
            {detail.fighterFacts.length > 0 ? (
              <div className="self-start overflow-hidden rounded-lg border border-border bg-card">
                <div className="border-b border-border px-5 py-3">
                  <h3 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                    Datos del luchador
                  </h3>
                </div>
                <ul className="space-y-3 p-5">
                  {detail.fighterFacts.map((fact, index) => (
                    <li
                      key={index}
                      className="flex gap-3 text-sm leading-6 text-muted-foreground"
                    >
                      <span
                        aria-hidden
                        className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary"
                      />
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {detail.fighterQa.length > 0 ? (
              <div className="self-start overflow-hidden rounded-lg border border-border bg-card">
                <div className="border-b border-border px-5 py-3">
                  <h3 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                    Preguntas y respuestas
                  </h3>
                </div>
                <div className="divide-y divide-border">
                  {detail.fighterQa.map((item, index) => (
                    <details key={index} className="group px-5 py-3.5">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-display text-sm font-bold uppercase tracking-tight text-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                        {item.q}
                        <ChevronDown
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <p className="pt-2.5 text-sm leading-6 text-muted-foreground">{item.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="space-y-6">
        <SectionHeading
          eyebrow={showUpcoming ? "Calendario" : "Noticias"}
          title={
            showUpcoming
              ? `Próximos combates de ${fighter.name}`
              : `Cobertura más reciente sobre ${fighter.name}`
          }
          description={
            showUpcoming
              ? "Peleas programadas en eventos próximos según el calendario actual."
              : "Artículos vinculados a este luchador o que lo mencionan por nombre, ordenados por fecha de publicación."
          }
        />
        <div className="grid gap-4">
          {news.length ? (
            news.map((article) => (
              <Card
                key={article.id}
                className="border-border bg-card transition hover:border-primary/30 hover:bg-accent"
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge className="border-primary/20 bg-primary/10 text-primary">
                          {formatNewsCategory(article.category)}
                        </Badge>
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          {article.source ?? "Fuente desconocida"}
                        </Badge>
                      </div>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xl font-semibold text-foreground transition hover:text-primary"
                      >
                        {article.headline}
                      </a>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatDate(article.publishedAt)}</p>
                  </div>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {article.summary?.length
                      ? article.summary.length > 180
                        ? `${article.summary.slice(0, 180).trimEnd()}…`
                        : article.summary
                      : "No hay resumen disponible para este artículo."}
                  </p>
                  <div className="border-t border-border pt-4">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-primary transition hover:text-primary/80"
                    >
                      Leer artículo →
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : showUpcoming ? (
            <UpcomingBouts bouts={upcomingBouts} division={detail.latestWeightClass} />
          ) : (
            <Card className="border-dashed border-border bg-card">
              <CardContent className="px-6 py-16 text-center text-muted-foreground">
                Aún no hay artículos de noticias relacionados con este luchador.
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
