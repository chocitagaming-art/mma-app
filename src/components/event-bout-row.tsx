import Link from "next/link";

import { CountryFlag } from "@/components/country-flag";
import { EventBoutDisclosure } from "@/components/event-bout-disclosure";
import { FighterHeadshot } from "@/components/fighter-headshot";
import { computeAge } from "@/lib/fighter-highlights";
import {
  formatHeight,
  formatMethod,
  formatPercentage,
  formatReach,
  formatRecord,
  formatStance,
  formatWeightClass,
} from "@/lib/format";
import { marketFavorite, toAmericanOdds } from "@/lib/odds";
import { cn } from "@/lib/utils";
import type { EventBout, EventBoutFighter } from "@/lib/types";

// Fila del mini tale-of-the-tape (FE6): valor rojo | ETIQUETA | valor azul,
// versión compacta del TaleRow del bout view. Igual que allí, la ventaja se
// colorea solo cuando "más" es objetivamente mejor (altura/alcance).
function MiniTapeRow({
  label,
  red,
  blue,
  redNum,
  blueNum,
}: {
  label: string;
  red: string;
  blue: string;
  redNum?: number | null;
  blueNum?: number | null;
}) {
  const both = redNum != null && blueNum != null;
  const redBetter = both && (redNum as number) > (blueNum as number);
  const blueBetter = both && (blueNum as number) > (redNum as number);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/60 py-2 last:border-b-0 sm:gap-4">
      <p
        className={cn(
          "tabular min-w-0 break-words text-right text-sm font-semibold leading-tight",
          redBetter ? "text-corner-red" : "text-foreground",
        )}
      >
        {red}
      </p>
      <p className="w-20 text-center font-mono text-[0.6rem] uppercase leading-tight tracking-[0.12em] text-muted-foreground sm:w-24">
        {label}
      </p>
      <p
        className={cn(
          "tabular min-w-0 break-words text-left text-sm font-semibold leading-tight",
          blueBetter ? "text-corner-blue" : "text-foreground",
        )}
      >
        {blue}
      </p>
    </div>
  );
}

// Badge dorado compartido por TÍTULO (BE9b) y los bonos FOTN/POTN (BE3):
// mono pequeño, discreto, con tooltip nativo. El mismo estilo ámbar que ya
// usan prediction-section y market-model-comparison.
function GoldBadge({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-px font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      {children}
    </span>
  );
}

