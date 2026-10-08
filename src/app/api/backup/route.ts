import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const records = z.array(z.record(z.unknown()));
const backupSchema = z.object({ format: z.literal("lego-fehlteile-backup"), version: z.literal(1), exportedAt: z.string(), definitions: records, parts: records, colors: records, instances: records, inventory: records, missing: records, reviews: records, shopping: records, imports: records, locations: records.default([]), looseStock: records.default([]), sessions: records.default([]), changes: records.default([]), orders: records.default([]), orderLines: records.default([]), photos: records.default([]), prices: records.default([]) });

export async function GET() {
  const [definitions, parts, colors, instances, inventory, missing, reviews, shopping, imports, locations, looseStock, sessions, changes, orders, orderLines, photos, prices] = await Promise.all([
    prisma.setDefinition.findMany(), prisma.part.findMany(), prisma.color.findMany(), prisma.setInstance.findMany(), prisma.inventoryItem.findMany(), prisma.missingPart.findMany(), prisma.inventoryReview.findMany(), prisma.shoppingItem.findMany(), prisma.importMetadata.findMany(), prisma.storageLocation.findMany(), prisma.loosePartStock.findMany(), prisma.inventorySession.findMany(), prisma.inventoryChange.findMany(), prisma.purchaseOrder.findMany(), prisma.purchaseOrderLine.findMany(), prisma.setPhoto.findMany(), prisma.brickLinkPrice.findMany(),
  ]);
  return NextResponse.json({ format: "lego-fehlteile-backup", version: 1, exportedAt: new Date().toISOString(), definitions, parts, colors, instances, inventory, missing, reviews, shopping, imports, locations, looseStock, sessions, changes, orders, orderLines, photos, prices }, { headers: { "Content-Disposition": `attachment; filename="lego-fehlteile-${new Date().toISOString().slice(0, 10)}.json"` } });
}

