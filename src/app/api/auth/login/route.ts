import { NextRequest, NextResponse } from "next/server";
import { authCookieName, createSessionToken, sessionMaxAge, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("password" in body) || typeof body.password !== "string") return NextResponse.json({ error: "Passwort fehlt." }, { status: 400 });
  try {
    if (!await verifyPassword(body.password)) return NextResponse.json({ error: "Das Passwort ist falsch." }, { status: 401 });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(authCookieName, await createSessionToken(), { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "strict", path: "/", maxAge: sessionMaxAge });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Anmeldung fehlgeschlagen." }, { status: 503 });
  }
}
