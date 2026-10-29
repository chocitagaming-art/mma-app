"use client";

import Link from "next/link";

import { useLiveNow } from "@/components/live/use-live-now";
import { Button } from "@/components/ui/button";
import { etiquetaCtaDirecto } from "@/lib/live-event";

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

  // 15 px and not lg's 16 (review, 29-oct-2026): on the up-next hero it sits
  // next to «Ver cartelera», and in the UFC voice at 16 px «Ver en directo
  // (hoy)» and «(mañana)» no longer shared one row with it at 390 and 414 px,
  // the commonest iPhones, on fight days. «Ver cartelera» goes to 15 too.
  return (
    <Link href="/en-vivo">
      <Button size="lg" className="h-10 gap-2 text-[15px]">
        <span className="live-dot inline-block size-2 rounded-full bg-white shadow-[0_0_8px_1px_rgba(255,255,255,0.6)]" />
        {etiquetaCtaDirecto(payload.live, payload.daysUntil ?? null)}
      </Button>
    </Link>
  );
}
