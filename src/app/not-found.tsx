import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <Card className="w-full border-border bg-card">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            No encontrado
          </p>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground">
            Esta página salió de la jaula
          </h1>
          <p className="max-w-lg text-muted-foreground">
            El peleador o la pelea que solicitaste no está disponible en el conjunto de datos actual.
          </p>
          <Link href="/">
            <Button>Volver al inicio</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}