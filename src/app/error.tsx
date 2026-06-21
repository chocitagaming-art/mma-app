"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Error boundary global: toda ruta lee de Neon en vivo en cada request, así que un fallo
// de la BD (o cualquier excepción de render) caería en la pantalla de error por defecto de
// Next. Esto la sustituye por un estado de marca, recuperable con reset(). Debe ser Client
// Component y recibe { error, reset } (convención del App Router).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Deja rastro en consola; punto natural para enganchar monitoring (Sentry) más adelante.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <Card className="w-full border-border bg-card">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Error
          </p>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground">
            La transmisión se cortó
          </h1>
          <p className="max-w-lg text-muted-foreground">
            No pudimos cargar los datos en este momento. Suele ser temporal —
            normalmente un hipo de la base de datos. Reintenta en unos segundos.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={reset}>Reintentar</Button>
            <Link href="/">
              <Button variant="outline">Volver al inicio</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
