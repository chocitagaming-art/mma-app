"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// El panel se mira sobre todo cuando algo está pasando: una velada en marcha, un
// despliegue recién hecho. En esos momentos, un dato de hace diez minutos es
// peor que no tener panel, porque se toman decisiones sobre él.
//
// `router.refresh()` y no `location.reload()`: Next vuelve a pedir solo el árbol
// de servidor y reconcilia, así que no parpadea la página ni se pierde el scroll
// — y sin parpadeo el reloj de al lado se puede leer mientras se actualiza.
// Con una velada en marcha el panel es una retransmisión: el bucle escribe cada
// 20 s, así que a 15 s el registro se ve moverse de verdad y el watchdog se nota
// trabajando. Eso NO se toca: durante una velada la base está despierta de todas
// formas porque el bucle está escribiendo, así que el panel no cuesta nada extra.
//
// En reposo es otra historia. `obtenerEstado()` lanza NUEVE consultas por
// refresco, varias de ellas agregaciones sobre el catálogo entero. A 60 s, una
// pestaña del panel abierta y olvidada eran 540 consultas por hora y, peor aún,
// impedía que Neon se suspendiera nunca: el autosuspend es a los 5 minutos y el
// panel llamaba cada uno. 300 s deja el hueco de inactividad por encima del
// umbral, que es justo lo que hay que conseguir. Para un panel en reposo, cinco
// minutos de antigüedad no cambian ninguna decisión.
const EN_REPOSO = 300;
const EN_VELADA = 15;

export function AutoRefresco({ enVelada = false }: { enVelada?: boolean }) {
  const cada = enVelada ? EN_VELADA : EN_REPOSO;
  const router = useRouter();
  const [restan, setRestan] = useState(cada);

  useEffect(() => {
    const t = setInterval(() => {
      setRestan((n) => {
        if (n <= 1) {
          router.refresh();
          return cada;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [router, cada]);

  return (
    <button
      type="button"
      onClick={() => {
        router.refresh();
        setRestan(cada);
      }}
      className="inline-flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-border hover:text-foreground"
      aria-label="Actualizar ahora"
    >
      {/* La cuenta atrás hace visible que el panel está VIVO. Sin ella, un panel
          congelado por un error de red es indistinguible de uno donde no pasa
          nada — y en este panel «no pasa nada» es justo lo que hay que creerse. */}
      <span
        className={`size-1.5 animate-pulse rounded-full ${enVelada ? "bg-corner-red" : "bg-win"}`}
        aria-hidden
      />
      {restan}s
    </button>
  );
}