export async function POST(request: NextRequest) {
  const parsed = backupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Die Datei ist kein gültiges Backup dieser Anwendung." }, { status: 400 });
  try {
    const counts = await prisma.$transaction(async (tx) => {
      const definitionIds = new Map<string, string>();
      const partIds = new Map<string, string>();
      const colorIds = new Map<string, string>();
      const instanceIds = new Map<string, string>();
      const itemIds = new Map<string, string>();
      const locationIds = new Map<string, string>();
      const orderIds = new Map<string, string>();
      for (const raw of parsed.data.locations) {
        const value = raw as { id: string; name: string; description?: string | null };
        const saved = await tx.storageLocation.upsert({ where: { name: value.name }, create: { id: value.id, name: value.name, description: value.description ?? null }, update: {} }); locationIds.set(value.id, saved.id);
      }
      for (const raw of parsed.data.definitions) {
        const value = raw as { id: string; setNumber: string; name: string; year?: number | null; theme?: string | null; imageUrl?: string | null; pieceCount?: number | null; provider?: string; externalId?: string | null; bricklinkId?: string | null; importedAt?: string; refreshedAt?: string | null; importMetadata?: object | null };
        const saved = await tx.setDefinition.upsert({ where: { setNumber: value.setNumber }, create: { id: value.id, setNumber: value.setNumber, name: value.name, year: value.year ?? null, theme: value.theme ?? null, imageUrl: value.imageUrl ?? null, pieceCount: value.pieceCount ?? null, provider: value.provider ?? "rebrickable", externalId: value.externalId ?? null, bricklinkId: value.bricklinkId ?? null, importedAt: value.importedAt ? new Date(value.importedAt) : new Date(), refreshedAt: value.refreshedAt ? new Date(value.refreshedAt) : null, importMetadata: value.importMetadata ? value.importMetadata as Prisma.InputJsonValue : Prisma.JsonNull }, update: {} });
        definitionIds.set(value.id, saved.id);
      }
      for (const raw of parsed.data.parts) {
        const value = raw as { id: string; rebrickableId: string; name: string; partNumber: string; bricklinkId?: string | null; imageUrl?: string | null; categoryId?: number | null; categoryName?: string | null; colorImages?: object | null };
        const saved = await tx.part.upsert({ where: { rebrickableId: value.rebrickableId }, create: { id: value.id, rebrickableId: value.rebrickableId, name: value.name, partNumber: value.partNumber, bricklinkId: value.bricklinkId ?? null, imageUrl: value.imageUrl ?? null, categoryId: value.categoryId ?? null, categoryName: value.categoryName ?? null, colorImages: value.colorImages ? value.colorImages as Prisma.InputJsonValue : Prisma.JsonNull }, update: {} }); partIds.set(value.id, saved.id);
      }
      for (const raw of parsed.data.colors) {
        const value = raw as { id: string; rebrickableId: number; name: string; rgb?: string | null; bricklinkId?: number | null };
        const saved = await tx.color.upsert({ where: { rebrickableId: value.rebrickableId }, create: value, update: {} }); colorIds.set(value.id, saved.id);
      }
      for (const raw of parsed.data.instances) {
        const value = raw as { id: string; definitionId: string; nickname?: string | null; createdAt?: string; storageLocationId?: string | null; condition?: string | null; hasInstructions?: boolean; instructionsCondition?: string | null; hasBox?: boolean; boxCondition?: string | null; notes?: string | null; collectionStatus?: "IN_COLLECTION" | "UNCHECKED" | "IN_PROGRESS" | "DISPLAYED" | "STORED" | "FOR_SALE"; purchasePrice?: number | null; purchaseCurrency?: string; purchasedAt?: string | null };
        const definitionId = definitionIds.get(value.definitionId); if (!definitionId) continue;
        const existing = await tx.setInstance.findFirst({ where: { id: value.id } });
        const storageLocationId = value.storageLocationId ? locationIds.get(value.storageLocationId) ?? null : null;
        const saved = existing?.definitionId === definitionId ? existing : await tx.setInstance.create({ data: { ...(existing ? {} : { id: value.id }), definitionId, nickname: value.nickname ?? null, createdAt: value.createdAt ? new Date(value.createdAt) : new Date(), storageLocationId, condition: value.condition as "LIKE_NEW" | "GOOD" | "PLAYED" | "DAMAGED" | null, hasInstructions: value.hasInstructions ?? false, instructionsCondition: value.instructionsCondition as "MINT" | "VERY_GOOD" | "GOOD" | "WORN" | "DAMAGED" | null, hasBox: value.hasBox ?? false, boxCondition: value.boxCondition as "MINT" | "VERY_GOOD" | "GOOD" | "WORN" | "DAMAGED" | null, notes: value.notes ?? null, collectionStatus: value.collectionStatus ?? "IN_COLLECTION", purchasePrice: value.purchasePrice ?? null, purchaseCurrency: value.purchaseCurrency ?? "EUR", purchasedAt: value.purchasedAt ? new Date(value.purchasedAt) : null } });
        instanceIds.set(value.id, saved.id);
      }
      for (const raw of parsed.data.inventory) {
        const value = raw as { id: string; definitionId: string; partId: string; colorId: string; quantity: number; imageUrl?: string | null; externalId?: string | null; legoElementId?: string | null; sectionName?: string | null; isManual?: boolean };
        const definitionId = definitionIds.get(value.definitionId), partId = partIds.get(value.partId), colorId = colorIds.get(value.colorId); if (!definitionId || !partId || !colorId) continue;
        const saved = await tx.inventoryItem.upsert({ where: { definitionId_partId_colorId: { definitionId, partId, colorId } }, create: { ...value, definitionId, partId, colorId }, update: {} }); itemIds.set(value.id, saved.id);
      }
      for (const raw of parsed.data.missing) {
        const value = raw as { instanceId: string; inventoryItemId: string; quantity: number };
        const instanceId = instanceIds.get(value.instanceId), inventoryItemId = itemIds.get(value.inventoryItemId); if (instanceId && inventoryItemId) await tx.missingPart.upsert({ where: { instanceId_inventoryItemId: { instanceId, inventoryItemId } }, create: { instanceId, inventoryItemId, quantity: value.quantity }, update: {} });
      }
      for (const raw of parsed.data.reviews) {
        const value = raw as { instanceId: string; inventoryItemId: string; reviewedAt?: string; status?: "PRESENT" | "DAMAGED" | "WRONG_COLOR" | "OTHER"; note?: string | null };
        const instanceId = instanceIds.get(value.instanceId), inventoryItemId = itemIds.get(value.inventoryItemId); if (instanceId && inventoryItemId) await tx.inventoryReview.upsert({ where: { instanceId_inventoryItemId: { instanceId, inventoryItemId } }, create: { instanceId, inventoryItemId, reviewedAt: value.reviewedAt ? new Date(value.reviewedAt) : new Date(), status: value.status ?? "PRESENT", note: value.note ?? null }, update: {} });
      }
      for (const raw of parsed.data.shopping) {
        const value = raw as { instanceId: string; inventoryItemId: string; quantity: number; status: "WANTED" | "ORDERED" | "RECEIVED" };
        const instanceId = instanceIds.get(value.instanceId), inventoryItemId = itemIds.get(value.inventoryItemId); if (instanceId && inventoryItemId) await tx.shoppingItem.upsert({ where: { instanceId_inventoryItemId_status: { instanceId, inventoryItemId, status: value.status } }, create: { instanceId, inventoryItemId, quantity: value.quantity, status: value.status }, update: {} });
      }
      for (const raw of parsed.data.looseStock) {
        const value = raw as { partId: string; colorId: string; quantity: number; locationId?: string | null; locationKey?: string; unitCost?: number | null };
        const partId = partIds.get(value.partId), colorId = colorIds.get(value.colorId); if (!partId || !colorId) continue;
        const locationId = value.locationId ? locationIds.get(value.locationId) ?? null : null;
        const locationKey = locationId ?? value.locationKey ?? "none";
        await tx.loosePartStock.upsert({ where: { partId_colorId_locationKey: { partId, colorId, locationKey } }, create: { partId, colorId, quantity: value.quantity, locationId, locationKey, unitCost: value.unitCost ?? null }, update: {} });
      }
      for (const raw of parsed.data.sessions) {
        const value = raw as { instanceId: string; currentItemId?: string | null; groupBy: "number" | "color" | "category" | "section"; onlyUnchecked: boolean };
        const instanceId = instanceIds.get(value.instanceId), currentItemId = value.currentItemId ? itemIds.get(value.currentItemId) ?? null : null; if (!instanceId) continue;
        await tx.inventorySession.upsert({ where: { instanceId }, create: { instanceId, currentItemId, groupBy: value.groupBy, onlyUnchecked: value.onlyUnchecked }, update: {} });
      }
      for (const raw of parsed.data.orders) {
        const value = raw as { id: string; supplier: string; orderNumber?: string | null; orderedAt?: string; shippingCost?: number; currency?: string; notes?: string | null; status?: "ORDERED" | "PARTIAL" | "RECEIVED" | "CANCELLED" };
        const existing = await tx.purchaseOrder.findUnique({ where: { id: value.id } });
        const saved = existing ?? await tx.purchaseOrder.create({ data: { id: value.id, supplier: value.supplier, orderNumber: value.orderNumber ?? null, orderedAt: value.orderedAt ? new Date(value.orderedAt) : new Date(), shippingCost: value.shippingCost ?? 0, currency: value.currency ?? "EUR", notes: value.notes ?? null, status: value.status ?? "ORDERED" } });
        orderIds.set(value.id, saved.id);
      }
      for (const raw of parsed.data.orderLines) {
        const value = raw as { id: string; orderId: string; instanceId: string; inventoryItemId: string; quantity: number; receivedQuantity?: number; unitPrice?: number | null };
        const orderId = orderIds.get(value.orderId), instanceId = instanceIds.get(value.instanceId), inventoryItemId = itemIds.get(value.inventoryItemId);
        if (orderId && instanceId && inventoryItemId) await tx.purchaseOrderLine.createMany({ data: [{ id: value.id, orderId, instanceId, inventoryItemId, quantity: value.quantity, receivedQuantity: value.receivedQuantity ?? 0, unitPrice: value.unitPrice ?? null }], skipDuplicates: true });
      }
      for (const raw of parsed.data.photos) {
        const value = raw as { id: string; instanceId: string; name: string; mimeType: string; data: string; createdAt?: string };
        const instanceId = instanceIds.get(value.instanceId);
        if (instanceId) await tx.setPhoto.createMany({ data: [{ id: value.id, instanceId, name: value.name, mimeType: value.mimeType, data: value.data, createdAt: value.createdAt ? new Date(value.createdAt) : new Date() }], skipDuplicates: true });
      }
      for (const raw of parsed.data.changes) {
        const value = raw as { id: string; instanceId: string; inventoryItemId: string; mutationId?: string | null; beforeMissing: number; afterMissing: number; beforeReviewed: boolean; afterReviewed: boolean; beforeStatus?: "PRESENT" | "DAMAGED" | "WRONG_COLOR" | "OTHER" | null; afterStatus?: "PRESENT" | "DAMAGED" | "WRONG_COLOR" | "OTHER" | null; beforeReviewNote?: string | null; afterReviewNote?: string | null; reason?: string | null; beforeShopping?: Prisma.InputJsonValue; afterShopping?: Prisma.InputJsonValue; undoneAt?: string | null; createdAt?: string };
        const instanceId = instanceIds.get(value.instanceId), inventoryItemId = itemIds.get(value.inventoryItemId);
        if (instanceId && inventoryItemId) await tx.inventoryChange.createMany({ data: [{ id: value.id, instanceId, inventoryItemId, mutationId: value.mutationId ?? null, beforeMissing: value.beforeMissing, afterMissing: value.afterMissing, beforeReviewed: value.beforeReviewed, afterReviewed: value.afterReviewed, beforeStatus: value.beforeStatus ?? null, afterStatus: value.afterStatus ?? null, beforeReviewNote: value.beforeReviewNote ?? null, afterReviewNote: value.afterReviewNote ?? null, reason: value.reason ?? null, beforeShopping: value.beforeShopping, afterShopping: value.afterShopping, undoneAt: value.undoneAt ? new Date(value.undoneAt) : null, createdAt: value.createdAt ? new Date(value.createdAt) : new Date() }], skipDuplicates: true });
      }
      for (const raw of parsed.data.prices) {
        const value = raw as { id: string; cacheKey: string; itemType: string; itemNumber: string; colorBricklinkId?: number | null; newOrUsed: string; guideType: string; currencyCode: string; minPrice?: number | null; maxPrice?: number | null; avgPrice?: number | null; qtyAvgPrice?: number | null; unitQuantity?: number | null; totalQuantity?: number | null; fetchedAt?: string };
        await tx.brickLinkPrice.createMany({ data: [{ ...value, fetchedAt: value.fetchedAt ? new Date(value.fetchedAt) : new Date() }], skipDuplicates: true });
      }
      for (const raw of parsed.data.imports) {
        const value = raw as { id: string; setNumber: string; provider: string; externalInventoryId?: string | null; providerVersion?: string | null; importedAt?: string; itemCount: number; result?: string; message?: string | null };
        await tx.importMetadata.createMany({ data: [{ ...value, importedAt: value.importedAt ? new Date(value.importedAt) : new Date() }], skipDuplicates: true });
      }
      return { definitions: definitionIds.size, instances: instanceIds.size, inventory: itemIds.size };
    }, { timeout: 30000 });
    return NextResponse.json({ ok: true, merged: counts });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Backup konnte nicht eingelesen werden." }, { status: 400 }); }
}
