import { NextResponse } from "next/server";

import { sql } from "@/lib/db";

// Health check para el monitor externo (S3-H).
//
// DOS NIVELES, Y LA DISTINCIÓN IMPORTA:
//   GET /api/health          -> ¿vive la app? NO toca la base de datos.
//   GET /api/health?deep=1   -> ¿vive además Neon? Hace un `select 1`.
//
// Antes solo existía el nivel profundo, y el monitor lo llamaba cada 15 minutos.
// Cada llamada despertaba el compute de Neon, que luego seguía encendido otros 5
// minutos hasta el autosuspend: 20 minutos de cada 60 pagados por un `select 1`.
// Eso son ~60 CU-hora al mes de una cuota de 100. El chequeo profundo ahora va
// una vez por hora (ver monitor.yml en mma-ingesta) y el superficial, todo lo
// seguido que haga falta, porque es gratis.
//
// force-dynamic: un health cacheado mentiría sobre el estado real.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SHA corto del deploy activo (lo inyecta Vercel); "dev" en local.
const version = () => process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";

  if (!deep) {
    // La app responde: eso es todo lo que se afirma aquí. `db: "skipped"` y no
    // `"up"` a propósito, para que nadie lea este 200 como "Neon va bien".
    return NextResponse.json({ ok: true, db: "skipped", version: version() });
  }

  try {
    await sql("select 1");
    return NextResponse.json({ ok: true, db: "up", version: version() });
  } catch {
    // `version` TAMBIÉN aquí (20-sep-2026). Cuidado con el motivo, porque el
    // que primero se escribió era falso: el BUCLE de espera de smoke-prod.yml
    // pide el health SUPERFICIAL, que no llega nunca a esta rama y nunca
    // devuelve 503. Quien lo necesita es el DIAGNÓSTICO de ese mismo workflow,
    // que cuando el bucle se agota llama a `?deep=1` para separar "Neon caído"
    // de "la app arrancó": sin `version` aquí, ese 503 no puede decir qué
    // commit está sirviendo la web tocada, que es lo que hace falta para
    // decidir si hay que volver a desplegar. El SHA lo pone Vercel en el
    // proceso, así que se conoce aunque la base no conteste.
    return NextResponse.json({ ok: false, db: "down", version: version() }, { status: 503 });
  }
}
