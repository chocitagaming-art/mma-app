import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AutoRefresco } from "@/app/estado/auto-refresco";
import { EnlacePanel } from "@/app/estado/enlace-panel";
import { claveValidaDirecta } from "@/lib/estado/clave";
import { obtenerDirecto, type Directo, type NivelDirecto } from "@/lib/directo/consulta";
import { cn } from "@/lib/utils";

// EL CONTROL ROOM. Hermano de /estado y con su misma puerta, pero contesta a
// otra pregunta: /estado dice "¿el sitio está sano?" y esto dice "¿SE ESTÁ
// GRABANDO AHORA?". Sólo importa unas horas a la semana, y en esas horas es lo
// único que importa.
//
// Se mira desde el móvil, con la velada puesta en la tele. Por eso el veredicto
// ocupa media pantalla y lo demás es letra pequeña: a un metro sólo debería
// leerse si hay que levantarse o no.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const VEREDICTO: Record<NivelDirecto, { texto: string; sub: string; clase: string }> = {
  "sin-velada": {
    texto: "SIN VELADA",
    sub: "No hay ningún evento cerca. Nada que vigilar.",
    clase: "border-border bg-muted/30",
  },
  esperando: {
    texto: "EN ESPERA",
    sub: "La velada no ha empezado. Aún no hay nada que grabar.",
    clase: "border-border bg-muted/30",
  },
  grabando: {
    texto: "GRABANDO",
    sub: "Está entrando dato. No hay nada que hacer.",
    clase: "border-win/40 bg-win/10 text-win",
  },
  atencion: {
    texto: "CONVIENE MIRAR",
    sub: "Entra dato, pero no al ritmo que debería.",
    clase: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  },
  perdiendose: {
    texto: "SE ESTÁ PERDIENDO",
    sub: "La velada corre y no se está grabando.",
    clase: "border-corner-red/50 bg-corner-red/10 text-corner-red",
  },
};

function cuenta(segundos: number | null): string {
  if (segundos == null) return "—";
  const s = Math.abs(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const cuerpo = h > 0 ? `${h} h ${m} min` : `${m} min`;
  return segundos >= 0 ? `faltan ${cuerpo}` : `empezó hace ${cuerpo}`;
}

function desde(segundos: number | null): string {
  if (segundos == null) return "nunca";
  if (segundos < 90) return `hace ${segundos} s`;
  if (segundos < 5400) return `hace ${Math.floor(segundos / 60)} min`;
  return `hace ${Math.floor(segundos / 3600)} h`;
}

/**
 * La hora COMO LA PIENSA quien mira esto, que es la de Madrid y no UTC.
 *
 * 🪤 La primera versión pintaba UTC a secas («21:00Z») y el dueño preguntó, con
 * razón, por qué decía 21:00 si las preliminares son a las 23:00. El dato era
 * correcto —España va +2 en verano— pero le obligaba a restar de cabeza, y en un
 * panel que se mira con prisa la noche de una velada eso no es un defecto
 * estético: es hacerle creer que va tarde o pronto. Además era incoherente con
 * el resto del sitio, que ya pinta «Prelims 23:00».
 *
 * Se sigue la misma convención que el panel hermano (`estado/veredicto.ts`), que
 * ya lo tenía resuelto con el comentario «Hora de Madrid, que es la que usa quien
 * mira esto, no UTC».
 */
function hora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * El mismo instante en UTC, para la nota de al lado.
 *
 * No sobra: GitHub Actions, los logs de los runs y los crons hablan UTC, así que
 * cuando algo va mal hay que cruzar las dos horas. Tenerlas juntas evita la
 * resta mental justo en el momento en que uno se equivoca haciéndola.
 */
function utc(iso: string | null): string {
  if (!iso) return "";
  return `${new Date(iso).toISOString().slice(11, 16)}Z`;
}

function Dato({
  etiqueta, valor, nota, tono = "normal",
}: {
  etiqueta: string; valor: string; nota?: string;
  tono?: "normal" | "bien" | "ojo" | "mal";
}) {
  const color = {
    normal: "text-foreground", bien: "text-win",
    ojo: "text-amber-500", mal: "text-corner-red",
  }[tono];
  // El LED de cada fila: en un rack de control cada canal tiene su piloto, y de
  // un vistazo se ve cuál está en rojo sin leer una sola palabra.
  const led = {
    normal: "bg-muted-foreground/30", bien: "bg-win",
    ojo: "bg-amber-500", mal: "bg-corner-red animate-pulse",
  }[tono];
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="flex items-baseline gap-2.5 text-sm text-muted-foreground">
        <span className={cn("size-1.5 shrink-0 translate-y-[-1px] rounded-full", led)} aria-hidden />
        {etiqueta}
      </span>
      <span className="text-right">
        {/* tabular-nums: sin esto las cifras bailan entre refrescos y la columna
            deja de ser escaneable, que es justo para lo que existe. */}
        <span className={cn("font-mono text-sm tabular-nums", color)}>{valor}</span>
        {nota ? <span className="ml-2 font-mono text-[0.65rem] text-muted-foreground">{nota}</span> : null}
      </span>
    </li>
  );
}

