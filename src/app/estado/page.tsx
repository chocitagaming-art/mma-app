import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AutoRefresco } from "@/app/estado/auto-refresco";
import { claveValidaDirecta } from "@/lib/estado/clave";
import { obtenerEstado } from "@/lib/estado/consulta";
import type { Comprobacion, Nivel } from "@/lib/estado/veredicto";
import { cn } from "@/lib/utils";

// Un estado cacheado miente sobre el estado. Mismo criterio que /api/health.
export const dynamic = "force-dynamic";

// `noindex` y NO tocar robots.txt: el robots es público, así que un
// `Disallow: /estado` sería un cartel anunciando la ruta. Se esconde no
// enlazándola desde ningún sitio, dejándola fuera del sitemap, y devolviendo la
// página de "no encontrado" a quien llegue sin clave — indistinguible de
// cualquier URL inventada.
export const metadata: Metadata = {
  title: "Estado",
  robots: { index: false, follow: false, nocache: true },
};

// LA FIRMA DEL PANEL: la tarjeta de puntuación de los jueces. En una scorecard
// oficial cada fila lleva la marca de esquina a la izquierda y el número
// alineado a la derecha en cifras tabulares. Aquí cada comprobación es un
// asalto, y el veredicto es su puntuación.
//
// Por eso el color va en una BANDA, no en una pastilla ni en un emoji de
// semáforo: en la banda el color es estructura (te lleva el ojo por la columna
// hasta el problema) y en la pastilla es decoración. Escaneando de arriba abajo,
// una banda roja entre veinte verdes salta sola.
// Los colores salen de los tokens del sitio, no de la paleta genérica de
// Tailwind: `win` es el verde de la báscula que valida el peso, `corner-red` el
// rojo de la esquina roja y `chart-3` el naranja de aviso. Son los mismos que
// usa el resto de la web, así que el panel pertenece a este producto y no
// parece un dashboard cualquiera pegado encima.
const BANDA: Record<Nivel, string> = {
  ok: "bg-win",
  aviso: "bg-chart-3",
  mal: "bg-corner-red",
};

const VALOR: Record<Nivel, string> = {
  ok: "text-foreground",
  aviso: "text-chart-3",
  mal: "text-corner-red font-bold",
};

// El veredicto de arriba se lee ANTES que nada. Es la única pregunta que trae
// aquí al dueño: ¿tengo que hacer algo ahora mismo?
const VEREDICTO: Record<Nivel, { texto: string; sub: string; clase: string }> = {
  ok: {
    texto: "TODO EN ORDEN",
    sub: "No hay nada que hacer.",
    clase: "border-win/30 bg-win/[0.06] text-win",
  },
  aviso: {
    texto: "CONVIENE MIRAR",
    sub: "Nada roto, pero hay cosas a medias.",
    clase: "border-chart-3/30 bg-chart-3/[0.07] text-chart-3",
  },
  mal: {
    texto: "HAY ALGO ROTO",
    sub: "Mira las filas en rojo: dicen qué hacer.",
    clase: "border-corner-red/40 bg-corner-red/[0.07] text-corner-red",
  },
};

function Fila({ c }: { c: Comprobacion }) {
  return (
    <li className="relative flex items-start gap-3 py-3 pl-4 pr-1">
      {/* La banda de esquina. Redondeada solo por fuera, como el canto de una
          tarjeta oficial. */}
      <span
        className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-full", BANDA[c.nivel])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight text-foreground">{c.titulo}</p>
        {c.detalle ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.detalle}</p>
        ) : null}
      </div>
      {/* Tabular: los valores de una columna tienen que alinearse dígito con
          dígito, como en una scorecard. Sin esto, "14/14" y "9/14" bailan y la
          columna deja de ser escaneable. */}
      <span
        className={cn(
          "shrink-0 whitespace-nowrap pt-px font-mono text-sm tabular-nums",
          VALOR[c.nivel],
        )}
      >
        {c.valor}
      </span>
    </li>
  );
}

export default async function EstadoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { k } = await searchParams;
  const clave = Array.isArray(k) ? k[0] : k;

  // notFound() y no un 401: un 401 confirmaría que la ruta existe.
  if (!claveValidaDirecta(clave)) {
    notFound();
  }

  const estado = await obtenerEstado();
  const v = VEREDICTO[estado.nivel];
  const problemas = estado.bloques
    .flatMap((b) => b.comprobaciones)
    .filter((c) => c.nivel !== "ok").length;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
          Estado del sistema
        </p>
        <AutoRefresco enVelada={estado.veladaEnMarcha} />
      </div>

      {/* EL VEREDICTO. Ocupa mucho a propósito: es la única pregunta que trae
          aquí a nadie. Tipografía display (Saira) y no la del cuerpo — a un
          metro de distancia solo debería leerse esto. */}
      <section
        className={cn("rounded-xl border px-5 py-6 text-center sm:py-8", v.clase)}
        aria-live="polite"
      >
        <p className="font-display text-2xl font-black uppercase leading-none tracking-tight sm:text-3xl">
          {v.texto}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{v.sub}</p>
        {problemas > 0 ? (
          <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
            {problemas} {problemas === 1 ? "comprobación" : "comprobaciones"} sin pasar
          </p>
        ) : null}
      </section>

      <div className="mt-6 space-y-5">
        {estado.bloques.map((b) => (
          <section key={b.titulo} className="rounded-xl border border-border/70 bg-card">
            <header className="border-b border-border/60 px-4 py-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                {b.titulo}
              </h2>
              {b.subtitulo ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{b.subtitulo}</p>
              ) : null}
            </header>
            <ul className="divide-y divide-border/40 px-2 py-1">
              {b.comprobaciones.map((c) => (
                <Fila key={c.titulo} c={c} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* EL REGISTRO. Durante una velada esto se mueve solo: el bucle escribe
          cada 20 s y el panel se refresca cada 15. Cada línea es una fila que
          alguien escribió de verdad en la base, con su hora — no hay ni una
          frase inventada. Va en monoespaciada y con la hora delante porque es
          un parte de incidencias, no una lista de novedades. */}
      {estado.registro.length > 0 ? (
        <section className="mt-5 rounded-xl border border-border/70 bg-card">
          <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Lo último que ha pasado
            </h2>
            {estado.veladaEnMarcha ? (
              <span className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-corner-red">
                <span className="size-1.5 animate-pulse rounded-full bg-corner-red" aria-hidden />
                en directo
              </span>
            ) : null}
          </header>
          <ol className="divide-y divide-border/40">
            {estado.registro.map((a, i) => (
              <li
                key={`${a.hora}-${i}`}
                className="flex items-baseline gap-3 px-4 py-2 font-mono text-xs"
              >
                <span className="shrink-0 tabular-nums text-muted-foreground">{a.hora}</span>
                <span className="shrink-0 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                  {a.quien}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">{a.que}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="mt-6 text-center font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        Consultado {estado.generadoUtc.slice(11, 16)} UTC · {estado.generadoUtc.slice(0, 10)}
      </p>
    </div>
  );
}
