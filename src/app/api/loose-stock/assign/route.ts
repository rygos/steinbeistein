import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
const allocationSchema = z.object({ partId: z.string().min(1), colorId: z.string().min(1), instanceId: z.string().min(1), quantity: z.number().int().min(1).max(100000) });

export async function POST(request: NextRequest) {
  const parsed = allocationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Wähle Set, Teil und eine gültige Fundmenge." }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const instance = await tx.setInstance.findUnique({ where: { id: parsed.data.instanceId }, select: { id: true, definitionId: true } });
      if (!instance) throw new Error("Set-Exemplar wurde nicht gefunden.");
      const item = await tx.inventoryItem.findFirst({ where: { definitionId: instance.definitionId, partId: parsed.data.partId, colorId: parsed.data.colorId }, select: { id: true, quantity: true, isManual: true } });
      if (!item) throw new Error("Dieses Teil ist nicht im Inventar des ausgewählten Sets.");
      const missing = await tx.missingPart.findUnique({ where: { instanceId_inventoryItemId: { instanceId: instance.id, inventoryItemId: item.id } } });
      if (!missing || parsed.data.quantity > missing.quantity) throw new Error(`In diesem Exemplar fehlen nur ${missing?.quantity ?? 0} Stück.`);
      const bins = await tx.loosePartStock.findMany({ where: { partId: parsed.data.partId, colorId: parsed.data.colorId }, orderBy: [{ updatedAt: "asc" }, { locationKey: "asc" }] });
      const available = bins.reduce((sum, bin) => sum + bin.quantity, 0);
      if (parsed.data.quantity > available) throw new Error(`Im eigenen Bestand liegen nur ${available} Stück.`);
      const priorShopping = await tx.shoppingItem.findMany({ where: { instanceId: instance.id, inventoryItemId: item.id, status: { in: ["WANTED", "ORDERED"] } }, select: { status: true, quantity: true } });
      let remainder = parsed.data.quantity;
      const stockAllocations: { id: string; partId: string; colorId: string; locationId: string | null; locationKey: string; beforeQuantity: number; afterQuantity: number; unitCost: number | null }[] = [];
      for (const bin of bins) {
        if (!remainder) break;
        const used = Math.min(bin.quantity, remainder);
        remainder -= used;
        stockAllocations.push({ id: bin.id, partId: bin.partId, colorId: bin.colorId, locationId: bin.locationId, locationKey: bin.locationKey, beforeQuantity: bin.quantity, afterQuantity: bin.quantity - used, unitCost: bin.unitCost });
        if (used === bin.quantity) await tx.loosePartStock.delete({ where: { id: bin.id } });
        else await tx.loosePartStock.update({ where: { id: bin.id }, data: { quantity: bin.quantity - used } });
      }
      const nextMissing = missing.quantity - parsed.data.quantity;
      if (nextMissing === 0) await tx.missingPart.delete({ where: { id: missing.id } });
      else await tx.missingPart.update({ where: { id: missing.id }, data: { quantity: nextMissing, confirmed: true } });
      const review = await tx.inventoryReview.findUnique({ where: { instanceId_inventoryItemId: { instanceId: instance.id, inventoryItemId: item.id } } });
      await tx.inventoryReview.upsert({ where: { instanceId_inventoryItemId: { instanceId: instance.id, inventoryItemId: item.id } }, create: { instanceId: instance.id, inventoryItemId: item.id }, update: { reviewedAt: new Date() } });
      const afterShopping = await tx.shoppingItem.findMany({ where: { instanceId: instance.id, inventoryItemId: item.id, status: { in: ["WANTED", "ORDERED"] } }, select: { status: true, quantity: true }, orderBy: { status: "asc" } });
      await tx.inventoryChange.create({ data: { instanceId: instance.id, inventoryItemId: item.id, beforeMissing: missing.quantity, afterMissing: nextMissing, beforeReviewed: Boolean(review) || missing.confirmed || item.isManual, afterReviewed: true, reason: "Aus eigenem Teilebestand zugewiesen", beforeShopping: priorShopping, afterShopping, stockAllocations } });
      let excess = Math.max(0, priorShopping.reduce((sum, row) => sum + row.quantity, 0) - nextMissing);
      for (const row of await tx.shoppingItem.findMany({ where: { instanceId: instance.id, inventoryItemId: item.id, status: { in: ["WANTED", "ORDERED"] } }, orderBy: { status: "asc" } })) {
        if (!excess) break;
        const reduced = Math.max(0, row.quantity - excess);
        excess -= row.quantity - reduced;
        if (reduced) await tx.shoppingItem.update({ where: { id: row.id }, data: { quantity: reduced } });
        else await tx.shoppingItem.delete({ where: { id: row.id } });
      }
      return { ok: true, remaining: nextMissing, allocated: parsed.data.quantity };
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Teile konnten nicht zugewiesen werden." }, { status: 400 });
  }
}
