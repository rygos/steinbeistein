import { NextRequest, NextResponse } from "next/server";
import { legoProvider } from "@/lib/lego-provider";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Bitte eine Teilenummer eingeben." }, { status: 400 });
  try { const [parts, colors] = await Promise.all([legoProvider.searchParts(query), legoProvider.getColors()]); return NextResponse.json({ parts, colors }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Teilesuche fehlgeschlagen." }, { status: 502 }); }
}
