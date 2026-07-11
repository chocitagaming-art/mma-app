"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

// T3-A: /en-vivo es server-rendered (force-dynamic); este componente refresca
// el router cada `intervalSeconds` para traer los resultados que live-results
// va escribiendo en la BD. router.refresh() re-renderiza en el servidor
// CONSERVANDO el estado cliente (scroll, acordeones), así que la página "se
// actualiza sola" sin recargar. Con la pestaña oculta no se refresca (ahorra
// invocaciones); al volver, si el dato quedó rancio, refresca al momento.
const emptySubscribe = () => () => {};

export function AutoRefresh({ intervalSeconds = 45 }: { intervalSeconds?: number }) {
  const router = useRouter();
  // SSR-safe (patrón event-countdown): el servidor no tiene reloj del cliente,
  // así que hasta montar se pinta el estado estático "en directo".
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setLastRefresh(Date.now());
      router.refresh();
    };

    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, intervalSeconds * 1_000);

    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefresh > intervalSeconds * 1_000
      ) {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalSeconds, lastRefresh]);

  const seconds = mounted
    ? Math.max(0, Math.floor((now - lastRefresh) / 1_000))
    : null;

  return (
    <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
      <span className="live-dot inline-block size-1.5 rounded-full bg-primary shadow-[0_0_8px_1px_var(--primary)]" />
      {seconds != null
        ? `Actualizado hace ${seconds} s · se actualiza solo`
        : "Actualización automática activada"}
    </p>
  );
}
