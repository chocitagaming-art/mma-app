import { NextResponse } from "next/server";

import { searchFighters } from "@/lib/queries/fighters";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  if (query.trim().length < 2) {
    return NextResponse.json([]);
  }

  const fighters = await searchFighters(query);

  return NextResponse.json(fighters);
}