// Normaliza la fecha del evento a Date UTC: node-postgres entrega las columnas
// DATE como objeto Date en runtime aunque el tipo declare string (mismo gotcha
// que division-history.ts). undefined => computeAge usa "hoy".
function parseEventDate(eventDate?: string | Date | null): Date | undefined {
  if (!eventDate) {
    return undefined;
  }
  if (eventDate instanceof Date) {
    return Number.isNaN(eventDate.getTime()) ? undefined : eventDate;
  }
  const date = new Date(`${eventDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Panel desplegable con la comparativa física de ambas esquinas (FE6).
// Server-rendered: EventBoutDisclosure solo lo muestra/oculta.
function BoutTapePanel({
  bout,
  eventDate,
}: {
  bout: EventBout;
  eventDate?: string | Date | null;
}) {
  // Edad A FECHA DEL EVENTO: en carteleras pasadas la edad actual mentiría.
  const ageAt = parseEventDate(eventDate);
  const redAge = computeAge(bout.red.birthDate, ageAt);
  const blueAge = computeAge(bout.blue.birthDate, ageAt);

  return (
    <div className="border-t border-border/60 bg-muted/30 px-4 py-2.5 sm:px-5">
      <MiniTapeRow
        label="Altura"
        red={formatHeight(bout.red.heightCm)}
        blue={formatHeight(bout.blue.heightCm)}
        redNum={bout.red.heightCm}
        blueNum={bout.blue.heightCm}
      />
      <MiniTapeRow
        label="Alcance"
        red={formatReach(bout.red.reachCm)}
        blue={formatReach(bout.blue.reachCm)}
        redNum={bout.red.reachCm}
        blueNum={bout.blue.reachCm}
      />
      <MiniTapeRow
        label="Edad"
        red={redAge != null ? String(redAge) : "—"}
        blue={blueAge != null ? String(blueAge) : "—"}
      />
      <MiniTapeRow
        label="Guardia"
        red={formatStance(bout.red.stance)}
        blue={formatStance(bout.blue.stance)}
      />
    </div>
  );
}

// ¿Hay algo que comparar? Con dos esquinas sin ficha física (p.ej. TBD en
// eventos lejanos) el panel serían cuatro filas de "—": mejor sin chevron.
function hasTapeData(fighter: EventBoutFighter): boolean {
  return (
    fighter.heightCm != null ||
    fighter.reachCm != null ||
    fighter.stance != null ||
    fighter.birthDate != null
  );
}

type RowLayout = {
  row: string;
  redCorner: string;
  blueCorner: string;
  // The box of each face (twMerge overrides the size-* of FighterHeadshot's
  // `size`, which then only picks the initials' text size).
  headshot: string;
  // Spread onto FighterHeadshot. 🪤 Leave a prop OUT rather than undefined: it
  // is a client component, and React Flight writes a present undefined prop
  // into the RSC payload as "$undefined" (on every /en-vivo refresh).
  photo: { size: "sm" | "lg"; quality?: "hd"; sizes?: string };
  text: string;
  centre: string;
};

// The two ways of drawing the row (headshotSize). "default" is the existing
// row, class for class and prop for prop: on /eventos/[id], /en-vivo and
// /ufc-hoy neither the HTML nor the RSC payload changes (and on Saturday
// 31-oct /en-vivo carries the event).
//
// "large" is the home's «Último evento» (owner, 29-oct-2026: «ponemos las
// fotos de las cabezas más grandes y nítidas»): a 72 px face on phones and 96
// from sm, where it used to be 36/48. Measured on 29-oct (UFC 333 on the home,
// 360 to 1920): side by side, a bigger face eats the NAME's width — at 768 the
// red corner of the main event is 231 px and «Alexander Volkanovski» with his
// flag needs 151, so any face over 68 px beside it truncates it (and at 640
// the corners are 151-167 px). So below lg each corner STACKS
// (face on top, name and record under it, full corner width: 98 px at 360
// where the name had 52), and only from lg (corners of 335+ px) does the face
// go back beside the text, which still keeps 223+ px. The centre column stays
// as tall as the faces, so «VS» sits on their midline.
//
// Sharpness = file px / painted px × DPR. The 1.6:1 ufc.com face covers the
// square box minus its 1 px border: painted 112 px wide in the 72 box and 150
// in the 96 one, which is the exact `sizes`. The 256 copy is kept up to DPR
// 2.29 on phones (1x 2.29 · 2x 1.14) and 1.70 from sm (1x 1.70); above that
// the browser takes the ufc.com original (500-520 px): phone 3x 1.5, tablet
// and desktop 2x 1.7, 3x 1.1. Checked in Chromium and WebKit at 2x: phones
// keep the 256 copy, 768 and up take the original. ESPN faces (600×436, no
// srcset) are 4.6 at 1x and 1.5 at 3x in the 96 box.
const ROW_LAYOUTS: Record<"default" | "large", RowLayout> = {
  default: {
    row: "group grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3 transition-colors hover:bg-muted/50 sm:gap-4 sm:px-5",
    redCorner: "flex min-w-0 items-center gap-2.5 sm:gap-3",
    blueCorner: "flex min-w-0 flex-row-reverse items-center gap-2.5 text-right sm:gap-3",
    // F4: headshot más pequeño en móvil (36px) para dar aire al nombre; en sm+
    // vuelve a 48px (twMerge sobreescribe el size-12 de sizeClasses).
    headshot: "size-9 shrink-0 sm:size-12",
    photo: { size: "sm" },
    text: "min-w-0",
    centre: "flex shrink-0 flex-col items-center text-center",
  },
  large: {
    // items-start below lg: the corners grow downwards with their record, and
    // a centred short corner would put its face lower than the other one.
    row: "group grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-3 py-3 transition-colors hover:bg-muted/50 sm:gap-4 sm:px-5 lg:items-center",
    redCorner: "flex min-w-0 flex-col items-start gap-2 lg:flex-row lg:items-center lg:gap-4",
    blueCorner:
      "flex min-w-0 flex-col items-end gap-2 text-right lg:flex-row-reverse lg:items-center lg:gap-4",
    headshot: "size-18 shrink-0 sm:size-24",
    // "lg" only for the initials (text-2xl in a 72-96 px box).
    photo: { size: "lg", quality: "hd", sizes: "(min-width: 640px) 150px, 112px" },
    // w-full while stacked: the name truncates against the corner, not
    // against its own width.
    text: "w-full min-w-0 lg:w-auto",
    centre:
      "flex min-h-18 shrink-0 flex-col items-center justify-center text-center sm:min-h-24 lg:min-h-0",
  },
};

// showRanks: los badges de ranking usan el snapshot ACTUAL, así que solo
// tienen sentido en eventos futuros — en carteleras históricas el "#3" de hoy
// leería como el ranking que tenía el luchador al pelear, y sería falso.
// statsPanel (T3-A fase B): panel extra server-rendered (stats en vivo de
// /en-vivo) que se apila ENCIMA de la comparativa física dentro del mismo
// acordeón. Opcional y default off: /eventos/[id] y la home no cambian.
// headshotSize: "large" solo en el «Último evento» de la portada (ver
// ROW_LAYOUTS); por defecto, la fila de siempre.
export function EventBoutRow({
  bout,
  showRanks = false,
  eventDate,
  statsPanel,
  panelDefaultOpen = false,
  headshotSize = "default",
}: {
  bout: EventBout;
  showRanks?: boolean;
  eventDate?: string | Date | null;
  statsPanel?: React.ReactNode;
  panelDefaultOpen?: boolean;
  headshotSize?: "default" | "large";
}) {
  const layout = ROW_LAYOUTS[headshotSize];
  const redWon = bout.winnerId != null && bout.winnerId === bout.red.id;
  const blueWon = bout.winnerId != null && bout.winnerId === bout.blue.id;

  const resultLine = bout.method
    ? [formatMethod(bout.method), bout.endRound ? `R${bout.endRound}` : null, bout.endTime]
        .filter(Boolean)
        .join(" · ")
    : null;

  // Favorito del mercado (#41): solo si hay cuotas válidas en ambas esquinas.
  const fav = marketFavorite(bout.oddsRed, bout.oddsBlue);
  const favName = fav
    ? fav.favorite === "red"
      ? bout.red.name
      : bout.blue.name
    : null;
  const favImplied = fav
    ? fav.favorite === "red"
      ? fav.redImplied
      : fav.blueImplied
    : 0;
  const favOdds = fav
    ? fav.favorite === "red"
      ? bout.oddsRed
      : bout.oddsBlue
    : null;

  // Cuotas americanas por esquina (FE8): solo con cuota decimal válida (> 1),
  // para no pintar el "—" de toAmericanOdds cuando no hay línea.
  const redAmerican =
    bout.oddsRed != null && bout.oddsRed > 1 ? toAmericanOdds(bout.oddsRed) : null;
  const blueAmerican =
    bout.oddsBlue != null && bout.oddsBlue > 1 ? toAmericanOdds(bout.oddsBlue) : null;

  // La fila sigue siendo un único <Link> al detalle del combate; el borde
  // inferior vive ahora en el contenedor (fila + panel desplegable, FE6).
  const row = (
    <Link
      href={`/fights/${bout.fightId}`}
      data-testid="bout-row"
      className={layout.row}
    >
      {/* Esquina roja. data-bout-corner: e2e/careo-fotos.spec.ts mide que su
          primer hijo (el headshot) empiece a la altura del de la azul. */}
      <div
        data-bout-corner="red"
        className={layout.redCorner}
      >
        <FighterHeadshot
          name={bout.red.name}
          headshotUrl={bout.red.headshotUrl}
          division={bout.weightClass}
          {...layout.photo}
          className={cn(layout.headshot, redWon && "ring-2 ring-win")}
        />
        <div className={layout.text}>
          <p
            className={cn(
              "flex items-center gap-1.5 truncate font-display text-sm font-bold uppercase tracking-tight transition-colors group-hover:text-primary",
              redWon ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {/* F4: bandera oculta en móvil (pedido del dueño): libera ancho para
                que el nombre sea legible; vuelve en sm+. */}
            <CountryFlag
              nationality={bout.red.nationality}
              className="hidden sm:inline-block"
            />
            <span className="min-w-0 flex-1 truncate">{bout.red.name}</span>
            {showRanks && bout.red.rank != null ? (
              // Ranking actual de su división (FE2); 0 = campeón, estilo ufc.com.
              <span className="shrink-0 font-mono text-xs font-medium tracking-normal text-muted-foreground">
                {bout.red.rank === 0 ? "C" : `#${bout.red.rank}`}
              </span>
            ) : null}
          </p>
          {/* Cada pieza (récord, cuota, GANA) puede bajar entera de línea pero
              nunca partirse: a 390 px salía «28-7-0 -» / «118 GANA», y un «-118»
              partido se lee como «+118» (15-oct, e2e/evento-columna.spec.ts).
              🪤 Entre pieza y pieza va un ESPACIO de verdad, no un margen: con
              nowrap y sin espacio la línea entera no salta nunca y pisa el «VS»
              o la foto azul (lo cazó la revisión del 15-oct). */}
          <p className="font-mono text-xs tabular text-muted-foreground">
            <span className="whitespace-nowrap">
              {formatRecord(bout.red.wins, bout.red.losses, bout.red.draws)}
            </span>
            {redAmerican ? (
              <>
                {" "}
                <span className="whitespace-nowrap text-muted-foreground/70">{redAmerican}</span>
              </>
            ) : null}
            {redWon ? (
              <>
                {" "}
                <span className="whitespace-nowrap font-semibold text-win">GANA</span>
              </>
            ) : null}
            {/* BE3: bono "Actuación de la Noche". Vive en la línea del récord:
                en la del nombre (flex + truncate) el chip central de favorito
                lo aplastaba a ~0px en pantallas de 375px. */}
            {bout.red.isPotn ? (
              <>
                {" "}
                <GoldBadge title="Actuación de la Noche" className="tracking-normal">
                  POTN
                </GoldBadge>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Centro */}
      <div className={layout.centre}>
        <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          VS
        </span>
        {bout.weightClass ? (
          <span className="mt-0.5 hidden max-w-[8rem] truncate font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground sm:block">
            {formatWeightClass(bout.weightClass)}
          </span>
        ) : null}
        {/* BE9b: pelea por el título, junto a la categoría (visible también en móvil). */}
        {bout.isTitleFight ? (
          <GoldBadge title="Pelea por el título" className="mt-1">
            Título
          </GoldBadge>
        ) : null}
        {/* BE3: bono "Pelea de la Noche" (solo llega relleno en eventos pasados). */}
        {bout.isFotn ? (
          <GoldBadge title="Pelea de la Noche" className="mt-1">
            FOTN
          </GoldBadge>
        ) : null}
        {/* Resultado (método · round · tiempo): lo más destacado de la fila en
            una cartelera pasada. Negrita + color de primer plano y en UNA sola
            línea (whitespace-nowrap, sin el truncate que cortaba el "5:00").
            Sigue oculto en móvil (hidden sm:block) para no comerle el ancho a
            los nombres — decisión responsive de F4. */}
        {resultLine ? (
          <span className="mt-1 hidden whitespace-nowrap font-mono text-[0.65rem] font-bold text-foreground sm:block">
            {resultLine}
          </span>
        ) : null}
        {fav ? (
          // hidden sm:inline-flex (revisión adversarial): a 390px este chip
          // comprimía las esquinas hasta dejar los NOMBRES a 0px de ancho —
          // en móvil ganan los nombres, como ya hacen categoría y resultado.
          <span
            className="mt-1 hidden max-w-[7rem] items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-primary sm:inline-flex sm:max-w-[9rem]"
            title={`Favorito del mercado: ${favName}${favOdds != null ? ` · cuota ${favOdds.toFixed(2)}` : ""}`}
          >
            <span className="truncate">{favName}</span>
            <span className="tabular text-primary/80">
              {formatPercentage(favImplied)}
            </span>
          </span>
        ) : null}
      </div>

      {/* Esquina azul */}
      <div
        data-bout-corner="blue"
        className={layout.blueCorner}
      >
        <FighterHeadshot
          name={bout.blue.name}
          headshotUrl={bout.blue.headshotUrl}
          division={bout.weightClass}
          {...layout.photo}
          className={cn(layout.headshot, blueWon && "ring-2 ring-win")}
        />
        <div className={layout.text}>
          <p
            className={cn(
              "flex flex-row-reverse items-center gap-1.5 truncate font-display text-sm font-bold uppercase tracking-tight transition-colors group-hover:text-primary",
              blueWon ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {/* F4: bandera oculta en móvil (pedido del dueño). */}
            <CountryFlag
              nationality={bout.blue.nationality}
              className="hidden sm:inline-block"
            />
            <span className="min-w-0 flex-1 truncate">{bout.blue.name}</span>
            {showRanks && bout.blue.rank != null ? (
              // flex-row-reverse: el badge queda a la IZQUIERDA del nombre (espejo de la roja).
              <span className="shrink-0 font-mono text-xs font-medium tracking-normal text-muted-foreground">
                {bout.blue.rank === 0 ? "C" : `#${bout.blue.rank}`}
              </span>
            ) : null}
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {/* BE3: bono "Actuación de la Noche" en la línea del récord
                (espejo de la roja: el badge queda hacia el centro). */}
            {bout.blue.isPotn ? (
              <>
                <GoldBadge title="Actuación de la Noche" className="tracking-normal">
                  POTN
                </GoldBadge>{" "}
              </>
            ) : null}
            {blueWon ? (
              <>
                <span className="whitespace-nowrap font-semibold text-win">GANA</span>{" "}
              </>
            ) : null}
            {blueAmerican ? (
              <>
                <span className="whitespace-nowrap text-muted-foreground/70">{blueAmerican}</span>{" "}
              </>
            ) : null}
            <span className="whitespace-nowrap">
              {formatRecord(bout.blue.wins, bout.blue.losses, bout.blue.draws)}
            </span>
          </p>
        </div>
      </div>
    </Link>
  );

  // Sin datos físicos en ninguna esquina no hay comparativa que desplegar
  // (salvo que /en-vivo aporte un panel de stats: entonces sí hay acordeón).
  const tapePanel =
    hasTapeData(bout.red) || hasTapeData(bout.blue) ? (
      <BoutTapePanel bout={bout} eventDate={eventDate} />
    ) : null;

  if (!tapePanel && !statsPanel) {
    return <div className="border-b border-border last:border-b-0">{row}</div>;
  }

  return (
    <EventBoutDisclosure
      row={row}
      defaultOpen={panelDefaultOpen}
      toggleLabel={statsPanel ? "Ver estadísticas y comparativa" : undefined}
      panel={
        <>
          {statsPanel}
          {tapePanel}
        </>
      }
    />
  );
}
