import { NextRequest, NextResponse } from "next/server";
import { authCookieName, hasValidSession } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/health") || request.nextUrl.pathname === "/api/auth/login" || request.nextUrl.pathname === "/api/auth/logout") return NextResponse.next();
  if (await hasValidSession(request)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  if (request.nextUrl.pathname.startsWith("/_next/") || request.nextUrl.pathname === "/icon.svg" || request.nextUrl.pathname === "/manifest.webmanifest") return NextResponse.next();
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(authCookieName);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
