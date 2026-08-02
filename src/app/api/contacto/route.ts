import { NextResponse } from "next/server";

import { validarContacto } from "@/lib/contacto";
import { insertarMensajeDeContacto } from "@/lib/db-write";
import { clientIpFromHeaders } from "@/lib/maestro/security";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Nada que cachear: es un POST que escribe.
export const dynamic = "force-dynamic";
// Una inserción no debería tardar ni un segundo; 10 s es el techo de Vercel
// Hobby y el `statement_timeout` del pool de escritura corta a los 5.
export const maxDuration = 10;

// LA ÚNICA RUTA DE TODA LA WEB QUE ESCRIBE EN LA BASE DE DATOS.
//
// Va contra un pool aparte (`DATABASE_URL_WRITE` → rol `mma_app_contact`, con
// INSERT sobre `contact_messages` y nada más). El resto del sitio sigue
// conectándose como `mma_app_readonly`, que no puede modificar ni una fila.
export async function POST(request: Request) {
  try {
    // El límite va ANTES de leer el cuerpo: es lo único que separa este
    // formulario de un buzón de spam. Cinco envíos cada 10 s y veinte cada
    // minuto por IP, el mismo limitador compartido que las búsquedas.
    const ip = clientIpFromHeaders(request.headers);
    const limit = await checkRateLimit(`contacto:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    let cuerpo: unknown;
    try {
      cuerpo = await request.json();
    } catch {
      return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
    }

    const validacion = validarContacto(cuerpo);

    if (!validacion.ok && validacion.motivo === "spam") {
      // Se le contesta al robot que todo ha ido bien. Un 400 le enseñaría cuál
      // es el campo trampa y volvería mañana sabiendo saltárselo.
      return NextResponse.json({ ok: true });
    }
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    await insertarMensajeDeContacto(validacion.datos);

    return NextResponse.json({ ok: true });
  } catch (error) {
    // El correo de quien escribe NO se registra: acabaría en los logs de
    // Vercel, que es justo donde no tiene que estar un dato personal.
    console.error("[api/contacto] no se pudo guardar el mensaje", error);
    return NextResponse.json(
      { error: "No se pudo enviar el mensaje. Inténtalo más tarde." },
      { status: 500 },
    );
  }
}
