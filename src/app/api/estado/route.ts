import { NextResponse } from "next/server";

import { claveValida } from "@/lib/estado/clave";
import { obtenerEstado } from "@/lib/estado/consulta";

export const runtime = "nodejs";
// Un estado cacheado miente sobre el estado, que es justo lo contrario de para
// lo que existe. Mismo criterio que /api/health.
export const dynamic = "force-dynamic";

// El mismo veredicto que pinta /estado, en JSON.
//
// PARA QUÉ: lo consume el cron `estado-guardian.yml` de mma-ingesta, que falla
// en rojo cuando el nivel es "mal" y hace que GitHub mande el email. Así el
// panel y la alerta preguntan a la MISMA función: no puede pasar que la página
// diga "todo bien" mientras la alerta piensa lo contrario.
//
// Sin clave devuelve 404, no 401: un 401 confirmaría que la ruta existe. Ver la
// explicación entera en `estado/clave.ts`.
export async function GET(request: Request) {
  if (!claveValida(request)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const estado = await obtenerEstado();
    return NextResponse.json(estado, {
      // Ni CDN ni navegador: siempre recién consultado.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/estado] no se pudo calcular el estado", error);
    // 500 y no un JSON con nivel "mal": si esto revienta, lo que falla es el
    // propio panel, y disfrazarlo de veredicto sería mentir sobre los datos.
    return NextResponse.json(
      { error: "No se pudo calcular el estado." },
      { status: 500 },
    );
  }
}