/**
 * Cada bloque es un PUESTO de la sala, con su chapa numerada. La numeración no
 * es decoración: es el orden en que se miran cuando algo va mal —primero qué hay
 * en antena, luego si se está grabando, y sólo al final el resultado—.
 */
function Puesto({
  n, titulo, sub, children,
}: {
  n: string; titulo: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <span className="rounded-sm border border-border/70 px-1.5 py-px font-mono text-[0.6rem] tabular-nums text-muted-foreground">
          {n}
        </span>
        <h2 className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-foreground">
          {titulo}
        </h2>
        {sub ? (
          <span className="font-mono text-[0.6rem] normal-case tracking-normal text-muted-foreground/70">
            {sub}
          </span>
        ) : null}
      </div>
      <ul className="rounded-lg border border-border/60 px-4">{children}</ul>
    </section>
  );
}

function Cuerpo({ d, clave }: { d: Directo; clave: string }) {
  const v = VEREDICTO[d.nivel];
  const g = d.grabacion;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      {/* LA CHAPA DE LA PUERTA. Deliberadamente sobria: esto no es una página
          del sitio, es un cuarto de máquinas al que se entra con llave. */}
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
            MMA Status · Realización
          </p>
          <p className="mt-0.5 truncate font-display text-sm font-bold uppercase tracking-tight">
            Control del directo
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {/* EL TALLY. En un plató la luz roja se enciende cuando esa cámara
              está en antena, y aquí significa lo mismo: la ventana del directo
              está abierta. Es lo ÚNICO de esta página que depende del reloj, y
              por eso no dice "todo bien" — sólo dice "toca estar mirando". */}
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em]",
              d.ventanaAbierta
                ? "border-corner-red/50 bg-corner-red/10 text-corner-red"
                : "border-border/60 text-muted-foreground/70",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                d.ventanaAbierta ? "animate-pulse bg-corner-red" : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
            {d.ventanaAbierta ? "en ventana" : "fuera de ventana"}
          </span>
          <AutoRefresco enVelada={d.ventanaAbierta} />
        </div>
      </div>

      {/* EL VEREDICTO. Ocupa media pantalla a propósito: esto se mira desde el
          sofá con el móvil, y a esa distancia sólo debería leerse si hay que
          levantarse o no. */}
      <section className={cn("rounded-xl border px-5 py-6 text-center sm:py-8", v.clase)} aria-live="polite">
        <p className="font-display text-2xl font-black uppercase leading-none tracking-tight sm:text-3xl">
          {v.texto}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{v.sub}</p>
      </section>

      {/* EL PARTE, justo debajo del veredicto: es lo que dice qué hacer. */}
      {d.parte.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {d.parte.map((linea) => (
            <li key={linea} className="text-sm leading-relaxed text-muted-foreground">
              <span className="mr-2 text-muted-foreground/60">·</span>{linea}
            </li>
          ))}
        </ul>
      ) : null}

      {d.evento ? (
        <Puesto n="01" titulo="En antena" sub="qué se está emitiendo">
          <Dato etiqueta="Evento" valor={d.evento.nombre} nota={`id ${d.evento.id}`} />
          <Dato
            etiqueta="Primer combate"
            valor={hora(d.evento.primerCombateUtc)}
            nota={`${utc(d.evento.primerCombateUtc)} · ${cuenta(d.evento.faltanSegundos)}`}
          />
          <Dato etiqueta="Estelar" valor={hora(d.evento.estelarUtc)} nota={utc(d.evento.estelarUtc)} />
          {d.enCurso?.rojo ? (
            <Dato
              etiqueta="Ahora mismo"
              valor={`${d.enCurso.rojo} vs ${d.enCurso.azul ?? "—"}`}
              nota={`${d.enCurso.detalle ?? "—"} · as. ${d.enCurso.asalto ?? "?"} · ${d.enCurso.reloj ?? "--:--"}`}
            />
          ) : (
            <Dato etiqueta="Ahora mismo" valor="nada en curso" />
          )}
        </Puesto>
      ) : null}

      {g ? (
        <Puesto n="02" titulo="La grabación" sub="lo único que prueba que se está grabando">
          <Dato
            etiqueta="Muestras"
            valor={String(g.muestras)}
            nota="250+ es éxito"
            tono={g.muestras >= 250 ? "bien" : g.muestras > 0 ? "ojo" : d.ventanaAbierta ? "mal" : "normal"}
          />
          {/* EL RITMO ES LA FILA QUE IMPORTA, no el total: un total que no crece
              es un total muerto, y 200 muestras paradas parecen muchas. */}
          <Dato
            etiqueta="Ritmo"
            valor={`${g.ritmo5min} en 5 min`}
            tono={g.ritmo5min > 0 ? "bien" : d.ventanaAbierta ? "mal" : "normal"}
          />
          <Dato
            etiqueta="Última escritura"
            valor={desde(g.silencioSegundos)}
            tono={
              !d.ventanaAbierta ? "normal"
              : g.silencioSegundos != null && g.silencioSegundos > 180 ? "mal"
              : g.silencioSegundos != null && g.silencioSegundos > 60 ? "ojo" : "bien"
            }
          />
          <Dato etiqueta="Peleas con película" valor={String(g.peleasConPelicula)} />
          <Dato etiqueta="Filas vivas" valor={String(g.filasVivas)} nota="lo que pinta /en-vivo" />
        </Puesto>
      ) : null}

      {d.resultados ? (
        <Puesto n="03" titulo="Resultados" sub="lo que ya está sellado">
          <Dato
            etiqueta="Combates sellados"
            valor={`${d.resultados.conGanador} / ${d.resultados.total}`}
            nota={`${d.resultados.conMetodo} con método`}
            tono={d.resultados.total > 0 && d.resultados.conGanador === d.resultados.total ? "bien" : "normal"}
          />
        </Puesto>
      ) : null}

      <EnlacePanel a="estado" clave={clave} className="mt-6" />

      {/* Lo que este panel NO puede ver, dicho aquí para que nadie lo deduzca
          mal: la web sólo tiene DATABASE_URL, no habla con GitHub Actions. */}
      <p className="mt-8 text-xs leading-relaxed text-muted-foreground/70">
        Esto mira <strong>la base de datos</strong>, no GitHub Actions: sabe decir si entra dato,
        pero no si el bucle sigue vivo. Para eso está el despacho de terminal
        (<code className="font-mono">Projects/despacho</code>), que ve los dos mundos.
        <br />
        Y la franja roja de la portada <strong>no prueba nada</strong>: se enciende por reloj.
      </p>

      <p className="mt-4 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground/60">
        medido {hora(d.generadoUtc)} · {utc(d.generadoUtc)}
      </p>
    </div>
  );
}

export default async function DirectoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { k } = await searchParams;
  const clave = Array.isArray(k) ? k[0] : k;

  // notFound() y no 401: un 401 confirmaría que la ruta existe. Mismo criterio
  // que /estado, y por el mismo motivo — ver lib/estado/clave.ts.
  if (!claveValidaDirecta(clave)) {
    notFound();
  }

  return <Cuerpo d={await obtenerDirecto()} clave={clave} />;
}
