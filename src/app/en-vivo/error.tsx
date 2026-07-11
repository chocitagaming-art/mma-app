"use client";

import { useEffect } from "react";

// T3-A (revisión adversarial, HIGH): un hipo transitorio de la BD durante un
// router.refresh() automático caía en el error boundary RAÍZ, que desmonta
// AutoRefresh y deja /en-vivo muerta hasta un clic manual — inaceptable en la
// única página pensada para quedarse abierta toda la velada. Este boundary
// local REINTENTA SOLO cada 15 s: si la BD ya se recuperó, reset() re-renderiza
// el segmento y el directo vuelve sin intervención.
export default function LiveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    const id = setTimeout(() => reset(), 15_000);
    return () => clearTimeout(id);
  }, [error, reset]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <p className="flex items-center justify-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        <span className="live-dot inline-block size-2 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
        Reconectando con el directo
      </p>
      <h1 className="mt-2 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl">
        Un momento…
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Se cortó la conexión con los datos. Reintentamos automáticamente en
        unos segundos; no hace falta recargar.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 inline-flex items-center gap-2 rounded-md border border-primary px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
      >
        Reintentar ahora
      </button>
    </div>
  );
}
