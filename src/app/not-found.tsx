import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <Card className="w-full border-white/10 bg-white/5">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-red-300">
            No encontrado
          </p>
          <h1 className="text-4xl font-semibold text-white">Esta página salió de la jaula</h1>
          <p className="max-w-lg text-zinc-400">
            El peleador o la pelea que solicitaste no está disponible en el conjunto de datos actual.
          </p>
          <Link href="/">
            <Button className="bg-red-500 text-white hover:bg-red-400">
              Volver al inicio
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}