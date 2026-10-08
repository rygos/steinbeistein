import { NextRequest, NextResponse } from "next/server";
import { InventoryItemStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { instanceDto } from "@/lib/serializers";

export const dynamic = "force-dynamic";
const snapshotSchema = z.array(z.object({ status: z.enum(["WANTED", "ORDERED"]), quantity: z.number().int().positive() }));
const stockSnapshotSchema = z.array(z.object({ id: z.string(), partId: z.string(), colorId: z.string(), locationId: z.string().nullable(), locationKey: z.string(), beforeQuantity: z.number().int().positive(), afterQuantity: z.number().int().nonnegative(), unitCost: z.number().nullable() }));
const include = { definition: { include: { inventory: { include: { part: true, color: true } } } }, missing: true, reviews: true, storageLocation: true } as const;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const change = await prisma.inventoryChange.findFirst({ where: { instanceId: id, undoneAt: null }, include: { inventoryItem: { include: { part: true, color: true } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(change ? { id: change.id, reason: change.reason, beforeMissing: change.beforeMissing, afterMissing: change.afterMissing, part: change.inventoryItem.part.partNumber, color: change.inventoryItem.color.name, changedAt: change.createdAt } : null);
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const change = await tx.inventoryChange.findFirst({ where: { instanceId: id, undoneAt: null }, orderBy: { createdAt: "desc" } });
      if (!change) throw new Error("Es gibt keine Änderung zum Rückgängigmachen.");
      const current = await tx.missingPart.findUnique({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: change.inventoryItemId } } });
      if ((current?.quantity ?? 0) !== change.afterMissing) throw new Error("Dieses Teil wurde seitdem weiter bearbeitet. Wähle die letzte Änderung aus dem Verlauf.");
      const currentShopping = await tx.shoppingItem.findMany({ where: { instanceId: id, inventoryItemId: change.inventoryItemId, status: { in: ["WANTED", "ORDERED"] } }, select: { status: true, quantity: true }, orderBy: { status: "asc" } });
      const expectedShopping = snapshotSchema.safeParse(change.afterShopping);
      if (expectedShopping.success && JSON.stringify(currentShopping) !== JSON.stringify(expectedShopping.data)) throw new Error("Der Einkaufsstatus wurde seitdem geändert. Diese Mengenänderung kann nicht sicher zurückgesetzt werden.");
      const stockSnapshot = stockSnapshotSchema.safeParse(change.stockAllocations);
      if (stockSnapshot.success) for (const bin of stockSnapshot.data) {
        const currentBin = await tx.loosePartStock.findFirst({ where: { partId: bin.partId, colorId: bin.colorId, locationKey: bin.locationKey }, select: { id: true, quantity: true } });
        if ((currentBin?.quantity ?? 0) !== bin.afterQuantity) throw new Error("Der eigene Teilebestand wurde seit der Zuweisung verändert. Diese Aktion kann nicht sicher rückgängig gemacht werden.");
      }
      if (change.beforeMissing > 0) await tx.missingPart.upsert({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: change.inventoryItemId } }, create: { instanceId: id, inventoryItemId: change.inventoryItemId, quantity: change.beforeMissing }, update: { quantity: change.beforeMissing } });
      else await tx.missingPart.deleteMany({ where: { instanceId: id, inventoryItemId: change.inventoryItemId } });
      if (change.beforeReviewed) await tx.inventoryReview.upsert({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: change.inventoryItemId } }, create: { instanceId: id, inventoryItemId: change.inventoryItemId, status: change.beforeStatus ?? InventoryItemStatus.PRESENT, note: change.beforeReviewNote }, update: { reviewedAt: new Date(), status: change.beforeStatus ?? InventoryItemStatus.PRESENT, note: change.beforeReviewNote } });
      else await tx.inventoryReview.deleteMany({ where: { instanceId: id, inventoryItemId: change.inventoryItemId } });
      const beforeShopping = snapshotSchema.safeParse(change.beforeShopping);
      await tx.shoppingItem.deleteMany({ where: { instanceId: id, inventoryItemId: change.inventoryItemId, status: { in: ["WANTED", "ORDERED"] } } });
      if (beforeShopping.success && beforeShopping.data.length) await tx.shoppingItem.createMany({ data: beforeShopping.data.map((row) => ({ instanceId: id, inventoryItemId: change.inventoryItemId, status: row.status, quantity: row.quantity })) });
      if (stockSnapshot.success) for (const bin of stockSnapshot.data) await tx.loosePartStock.upsert({ where: { partId_colorId_locationKey: { partId: bin.partId, colorId: bin.colorId, locationKey: bin.locationKey } }, create: { id: bin.id, partId: bin.partId, colorId: bin.colorId, locationId: bin.locationId, locationKey: bin.locationKey, quantity: bin.beforeQuantity, unitCost: bin.unitCost }, update: { quantity: bin.beforeQuantity, locationId: bin.locationId, unitCost: bin.unitCost } });
      await tx.inventoryChange.update({ where: { id: change.id }, data: { undoneAt: new Date() } });
      return tx.setInstance.findUniqueOrThrow({ where: { id }, include });
    });
    return NextResponse.json(instanceDto(result));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Änderung konnte nicht rückgängig gemacht werden." }, { status: 409 });
  }
}
