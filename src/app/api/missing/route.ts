import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export const dynamic = "force-dynamic";
const foundSchema = z.object({ instanceId: z.string().min(1), inventoryItemId: z.string().min(1), found: z.number().int().min(1).max(10000).optional() });

export async function GET() {
  const rows = await prisma.missingPart.findMany({ where: { quantity: { gt: 0 } }, include: { inventoryItem: { include: { part: true, color: true, definition: true } }, instance: true } });
  const grouped = new Map<string, { part: unknown; color: unknown; quantity: number; sets: { instanceId: string; inventoryItemId: string; nickname: string | null; setNumber: string; name: string; quantity: number }[] }>();
  for (const row of rows) {
    const item = row.inventoryItem; const key = `${item.partId}|${item.colorId}`;
    const group = grouped.get(key) ?? { part: { id: item.part.id, number: item.part.partNumber, name: item.part.name, imageUrl: item.imageUrl ?? item.part.imageUrl }, color: { id: item.color.id, name: item.color.name, rgb: item.color.rgb }, quantity: 0, sets: [] };
    group.quantity += row.quantity;
    group.sets.push({ instanceId: row.instanceId, inventoryItemId: item.id, nickname: row.instance.nickname, setNumber: item.definition.setNumber, name: item.definition.name, quantity: row.quantity });
    grouped.set(key, group);
  }
  return NextResponse.json([...grouped.values()].sort((a, b) => b.quantity - a.quantity));
}

export async function POST(request: NextRequest) {
  const parsed = foundSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Set, Teil und eine gültige Fundmenge werden benötigt." }, { status: 400 });
  try {
    const remaining = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: parsed.data.inventoryItemId, definition: { instances: { some: { id: parsed.data.instanceId } } } }, select: { id: true, isManual: true } });
      if (!item) throw new Error("Dieses Teil gehört nicht zu diesem Set.");
      const missing = await tx.missingPart.findUnique({ where: { instanceId_inventoryItemId: { instanceId: parsed.data.instanceId, inventoryItemId: item.id } } });
      if (!missing) return 0;
      const found = parsed.data.found ?? missing.quantity;
      if (found > missing.quantity) throw new Error(`Es fehlen nur ${missing.quantity} Stück.`);
      const beforeMissing = missing.quantity;
      const beforeReviewed = await tx.inventoryReview.findUnique({ where: { instanceId_inventoryItemId: { instanceId: parsed.data.instanceId, inventoryItemId: item.id } }, select: { status: true, note: true } });
      const beforeShopping = await tx.shoppingItem.findMany({ where: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: { in: ["WANTED", "ORDERED"] } }, select: { status: true, quantity: true } });
      const next = missing.quantity - found;
      if (next) await tx.missingPart.update({ where: { id: missing.id }, data: { quantity: next, confirmed: true } });
      else await tx.missingPart.delete({ where: { id: missing.id } });
      if (!item.isManual) await tx.inventoryReview.upsert({ where: { instanceId_inventoryItemId: { instanceId: parsed.data.instanceId, inventoryItemId: item.id } }, create: { instanceId: parsed.data.instanceId, inventoryItemId: item.id }, update: { reviewedAt: new Date() } });
      const shopping = await tx.shoppingItem.findMany({ where: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: { in: ["WANTED", "ORDERED"] } }, orderBy: { status: "asc" } });
      let excess = Math.max(0, shopping.reduce((sum, line) => sum + line.quantity, 0) - next);
      for (const line of shopping) {
        if (!excess) break;
        const reduced = Math.max(0, line.quantity - excess);
        excess -= line.quantity - reduced;
        if (reduced) await tx.shoppingItem.update({ where: { id: line.id }, data: { quantity: reduced } });
        else await tx.shoppingItem.delete({ where: { id: line.id } });
      }
      const afterReview = await tx.inventoryReview.findUnique({ where: { instanceId_inventoryItemId: { instanceId: parsed.data.instanceId, inventoryItemId: item.id } } });
      const afterShopping = await tx.shoppingItem.findMany({ where: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: { in: ["WANTED", "ORDERED"] } }, select: { status: true, quantity: true }, orderBy: { status: "asc" } });
      await tx.inventoryChange.create({ data: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, beforeMissing, afterMissing: next, beforeReviewed: Boolean(beforeReviewed) || missing.confirmed || item.isManual, afterReviewed: Boolean(afterReview) || next > 0 || item.isManual, beforeStatus: beforeReviewed?.status ?? null, afterStatus: afterReview?.status ?? null, beforeReviewNote: beforeReviewed?.note ?? null, afterReviewNote: afterReview?.note ?? null, beforeShopping, afterShopping, reason: "Teil über die globale Fehlteileliste als gefunden markiert" } });
      return next;
    });
    return NextResponse.json({ ok: true, remaining });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Fund konnte nicht gespeichert werden." }, { status: 400 }); }
}
