import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { brickOwlConfigured, fetchBrickOwlPrice, findBrickOwlId } from "@/lib/brickowl";
import { apiMayReplace, manualPartCacheKey, manualPriceCurrencies, manualQuoteKey, manualSetCacheKey } from "@/lib/manual-price";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const manualPriceSchema = z.object({
  avgPrice: z.number().finite().min(0).max(1_000_000).refine((value) => Number(value.toFixed(2)) === value, "Höchstens zwei Nachkommastellen."),
  currencyCode: z.enum(manualPriceCurrencies).default("EUR"),
});
const schema = z.object({
  setInstanceId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  refresh: z.boolean().default(false),
  manualPrice: manualPriceSchema.optional(),
  clearManual: z.boolean().default(false),
}).refine((value) => Number(Boolean(value.setInstanceId)) + Number(Boolean(value.inventoryItemId)) === 1, "Genau ein Ziel.")
  .refine((value) => !(value.manualPrice && value.clearManual), "Preis speichern und entfernen schließen sich aus.");

type Target = {
  uiKey: string;
  manualKey: string;
  itemType: "SET" | "PART";
  itemNumber: string;
  boid: string | null;
  elementId?: string;
  inventoryItemId?: string;
  setInstanceId?: string;
  partId?: string;
  colorId?: string;
};

async function resolveTarget(input: { setInstanceId?: string; inventoryItemId?: string }): Promise<Target | null> {
  if (input.setInstanceId) {
    const row = await prisma.setInstance.findUnique({ where: { id: input.setInstanceId }, select: { id: true, definition: { select: { setNumber: true, brickowlId: true } } } });
    if (!row) return null;
    return { uiKey: `set:${row.id}`, manualKey: manualSetCacheKey(row.id), itemType: "SET", itemNumber: row.definition.setNumber, boid: row.definition.brickowlId, setInstanceId: row.id };
  }
  const row = await prisma.inventoryItem.findUnique({ where: { id: input.inventoryItemId }, select: { id: true, legoElementId: true, brickowlId: true, partId: true, colorId: true, part: { select: { partNumber: true } } } });
  if (!row) return null;
  return { uiKey: `part:${row.partId}:${row.colorId}`, manualKey: manualPartCacheKey(row.partId, row.colorId), itemType: "PART", itemNumber: row.part.partNumber, boid: row.brickowlId, elementId: row.legoElementId ?? undefined, inventoryItemId: row.id, partId: row.partId, colorId: row.colorId };
}

