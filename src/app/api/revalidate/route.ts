import { timingSafeEqual } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Comparación en tiempo constante para no filtrar el secreto por timing.
// timingSafeEqual exige buffers de igual longitud, así que ante longitudes
// distintas devolvemos false directamente (solo se filtra la longitud, que
// no es información útil para un atacante).
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

// Revalidación bajo demanda de la home (complementa el ISR de 30 minutos):
// POST /api/revalidate con cabecera "Authorization: Bearer <REVALIDATE_SECRET>".
// Pensado para dispararlo tras ingestas de datos (nuevas noticias, eventos…).
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;

  // Sin secreto configurado el endpoint queda deshabilitado → 503, igual que
  // hace /api/predict cuando su servicio no está configurado.
  if (!secret) {
    return NextResponse.json(
      { error: "La revalidación bajo demanda no está configurada." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token || !safeEqual(token, secret)) {
    return NextResponse.json(
      { error: "Credenciales no válidas." },
      { status: 401 },
    );
  }

  // Refresca la portada: invalida los tags de los datos cacheados con unstable_cache
  // que la alimentan ("home") y las noticias ("news", también en /tendencias), más el
  // path (Router Cache). Así "portada fresca en segundos" sigue funcionando pese a que
  // las queries pasaron de ISR a unstable_cache (que el path por sí solo no invalida).
  // { expire: 0 } = expiración inmediata (el caso "webhook" del doc de Next 16: la
  // ingesta llama a este endpoint y la próxima visita debe ver datos frescos ya).
  // "events", "fights", "fighters" y "gyms" se añadieron el 21-ago-2026, a la vez
  // que las cachés de las fichas de detalle. Sin ellos una ingesta podía escribir
  // en la base y la web seguir enseñando lo anterior hasta que venciera el TTL.
  //
  // Ojo al alcance real: hoy el ÚNICO que llama a este endpoint es
  // refresh-news.yml (3 veces al día). El bucle del directo NO lo llama, y por eso
  // las fichas de evento y de combate se cachean solo 60 s. Si algún día el bucle
  // empieza a llamar aquí al sellar un combate, esos dos TTL se pueden subir.
  const tags = ["home", "news", "events", "fights", "fighters", "gyms"];
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }
  revalidatePath("/");
  return NextResponse.json({ revalidated: true, path: "/", tags });
}
