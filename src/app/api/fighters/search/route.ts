import { NextResponse } from "next/server";

import { searchFighters } from "@/lib/queries/fighters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  if (!query.trim()) {
    return NextResponse.json([]);
  }

  const fighters = await searchFighters(query, 10);

  return NextResponse.json(fighters);
}