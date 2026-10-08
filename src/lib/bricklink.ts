import { createHmac, randomBytes } from "node:crypto";

export type BrickLinkPriceRequest = Readonly<{
  itemType: "PART" | "SET";
  itemNumber: string;
  colorId?: number;
  newOrUsed: "N" | "U";
  guideType: "sold" | "stock";
  countryCode?: string;
}>;

export type BrickLinkPrice = Readonly<{
  itemType: "PART" | "SET";
  itemNumber: string;
  colorId: number | null;
  newOrUsed: "N" | "U";
  guideType: "sold" | "stock";
  currencyCode: string;
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
  qtyAvgPrice: number | null;
  unitQuantity: number | null;
  totalQuantity: number | null;
  fetchedAt: Date;
}>;

type BrickLinkEnvelope = Readonly<{ meta?: Readonly<{ code?: number; message?: string }>; data?: unknown }>;
type BrickLinkPriceData = Readonly<Record<string, string | number | undefined>>;

const apiBase = "https://api.bricklink.com/api/store/v1";
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const credentials = () => ({ consumerKey: process.env.BRICKLINK_CONSUMER_KEY, consumerSecret: process.env.BRICKLINK_CONSUMER_SECRET, token: process.env.BRICKLINK_TOKEN, tokenSecret: process.env.BRICKLINK_TOKEN_SECRET });

export function brickLinkConfigured(): boolean {
  const { consumerKey, consumerSecret, token, tokenSecret } = credentials();
  return Boolean(consumerKey && consumerSecret && token && tokenSecret);
}

function authorizationHeader(url: URL, method: string): string {
  const keys = credentials();
  if (!keys.consumerKey || !keys.consumerSecret || !keys.token || !keys.tokenSecret) throw new Error("BrickLink OAuth ist nicht vollständig eingerichtet.");
  const oauth = new Map<string, string>([
    ["oauth_consumer_key", keys.consumerKey], ["oauth_nonce", randomBytes(16).toString("hex")], ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", String(Math.floor(Date.now() / 1000))], ["oauth_token", keys.token], ["oauth_version", "1.0"],
  ]);
  const pairs = [...url.searchParams.entries(), ...oauth.entries()].map(([key, value]) => [encode(key), encode(value)] as const).sort(([keyA, valueA], [keyB, valueB]) => keyA.localeCompare(keyB) || valueA.localeCompare(valueB));
  const normalized = pairs.map(([key, value]) => `${key}=${value}`).join("&");
  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
  const base = `${method.toUpperCase()}&${encode(baseUrl)}&${encode(normalized)}`;
  const signingKey = `${encode(keys.consumerSecret)}&${encode(keys.tokenSecret)}`;
  oauth.set("oauth_signature", createHmac("sha1", signingKey).update(base).digest("base64"));
  return `OAuth ${[...oauth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
}

function numeric(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function brickLinkCacheKey(request: BrickLinkPriceRequest): string {
  return [request.itemType, request.itemNumber, request.colorId ?? "all", request.newOrUsed, request.guideType, request.countryCode ?? "all"].join("|");
}

export async function fetchBrickLinkPrice(request: BrickLinkPriceRequest): Promise<BrickLinkPrice> {
  const url = new URL(`${apiBase}/items/${request.itemType.toLowerCase()}/${encodeURIComponent(request.itemNumber)}/price`);
  url.searchParams.set("new_or_used", request.newOrUsed);
  url.searchParams.set("guide_type", request.guideType);
  if (request.colorId !== undefined) url.searchParams.set("color_id", String(request.colorId));
  if (request.countryCode) url.searchParams.set("country_code", request.countryCode);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { Authorization: authorizationHeader(url, "GET"), Accept: "application/json" }, signal: AbortSignal.timeout(12000), cache: "no-store" });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 300 * (2 ** attempt)));
      continue;
    }
    const envelope: BrickLinkEnvelope = await response.json();
    if (!response.ok || envelope.meta?.code !== 200 || !envelope.data || typeof envelope.data !== "object") throw new Error(envelope.meta?.message || `BrickLink antwortete mit HTTP ${response.status}.`);
    const data = envelope.data as BrickLinkPriceData;
    return { ...request, colorId: request.colorId ?? null, currencyCode: typeof data.currency_code === "string" ? data.currency_code : "EUR", minPrice: numeric(data.min_price), maxPrice: numeric(data.max_price), avgPrice: numeric(data.avg_price), qtyAvgPrice: numeric(data.qty_avg_price), unitQuantity: numeric(data.unit_quantity), totalQuantity: numeric(data.total_quantity), fetchedAt: new Date() };
  }
  throw new Error("BrickLink antwortet momentan nicht. Bitte versuche es später erneut.");
}
