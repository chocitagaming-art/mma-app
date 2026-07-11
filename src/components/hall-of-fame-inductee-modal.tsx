"use client";

import { Play, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { FighterHeadshot } from "@/components/fighter-headshot";
import type { HofInductee } from "@/lib/queries/hall-of-fame";
import { buildFightVideoSearchUrl } from "@/lib/video";

// Modal del Salón para Contributor y Fight (las alas SIN ficha propia): al clicar
// una card se abre aquí, foto grande + bio, sin navegar fuera de la página. Sigue
// el patrón de VideoModal (portal a body, aria-modal, Escape, scroll-lock, foco).
// Modern/Pioneer no lo usan: siguen enlazando a la ficha del luchador.
export function HallOfFameInducteeModal({
  inductee,
  onClose,
}: {
  inductee: HofInductee;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Devuelve el foco a la card que abrió el modal (accesibilidad).
      prevFocused?.focus?.();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
    >
      {/* Clics dentro no cierran (no burbujean al backdrop). */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-amber-400/30 bg-card p-6 shadow-2xl"
      >
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
        {inductee.wing === "fight" ? (
          <FightBody inductee={inductee} titleId={titleId} />
        ) : (
          <PersonBody inductee={inductee} titleId={titleId} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function ClassLine({ prefix, year }: { prefix?: string; year: number | null }) {
  return (
    <p className="mt-1 flex items-center justify-center gap-1.5 font-mono text-xs text-muted-foreground">
      <Trophy className="size-3 text-amber-400" aria-hidden />
      {prefix ? `${prefix} · ` : ""}
      {year ? `Clase de ${year}` : "Salón de la Fama"}
    </p>
  );
}

// Contributor: retrato (o iniciales si aún no hay foto curada) + rol + bio.
function PersonBody({
  inductee,
  titleId,
}: {
  inductee: HofInductee;
  titleId: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <FighterHeadshot
        name={inductee.displayName}
        headshotUrl={inductee.photoUrl}
        size="xl"
        priority
        className="border-2 border-amber-400/60 shadow-[0_0_24px_rgba(251,191,36,0.15)]"
      />
      <div>
        <h2
          id={titleId}
          className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-foreground"
        >
          {inductee.displayName}
        </h2>
        {inductee.subtitle ? (
          <p className="mt-1 text-sm font-semibold text-amber-400">{inductee.subtitle}</p>
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

// Fight: título + las dos esquinas (enlazan a sus fichas) + bio + "Ver combate".
function FightBody({
  inductee,
  titleId,
}: {
  inductee: HofInductee;
  titleId: string;
}) {
  const videoUrl = buildFightVideoSearchUrl(
    inductee.cornerAName ?? "",
    inductee.cornerBName ?? "",
    inductee.subtitle ?? undefined,
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2
          id={titleId}
          className="font-display text-xl font-bold uppercase leading-tight tracking-tight text-foreground"
        >
          {inductee.displayName}
        </h2>
        <ClassLine prefix={inductee.subtitle ?? undefined} year={inductee.inducteeYear} />
      </div>
      <div className="flex items-start justify-center gap-4">
        <CornerLink id={inductee.cornerAId} name={inductee.cornerAName} headshot={inductee.cornerAHeadshot} />
        <span className="mt-6 font-display text-2xl font-extrabold text-primary">VS</span>
        <CornerLink id={inductee.cornerBId} name={inductee.cornerBName} headshot={inductee.cornerBHeadshot} />
      </div>
      {inductee.bio ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {inductee.bio}
        </p>
      ) : null}
      <a
        href={videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Play className="size-4 fill-current" aria-hidden /> Ver combate
      </a>
    </div>
  );
}

function CornerLink({
  id,
  name,
  headshot,
}: {
  id: number | null;
  name: string | null;
  headshot: string | null;
}) {
  const inner = (
    <div className="flex w-24 flex-col items-center gap-1.5">
      <FighterHeadshot name={name ?? "?"} headshotUrl={headshot} size="lg" className="border border-border" />
      <span className="line-clamp-2 text-center font-display text-sm font-bold uppercase leading-tight tracking-tight text-foreground">{name ?? "—"}</span>
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
