import { NextResponse } from "next/server";

import { sql } from "@/lib/db";

// Health check para el monitor externo (S3-H): 200 si la app responde Y la BD
// de Neon contesta a un SELECT 1; 503 si la BD falla. force-dynamic: un health
// cacheado mentiría sobre el estado real.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql("select 1");
    return NextResponse.json({
      ok: true,
      db: "up",
      // SHA corto del deploy activo (lo inyecta Vercel); "dev" en local.
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
