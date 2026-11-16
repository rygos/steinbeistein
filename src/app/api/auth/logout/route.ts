import { NextRequest, NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