export async function GET() {
  const stored = await prisma.brickOwlPrice.findMany({ where: { OR: [{ source: "manual" }, { partId: { not: null }, colorId: { not: null } }, { setInstanceId: { not: null } }] }, orderBy: { fetchedAt: "desc" } });
  const manualPrices = stored.flatMap((row) => {
    const key = manualQuoteKey(row);
    if (!key) return [];
    return [{ key, source: row.source, itemType: row.itemType, itemNumber: row.itemNumber, currencyCode: row.currencyCode, avgPrice: row.avgPrice, minPrice: row.minPrice, maxPrice: row.maxPrice, fetchedAt: row.fetchedAt }];
  });
  return NextResponse.json({ provider: "BrickOwl", configured: brickOwlConfigured(), country: process.env.BRICKOWL_COUNTRY || "DE", cacheHours: 24, approvalRequired: true, manualPrices });
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Wähle genau ein Set-Exemplar oder eine Inventarposition aus und gib einen gültigen Preis an." }, { status: 400 });
  try {
    const input = parsed.data;
    const target = await resolveTarget(input);
    if (!target) return NextResponse.json({ error: "Set oder Inventarposition nicht gefunden." }, { status: 404 });

    if (input.clearManual) {
      await prisma.brickOwlPrice.deleteMany({ where: { cacheKey: target.manualKey, source: "manual" } });
      return NextResponse.json({ cleared: true, key: target.uiKey });
    }

    if (input.manualPrice) {
      const price = input.manualPrice;
      const data = {
        boid: "manual", itemType: target.itemType, itemNumber: target.itemNumber, newOrUsed: "U", guideType: "manual", currencyCode: price.currencyCode,
        minPrice: price.avgPrice, maxPrice: price.avgPrice, avgPrice: price.avgPrice, qtyAvgPrice: price.avgPrice, unitQuantity: null, totalQuantity: null,
        source: "manual", setInstanceId: target.setInstanceId ?? null, partId: target.partId ?? null, colorId: target.colorId ?? null, fetchedAt: new Date(),
      };
      const saved = await prisma.brickOwlPrice.upsert({ where: { cacheKey: target.manualKey }, create: { cacheKey: target.manualKey, ...data }, update: data });
      return NextResponse.json({ price: saved, manual: true, cached: true, key: target.uiKey });
    }

    const manual = await prisma.brickOwlPrice.findUnique({ where: { cacheKey: target.manualKey } });
    if (manual?.source === "manual") return NextResponse.json({ price: manual, manual: true, cached: true, refreshSkipped: true, key: target.uiKey });
    if (!brickOwlConfigured()) return NextResponse.json({ error: "BrickOwl API-Schlüssel fehlt. Hinterlege BRICKOWL_API_KEY in .env und starte den App-Container neu, oder trage den Preis manuell ein." }, { status: 503 });

    const lookup = { itemType: target.itemType, itemNumber: target.itemNumber, ...(target.elementId ? { elementId: target.elementId } : {}), newOrUsed: "U" as const, guideType: "sold" as const };
    const boid = target.boid ?? await findBrickOwlId(lookup);
    if (!target.boid && target.itemType === "PART" && target.inventoryItemId) await prisma.inventoryItem.update({ where: { id: target.inventoryItemId }, data: { brickowlId: boid } });
    if (!target.boid && target.setInstanceId) await prisma.setDefinition.updateMany({ where: { setNumber: target.itemNumber, brickowlId: null }, data: { brickowlId: boid } });
    const associationKey = target.itemType === "PART" ? `part|${target.partId}|${target.colorId}` : `set|${target.itemNumber}`;
    const cacheKey = `${boid}|used|price_history|${associationKey}`;
    const cached = await prisma.brickOwlPrice.findUnique({ where: { cacheKey } }) ?? await prisma.brickOwlPrice.findUnique({ where: { cacheKey: `${boid}|used|price_history` } });
    const association = { setInstanceId: target.setInstanceId ?? null, partId: target.partId ?? null, colorId: target.colorId ?? null };
    if (cached && !apiMayReplace(cached, input.refresh)) {
      const saved = cached.cacheKey === cacheKey
        ? await prisma.brickOwlPrice.update({ where: { id: cached.id }, data: association })
        : await prisma.brickOwlPrice.create({ data: { cacheKey, boid: cached.boid, itemType: cached.itemType, itemNumber: cached.itemNumber, newOrUsed: cached.newOrUsed, guideType: cached.guideType, currencyCode: cached.currencyCode, minPrice: cached.minPrice, maxPrice: cached.maxPrice, avgPrice: cached.avgPrice, qtyAvgPrice: cached.qtyAvgPrice, unitQuantity: cached.unitQuantity, totalQuantity: cached.totalQuantity, fetchedAt: cached.fetchedAt, source: cached.source, ...association } });
      return NextResponse.json({ price: saved, cached: true, manual: false, key: target.uiKey });
    }
    const price = await fetchBrickOwlPrice(lookup, boid);
    const saved = await prisma.brickOwlPrice.upsert({ where: { cacheKey }, create: { cacheKey, ...price, ...association, source: "api" }, update: { ...price, ...association, source: "api" } });
    return NextResponse.json({ price: saved, cached: false, manual: false, key: target.uiKey });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BrickOwl-Preis konnte nicht geladen werden." }, { status: 502 });
  }
}
