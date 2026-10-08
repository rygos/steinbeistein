export type BrickOwlPriceRequest = Readonly<{ itemType: "PART" | "SET"; itemNumber: string; elementId?: string; newOrUsed: "N" | "U"; guideType: "sold" | "stock" }>;
export type BrickOwlPrice = Readonly<{ boid: string; itemType: string; itemNumber: string; newOrUsed: string; guideType: string; currencyCode: string; minPrice: number | null; maxPrice: number | null; avgPrice: number | null; qtyAvgPrice: number | null; unitQuantity: number | null; totalQuantity: number | null; fetchedAt: Date }>;
const base = "https://api.brickowl.com/v1/catalog";

export function brickOwlConfigured(): boolean { return Boolean(process.env.BRICKOWL_API_KEY); }
const numeric = (data: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const key of keys) { const value = data[key]; if (typeof value === "string" || typeof value === "number") { const parsed = Number(value); if (Number.isFinite(parsed)) return parsed; } }
  return null;
};

async function getJson(url: URL): Promise<unknown> {
  if (!process.env.BRICKOWL_API_KEY) throw new Error("BRICKOWL_API_KEY fehlt in der .env.");
  url.searchParams.set("key", process.env.BRICKOWL_API_KEY);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "SteinFuerSteinCollection/1.0 (personal collection manager)" }, signal: AbortSignal.timeout(12000), cache: "no-store" });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt)); continue; }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : "";
      if (response.status === 403 && url.pathname.endsWith("/price_history")) throw new Error("BrickOwl hat den Preisverlauf mit 403 Access Denied abgelehnt. Der API-Key funktioniert für die Katalogsuche, aber benötigt noch Catalog Approval für Preisendpunkte.");
      throw new Error(detail || `BrickOwl antwortete mit HTTP ${response.status}.`);
    }
    return body;
  }
  throw new Error("BrickOwl ist momentan nicht erreichbar.");
}

export async function findBrickOwlId(request: BrickOwlPriceRequest): Promise<string> {
  const url = new URL(`${base}/id_lookup`);
  url.searchParams.set("id", request.itemType === "SET" ? request.itemNumber.replace(/-\d+$/, "") : request.elementId ?? request.itemNumber);
  url.searchParams.set("type", request.itemType === "SET" ? "Set" : "Part");
  if (request.itemType === "PART") url.searchParams.set("id_type", request.elementId ? "item_no" : "design_id");
  const body = await getJson(url);
  const values = Array.isArray(body) ? body : typeof body === "object" && body !== null && Array.isArray((body as { boids?: unknown }).boids) ? (body as { boids: unknown[] }).boids : typeof body === "object" && body !== null && Array.isArray((body as { data?: unknown }).data) ? (body as { data: unknown[] }).data : [];
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (typeof value === "object" && value !== null) {
      const item = value as Record<string, unknown>;
      const id = item.boid ?? item.id ?? item.BOID;
      if (id !== undefined && (item.type === undefined || String(item.type).toLowerCase() === request.itemType.toLowerCase())) return String(id);
    }
  }
  throw new Error("BrickOwl konnte für diese Teilenummer kein passendes Katalogteil zuordnen.");
}

export async function fetchBrickOwlPrice(request: BrickOwlPriceRequest, boid: string): Promise<BrickOwlPrice> {
  const url = new URL(`${base}/price_history`);
  url.searchParams.set("boid", boid);
  const body = await getJson(url);
  if (typeof body !== "object" || body === null) throw new Error("BrickOwl hat keine Preisdaten geliefert.");
  const data = (body as { data?: unknown }).data ?? body;
  if (typeof data !== "object" || data === null) throw new Error("BrickOwl hat ein unbekanntes Preisformat geliefert.");
  const record = data as Record<string, unknown>;
  const history = Array.isArray(record.price_history) ? record.price_history : Array.isArray(record.history) ? record.history : [];
  const row = history.at(-1);
  const point = typeof row === "object" && row !== null ? row as Record<string, unknown> : record;
  return { boid, itemType: request.itemType, itemNumber: request.itemNumber, newOrUsed: request.newOrUsed, guideType: request.guideType, currencyCode: "GBP", minPrice: numeric(point, "min_price", "min", "lowest_price"), maxPrice: numeric(point, "max_price", "max", "highest_price"), avgPrice: numeric(point, "avg_price", "average_price", "average", "price"), qtyAvgPrice: numeric(point, "qty_avg_price", "quantity_weighted_average"), unitQuantity: numeric(point, "unit_quantity", "sales_count", "quantity"), totalQuantity: numeric(point, "total_quantity", "total_sales"), fetchedAt: new Date() };
}
