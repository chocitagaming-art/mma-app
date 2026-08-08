import Link from "next/link";

import { cn } from "@/lib/utils";

// LA PUERTA ENTRE LOS DOS DESPACHOS.
//
// El panel son dos rutas con dos preguntas distintas —`/estado` («¿el sitio
// está sano?») y `/directo` («¿se está grabando AHORA?»)— y el dueño pidió
// «tenerlo todo junto». Fusionarlas sería peor: el veredicto de la velada
// quedaría enterrado bajo el catálogo y las fotos, justo cuando hay que verlo
// en dos segundos con el móvil en una mano. Lo que sobraba era la fricción de
// recordar DOS urls, y eso lo arregla una puerta, no una mudanza.
//
// 🔑 LA CLAVE VIAJA EN EL ENLACE, y es deliberado: sin ella el destino
// responde 404 igual que una URL inventada (ver `proxy.ts`), así que un enlace
// pelado llevaría a una puerta cerrada. No filtra nada nuevo — la clave ya está
// en la URL desde la que se hace clic, y el salto es al mismo dominio.
//
// `prefetch={false}`: sin esto Next pediría el destino al pasar el ratón por
// encima, y en un panel que se refresca solo cada 15 s durante una velada eso
// son consultas a Neon que nadie ha pedido.

export function EnlacePanel({
  a,
  clave,
  className,
}: {
  /** A qué despacho se va desde aquí. */
  a: "estado" | "directo";
  /** La clave con la que se entró, para no dejar al otro fuera. */
  clave: string;
  className?: string;
}) {
  const destino = a === "directo" ? "/directo" : "/estado";
  const texto = a === "directo" ? "Control del directo" : "Estado del sistema";
  const detalle = a === "directo" ? "¿se está grabando?" : "¿está sano el sitio?";

  return (
    <Link
      href={`${destino}?k=${encodeURIComponent(clave)}`}
      prefetch={false}
      className={cn(
        "group flex items-baseline justify-between gap-3 rounded-lg border border-border/60 px-4 py-3",
        "transition hover:border-border hover:bg-muted/40",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
          Ir al otro despacho
        </span>
        <span className="mt-0.5 block font-display text-sm font-bold uppercase tracking-tight">
          {texto}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[0.6rem] text-muted-foreground">{detalle}</span>
        <span className="mt-0.5 block font-mono text-xs text-muted-foreground transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </Link>
  );
}
