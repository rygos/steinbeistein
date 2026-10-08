import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { brickLinkCacheKey, brickLinkConfigured, fetchBrickLinkPrice } from "@/lib/bricklink";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const requestSchema = z.object({ setInstanceId: z.string().optional(), inventoryItemId: z.string().optional(), condition: z.enum(["N", "U"]).default("U"), guideType: z.enum(["sold", "stock"]).default("sold"), refresh: z.boolean().default(false) }).refine((value) => Number(Boolean(value.setInstanceId)) + Number(Boolean(value.inventoryItemId)) === 1);
const cacheMilliseconds = 24 * 60 * 60 * 1000;

export async function GET() {
  return NextResponse.json({ provider: "BrickLink", configured: brickLinkConfigured(), countryCode: process.env.BRICKLINK_COUNTRY_CODE || null, cacheHours: 24, method: "letzte sechs Monate verkauft" });
}

export async function POST(request: NextRequest) {
  if (!brickLinkConfigured()) return NextResponse.json({ error: "BrickLink OAuth fehlt. Hinterlege Consumer Key, Consumer Secret, Token und Token Secret in der .env und starte die App neu." }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Wähle genau ein Set-Exemplar oder eine Inventarposition aus." }, { status: 400 });
  try {
    const input = parsed.data;
    const countryCode = process.env.BRICKLINK_COUNTRY_CODE || undefined;
    const query = input.setInstanceId
      ? await prisma.setInstance.findUnique({ where: { id: input.setInstanceId }, select: { definition: { select: { setNumber: true, bricklinkId: true } } } }).then((row) => row ? { itemType: "SET" as const, itemNumber: row.definition.bricklinkId ?? row.definition.setNumber, colorId: undefined } : null)
      : await prisma.inventoryItem.findUnique({ where: { id: input.inventoryItemId }, select: { part: { select: { bricklinkId: true } }, color: { select: { bricklinkId: true } } } }).then((row) => row?.part.bricklinkId && row.color.bricklinkId ? { itemType: "PART" as const, itemNumber: row.part.bricklinkId, colorId: row.color.bricklinkId } : null);
    if (!query) return NextResponse.json({ error: input.inventoryItemId ? "Für dieses Teil oder diese Farbe ist keine BrickLink-ID hinterlegt." : "Set-Exemplar nicht gefunden." }, { status: 422 });
    const priceRequest = { ...query, newOrUsed: input.condition, guideType: input.guideType, ...(countryCode ? { countryCode } : {}) };
    const cacheKey = brickLinkCacheKey(priceRequest);
    const cached = await prisma.brickLinkPrice.findUnique({ where: { cacheKey } });
    if (cached && !input.refresh && Date.now() - cached.fetchedAt.getTime() < cacheMilliseconds) return NextResponse.json({ price: cached, cached: true });
    const price = await fetchBrickLinkPrice(priceRequest);
    const priceData = { itemType: price.itemType, itemNumber: price.itemNumber, colorBricklinkId: price.colorId, newOrUsed: price.newOrUsed, guideType: price.guideType, currencyCode: price.currencyCode, minPrice: price.minPrice, maxPrice: price.maxPrice, avgPrice: price.avgPrice, qtyAvgPrice: price.qtyAvgPrice, unitQuantity: price.unitQuantity, totalQuantity: price.totalQuantity, fetchedAt: price.fetchedAt };
    const saved = await prisma.brickLinkPrice.upsert({ where: { cacheKey }, create: { cacheKey, ...priceData }, update: priceData });
    return NextResponse.json({ price: saved, cached: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BrickLink-Preis konnte nicht geladen werden." }, { status: 502 });
  }
}
