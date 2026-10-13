import { NextRequest, NextResponse } from "next/server";
import { CollectionStatus, InventoryItemStatus, ItemCondition, SetCondition } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { instanceDto } from "@/lib/serializers";
import { z } from "zod";
import { validateMissingQuantity } from "@/lib/inventory-normalization";
export const dynamic = "force-dynamic";
const include = { definition: { include: { inventory: { include: { part: true, color: true } } } }, missing: true, reviews: true, storageLocation: true } as const;
const detailsSchema = z.object({ storageLocationId: z.string().nullable(), condition: z.nativeEnum(SetCondition).nullable(), hasInstructions: z.boolean(), instructionsCondition: z.nativeEnum(ItemCondition).nullable(), hasBox: z.boolean(), boxCondition: z.nativeEnum(ItemCondition).nullable(), notes: z.string().max(3000).nullable(), collectionStatus: z.nativeEnum(CollectionStatus), purchasePrice: z.number().finite().min(0).nullable(), purchaseCurrency: z.string().length(3), purchasedAt: z.string().datetime().nullable() }).partial();
const changeSchema = z.object({ inventoryItemId: z.string().min(1).optional(), delta: z.number().int().min(-10000).max(10000).optional(), setMissing: z.number().int().min(0).max(10000).optional(), reviewed: z.boolean().optional(), reviewStatus: z.nativeEnum(InventoryItemStatus).optional(), reviewNote: z.string().max(500).nullable().optional(), reason: z.string().max(300).nullable().optional(), mutationId: z.string().uuid().optional(), sectionName: z.string().trim().max(80).nullable().optional(), details: detailsSchema.optional() }).refine((data) => data.details !== undefined || (data.inventoryItemId !== undefined && (data.delta !== undefined || data.setMissing !== undefined || data.reviewed !== undefined || data.reviewStatus !== undefined || data.reviewNote !== undefined || data.sectionName !== undefined)));

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const instance = await prisma.setInstance.findUnique({ where: { id }, include });
  return instance ? NextResponse.json(instanceDto(instance)) : NextResponse.json({ error: "Set-Exemplar nicht gefunden." }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Änderung." }, { status: 400 });
  if (parsed.data.reviewed === false && (parsed.data.delta !== undefined || parsed.data.setMissing !== undefined)) return NextResponse.json({ error: "Eine Mengenänderung kann nicht gleichzeitig zurückgesetzt werden." }, { status: 400 });
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const instance = await tx.setInstance.findUnique({ where: { id }, select: { id: true } });
      if (!instance) throw new Error("Set-Exemplar nicht gefunden.");
      const priorMutation = parsed.data.mutationId ? await tx.inventoryChange.findUnique({ where: { mutationId: parsed.data.mutationId } }) : null;
      if (priorMutation) return tx.setInstance.findUniqueOrThrow({ where: { id }, include });
      if (parsed.data.details) {
        if (parsed.data.details.storageLocationId && !(await tx.storageLocation.findUnique({ where: { id: parsed.data.details.storageLocationId } }))) throw new Error("Der gewählte Lagerort existiert nicht.");
        await tx.setInstance.update({ where: { id }, data: parsed.data.details });
      }
      if (parsed.data.inventoryItemId) {
        const inventory = await tx.inventoryItem.findUnique({ where: { id: parsed.data.inventoryItemId }, select: { id: true, quantity: true, sectionName: true, isManual: true, definition: { select: { instances: { where: { id }, select: { id: true } } } } } });
        if (!inventory || !inventory.definition.instances.length) throw new Error("Dieses Teil gehört nicht zu diesem Set.");
        const old = await tx.missingPart.findUnique({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: inventory.id } } });
        const oldReview = await tx.inventoryReview.findUnique({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: inventory.id } } });
        const beforeMissing = old?.quantity ?? 0;
        const beforeReviewed = Boolean(oldReview) || Boolean(old?.confirmed) || inventory.isManual;
        const beforeShopping = await tx.shoppingItem.findMany({ where: { instanceId: id, inventoryItemId: inventory.id, status: { in: ["WANTED", "ORDERED"] } }, select: { status: true, quantity: true } });
        let afterMissing = beforeMissing;
        let afterConfirmed = Boolean(old?.confirmed);
        if (parsed.data.delta !== undefined || parsed.data.setMissing !== undefined) {
          afterMissing = validateMissingQuantity(parsed.data.setMissing ?? (beforeMissing + (parsed.data.delta ?? 0)), inventory.quantity);
          if (afterMissing === 0) await tx.missingPart.deleteMany({ where: { instanceId: id, inventoryItemId: inventory.id } });
          else await tx.missingPart.upsert({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: inventory.id } }, create: { instanceId: id, inventoryItemId: inventory.id, quantity: afterMissing, confirmed: true }, update: { quantity: afterMissing, confirmed: true } });
          afterConfirmed = afterMissing > 0;
        }
        if (parsed.data.reviewed === false) {
          if (afterMissing > 0) throw new Error("Ein Teil mit eingetragener Fehlmenge kann nicht als ungeprüft markiert werden.");
          await tx.inventoryReview.deleteMany({ where: { instanceId: id, inventoryItemId: inventory.id } });
        } else if (parsed.data.reviewed === true || parsed.data.reviewStatus !== undefined || parsed.data.reviewNote !== undefined || parsed.data.delta !== undefined || parsed.data.setMissing !== undefined) {
          await tx.inventoryReview.upsert({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: inventory.id } }, create: { instanceId: id, inventoryItemId: inventory.id, status: parsed.data.reviewStatus ?? InventoryItemStatus.PRESENT, note: parsed.data.reviewNote ?? null }, update: { reviewedAt: new Date(), ...(parsed.data.reviewStatus ? { status: parsed.data.reviewStatus } : {}), ...(parsed.data.reviewNote !== undefined ? { note: parsed.data.reviewNote } : {}) } });
        }
        if (afterMissing > 0 && (parsed.data.reviewed === true || parsed.data.reviewStatus !== undefined || parsed.data.reviewNote !== undefined)) {
          await tx.missingPart.updateMany({ where: { instanceId: id, inventoryItemId: inventory.id }, data: { confirmed: true } });
          afterConfirmed = true;
        }
        if (parsed.data.sectionName !== undefined) await tx.inventoryItem.update({ where: { id: inventory.id }, data: { sectionName: parsed.data.sectionName || null } });
        const afterReview = parsed.data.reviewed === false ? null : await tx.inventoryReview.findUnique({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: inventory.id } } });
        if (afterMissing !== beforeMissing) {
          let excess = Math.max(0, beforeShopping.reduce((sum, row) => sum + row.quantity, 0) - afterMissing);
          for (const row of await tx.shoppingItem.findMany({ where: { instanceId: id, inventoryItemId: inventory.id, status: { in: ["WANTED", "ORDERED"] } }, orderBy: { status: "asc" } })) {
            if (!excess) break;
            const remaining = Math.max(0, row.quantity - excess);
            excess -= row.quantity - remaining;
            if (remaining) await tx.shoppingItem.update({ where: { id: row.id }, data: { quantity: remaining } });
            else await tx.shoppingItem.delete({ where: { id: row.id } });
          }
        }
        const afterReviewed = Boolean(afterReview) || (afterMissing > 0 && afterConfirmed) || inventory.isManual;
        const afterStatus = afterReview?.status ?? null;
        const afterShopping = await tx.shoppingItem.findMany({ where: { instanceId: id, inventoryItemId: inventory.id, status: { in: ["WANTED", "ORDERED"] } }, select: { status: true, quantity: true }, orderBy: { status: "asc" } });
        if (afterMissing !== beforeMissing || beforeReviewed !== afterReviewed || oldReview?.status !== afterStatus || oldReview?.note !== (afterReview?.note ?? null)) {
          await tx.inventoryChange.create({ data: { instanceId: id, inventoryItemId: inventory.id, mutationId: parsed.data.mutationId ?? null, beforeMissing, afterMissing, beforeReviewed, afterReviewed, beforeStatus: oldReview?.status ?? null, afterStatus, beforeReviewNote: oldReview?.note ?? null, afterReviewNote: afterReview?.note ?? null, reason: parsed.data.reason ?? null, beforeShopping, afterShopping } });
        }
      }
      return tx.setInstance.findUniqueOrThrow({ where: { id }, include });
    });
    return NextResponse.json(instanceDto(updated));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Änderung fehlgeschlagen." }, { status: 400 }); }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await prisma.setInstance.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
