import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { brickOwlConfigured, fetchBrickOwlPrice, findBrickOwlId } from "@/lib/brickowl";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const schema = z.object({ setInstanceId: z.string().optional(), inventoryItemId: z.string().optional(), refresh: z.boolean().default(false) }).refine((value) => Number(Boolean(value.setInstanceId)) + Number(Boolean(value.inventoryItemId)) === 1);
const cacheMs = 24 * 60 * 60 * 1000;
export async function GET() { return NextResponse.json({ provider: "BrickOwl", configured: brickOwlConfigured(), country: process.env.BRICKOWL_COUNTRY || "DE", cacheHours: 24, approvalRequired: true }); }

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Wähle genau ein Set-Exemplar oder eine Inventarposition aus." }, { status: 400 });
  if (!brickOwlConfigured()) return NextResponse.json({ error: "BrickOwl API-Schlüssel fehlt. Hinterlege BRICKOWL_API_KEY in .env und starte den App-Container neu." }, { status: 503 });
  try {
    const input = parsed.data;
    const item = input.setInstanceId
      ? await prisma.setInstance.findUnique({ where: { id: input.setInstanceId }, select: { definition: { select: { setNumber: true, brickowlId: true } } } }).then((row) => row ? { type: "SET" as const, number: row.definition.setNumber, boid: row.definition.brickowlId, elementId: undefined } : null)
      : await prisma.inventoryItem.findUnique({ where: { id: input.inventoryItemId }, select: { id: true, legoElementId: true, brickowlId: true, part: { select: { partNumber: true } } } }).then((row) => row ? { type: "PART" as const, number: row.part.partNumber, boid: row.brickowlId, inventoryItemId: row.id, elementId: row.legoElementId ?? undefined } : null);
    if (!item) return NextResponse.json({ error: "Set oder Inventarposition nicht gefunden." }, { status: 404 });
    const lookup = { itemType: item.type, itemNumber: item.number, ...(item.elementId ? { elementId: item.elementId } : {}), newOrUsed: "U" as const, guideType: "sold" as const };
    const boid = item.boid ?? await findBrickOwlId(lookup);
    if (!item.boid && item.type === "PART" && item.inventoryItemId) await prisma.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { brickowlId: boid } });
    if (!item.boid && input.setInstanceId) await prisma.setDefinition.updateMany({ where: { setNumber: item.number, brickowlId: null }, data: { brickowlId: boid } });
    const cacheKey = `${boid}|used|price_history`;
    const cached = await prisma.brickOwlPrice.findUnique({ where: { cacheKey } });
    if (cached && !input.refresh && Date.now() - cached.fetchedAt.getTime() < cacheMs) return NextResponse.json({ price: cached, cached: true });
    const price = await fetchBrickOwlPrice(lookup, boid);
    const saved = await prisma.brickOwlPrice.upsert({ where: { cacheKey }, create: { cacheKey, ...price }, update: { ...price } });
    return NextResponse.json({ price: saved, cached: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BrickOwl-Preis konnte nicht geladen werden." }, { status: 502 });
  }
}
