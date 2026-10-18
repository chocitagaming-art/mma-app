"use client";

import { Play, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { FighterHeadshot } from "@/components/fighter-headshot";
import { HofPhoto, useHofPhoto } from "@/components/hof-photo";
import { ClickToPlay } from "@/components/playback/click-to-play";
import { cornerLabels, fightClip, parsePhotoFocus, personPhotoUrl, photoMode } from "@/lib/hall-of-fame-display";
import type { HofInductee } from "@/lib/queries/hall-of-fame";
import { cn } from "@/lib/utils";
import { buildFightVideoSearchUrl } from "@/lib/video";

// Modal del Salón para Contributor y Fight (las alas SIN ficha propia): al clicar
// una card se abre aquí, foto grande + bio, sin navegar fuera de la página. Sigue
// el patrón de VideoModal (portal a body, aria-modal, Escape, scroll-lock, foco).
// Modern/Pioneer no lo usan: siguen enlazando a la ficha del luchador.
//
// 🪤 A diferencia de VideoModal, este modal NO es un bloqueador del turnero
// (useTurnBlocker): un bloqueador rechaza también el arranque del visitante
// ("blocked") y el ▶ de «Ver combate» no haría nada. Su reproductor está DENTRO
// del turnero (ClickToPlay), así que nunca hay dos a la vez.
//
// El foco NO sale del modal (QA, 18-oct): el resto de la página queda `inert`
// mientras está abierto, y dos centinelas devuelven Tab y Mayús+Tab al otro
// extremo del panel. Antes, con Tab se llegaba a las tarjetas de detrás y Enter
// abría otra pelea encima de esta.
//
// 🪤 Escape no llega desde dentro del reproductor: un iframe de otro origen
// (youtube-nocookie.com) se queda sus teclas, y tras arrancar con Enter el foco
// está ahí a propósito (useKeyboardStartFocus). Se sale con Mayús+Tab (pasa
// por los controles de YouTube y llega al ✕). Lo prueba e2e/salon.spec.ts.

const FOCUSABLE =
  'a[href], button:not([disabled]), iframe, input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("data-focus-sentinel"),
  );
}

export function HallOfFameInducteeModal({
  inductee,
  cutouts,
  onClose,
}: {
  inductee: HofInductee;
  cutouts: ReadonlyMap<string, boolean>;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const fight = inductee.wing === "fight";

  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Lo de detrás, fuera de alcance (teclado y lector de pantalla). Solo lo
    // que no era ya inert, para devolverlo tal cual.
    const dialog = dialogRef.current;
    const silenced = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== dialog && !el.inert,
    );
    for (const el of silenced) el.inert = true;
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      for (const el of silenced) el.inert = false;
      // Devuelve el foco a la card que abrió el modal (accesibilidad). Después
      // de quitar el inert: un elemento inert no acepta el foco.
      prevFocused?.focus?.();
    };
  }, [onClose]);

  // Los centinelas: al llegar a uno, el foco salta al otro extremo del panel.
  const wrapToEnd = () => focusables(panelRef.current).at(-1)?.focus();
  const wrapToStart = () => closeRef.current?.focus();

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
    >
      {/* Clics dentro no cierran (no burbujean al backdrop). El Ala de Combate
          va más ancha: el reproductor 16:9 sale de 720 px en vez de 464. */}
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative max-h-[85vh] w-full overflow-y-auto rounded-xl border border-amber-400/30 bg-card shadow-2xl",
          fight ? "max-w-3xl p-4 sm:p-6" : "max-w-lg p-6",
        )}
      >
        <span tabIndex={0} data-focus-sentinel onFocus={wrapToEnd} className="sr-only" />
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
        {fight ? (
          <FightBody inductee={inductee} titleId={titleId} />
        ) : (
          <PersonBody inductee={inductee} cutouts={cutouts} titleId={titleId} />
        )}
        <span tabIndex={0} data-focus-sentinel onFocus={wrapToStart} className="sr-only" />
      </div>
    </div>,
    document.body,
  );
}

function ClassLine({ prefix, year }: { prefix?: string; year: number | null }) {
  return (
    <p className="mt-1 flex items-center justify-center gap-1.5 font-mono text-xs text-muted-foreground">
      <Trophy className="size-3 text-amber-600 dark:text-amber-400" aria-hidden />
      {prefix ? `${prefix} · ` : ""}
      {year ? `Clase de ${year}` : "Salón de la Fama"}
    </p>
  );
}

