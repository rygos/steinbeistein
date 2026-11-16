import { NextRequest } from "next/server";

export const authCookieName = "steinbeistein_session";
const sessionDurationSeconds = 60 * 60 * 24 * 14;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET muss mindestens 32 Zeichen lang sein.");
  return value;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Buffer.from(signature).toString("base64url");
}

export async function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + sessionDurationSeconds * 1000 })).toString("base64url");
  return `${payload}.${await sign(payload)}`;
}

export async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(authCookieName)?.value;
  if (!token) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(await sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected[index]! ^ actual[index]!;
  if (mismatch !== 0) return false;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed !== null && "expiresAt" in parsed && typeof parsed.expiresAt === "number" && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export async function verifyPassword(password: string) {
  const configured = process.env.APP_PASSWORD;
  if (!configured) throw new Error("APP_PASSWORD ist nicht konfiguriert.");
  const actual = Buffer.from(password);
  const expected = Buffer.from(configured);
  if (actual.length !== expected.length) return false;
  const key = await crypto.subtle.importKey("raw", expected, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const actualMac = Buffer.from(await crypto.subtle.sign("HMAC", key, actual));
  const expectedMac = Buffer.from(await crypto.subtle.sign("HMAC", key, expected));
  let mismatch = 0;
  for (let index = 0; index < actualMac.length; index += 1) mismatch |= actualMac[index]! ^ expectedMac[index]!;
  return mismatch === 0;
}

export const sessionMaxAge = sessionDurationSeconds;
