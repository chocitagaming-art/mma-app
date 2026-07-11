"use client";

import Link from "next/link";

import { useLiveNow } from "@/components/live/use-live-now";
import { Button } from "@/components/ui/button";

// T3-A (pedido del dueño): botón "Ver en directo" que aparece cuando el evento
// se aproxima (fase pre, <24 h) o ya está en marcha, y lleva a /en-vivo — el
// mismo destino que el chip HOY/EN VIVO del header. Es cliente (fetch tras
// montar) para poder vivir en superficies ISR como el hero de la home; vale
// para CUALQUIER evento futuro, no solo el de esta noche.
export function LiveCtaButton() {
  const payload = useLiveNow();

  if (!payload || payload.phase === "none") {
    return null;
  }

  return (
    <Link href="/en-vivo">
      <Button size="lg" className="h-10 gap-2">
        <span className="live-dot inline-block size-2 rounded-full bg-primary-foreground shadow-[0_0_8px_1px_rgba(255,255,255,0.6)]" />
        {payload.live ? "Ver en directo" : "Ver en directo (hoy)"}
      </Button>
    </Link>
  );
}