// Contributor: retrato (o silueta si aún no hay foto curada) + rol + bio. El
// retrato oficial 16:9 de ufc.com se ve ENTERO aquí (hay sitio); en la tarjeta
// va recortado a la cara.
function PersonBody({
  inductee,
  cutouts,
  titleId,
}: {
  inductee: HofInductee;
  cutouts: ReadonlyMap<string, boolean>;
  titleId: string;
}) {
  const url = personPhotoUrl(inductee);
  const photo = useHofPhoto(url, photoMode(url, cutouts));
  const wide = photo.mode === "framed" && photo.src != null && parsePhotoFocus(inductee.photoFocus) != null;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className={cn("flex justify-center", wide ? "w-full pt-6" : photo.mode === "cut" ? "h-56 w-full" : "")}>
        <HofPhoto
          name={inductee.displayName}
          photo={photo}
          focus={inductee.photoFocus}
          variant="modal"
          wide={wide}
          priority
        />
      </div>
      <div>
        <h2
          id={titleId}
          className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-foreground"
        >
          {inductee.displayName}
        </h2>
        {inductee.subtitle ? (
          <p className="mt-1 text-sm font-semibold text-amber-700 dark:text-amber-400">{inductee.subtitle}</p>
        ) : null}
        <ClassLine year={inductee.inducteeYear} />
      </div>
      {inductee.bio ? (
        <p className="whitespace-pre-line text-left text-sm leading-relaxed text-muted-foreground">
          {inductee.bio}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">Biografía próximamente.</p>
      )}
    </div>
  );
}

// Fight: título + «Ver combate» (la pelea completa, aquí dentro) + las dos
// esquinas (enlazan a sus fichas) + bio.
function FightBody({
  inductee,
  titleId,
}: {
  inductee: HofInductee;
  titleId: string;
}) {
  const clip = fightClip(inductee);
  const event = inductee.subtitle ?? undefined;
  const labels = cornerLabels(inductee);
  return (
    <div className="flex flex-col gap-4">
      <div className="px-8 text-center">
        <h2
          id={titleId}
          className="font-display text-xl font-bold uppercase leading-tight tracking-tight text-foreground"
        >
          {inductee.displayName}
        </h2>
        <ClassLine prefix={event} year={inductee.inducteeYear} />
      </div>
      {clip ? (
        // Póster PROPIO: nada de Google (ni la miniatura) hasta el clic. En 4 de
        // las 11 la miniatura de YouTube sería la del maratón, no la de la pelea.
        <ClickToPlay
          videoId={clip.videoId}
          start={clip.start}
          end={clip.end}
          title={`Pelea completa: ${inductee.displayName}`}
          label={event ? `Ver combate · ${event}` : "Ver combate"}
          note="Pelea completa"
          tone="gold"
          // En un móvil en horizontal (740×360) el 16:9 a todo lo ancho era
          // más alto que el modal y los controles de YouTube quedaban debajo:
          // el ancho se limita por la altura que deja el panel (85vh menos
          // título y rellenos). El mínimo de 202 px de ClickToPlay se mantiene.
          className="mx-auto max-w-[calc((85vh_-_8rem)*16/9)] rounded-lg"
        />
      ) : null}
      <div className="flex items-start justify-center gap-4">
        <CornerLink id={inductee.cornerAId} name={inductee.cornerAName} label={labels.a} headshot={inductee.cornerAHeadshot} />
        <span className="mt-6 font-display text-2xl font-extrabold text-primary">VS</span>
        <CornerLink id={inductee.cornerBId} name={inductee.cornerBName} label={labels.b} headshot={inductee.cornerBHeadshot} />
      </div>
      {inductee.bio ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {inductee.bio}
        </p>
      ) : null}
      {clip ? null : (
        // Sin vídeo guardado (una clase futura): la búsqueda en YouTube de siempre.
        <a
          href={buildFightVideoSearchUrl(inductee.cornerAName ?? "", inductee.cornerBName ?? "", event)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Play className="size-4 fill-current" aria-hidden /> Ver combate
        </a>
      )}
    </div>
  );
}

function CornerLink({
  id,
  name,
  label,
  headshot,
}: {
  id: number | null;
  // fighters.name (FighterHeadshot finds the local photo by it) and what the
  // corner says (cornerLabels: the title's spelling, with its accents).
  name: string | null;
  label: string | null;
  headshot: string | null;
}) {
  const inner = (
    <div className="flex w-24 flex-col items-center gap-1.5">
      {/* quality="hd" (Salón HD): the 64 px face is painted 102 px wide, so a
          3x phone takes the 500 original and 1x/2x keep the stored 256. */}
      <FighterHeadshot
        name={name ?? "?"}
        headshotUrl={headshot}
        size="md"
        quality="hd"
        className="border border-amber-400/50"
      />
      <span className="line-clamp-2 text-center font-display text-sm font-bold uppercase leading-tight tracking-tight text-foreground">{label ?? "—"}</span>
    </div>
  );
  if (!id) return inner;
  return (
    <Link
      href={`/fighters/${id}`}
      className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {inner}
    </Link>
  );
}
