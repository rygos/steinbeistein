import { NextResponse } from "next/server";
import { legoProvider } from "@/lib/lego-provider";
export async function POST() {
  const result = await legoProvider.testConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
