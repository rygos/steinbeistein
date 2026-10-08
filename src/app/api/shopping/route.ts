import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const changeSchema = z.object({ instanceId: z.string().min(1), inventoryItemId: z.string().min(1), status: z.enum(["WANTED", "ORDERED"]).optional(), quantity: z.number().int().min(0).max(10000).optional(), moveToOrdered: z.boolean().optional(), receiveQuantity: z.number().int().min(1).max(10000).optional() }).refine((data) => data.moveToOrdered || data.receiveQuantity !== undefined || (data.status !== undefined && data.quantity !== undefined));

export async function GET() {
  const items = await prisma.shoppingItem.findMany({ where: { quantity: { gt: 0 } }, include: { inventoryItem: { include: { part: true, color: true, definition: true } }, instance: true } });
  const groups = new Map<string, { part: { id: string; number: string; name: string; imageUrl: string | null }; color: { id: string; name: string; rgb: string | null }; wanted: number; ordered: number; received: number; sets: { instanceId: string; inventoryItemId: string; setNumber: string; setName: string; nickname: string | null; wanted: number; ordered: number; received: number }[] }>();
  for (const line of items) {
    const item = line.inventoryItem;
    const key = `${item.partId}|${item.colorId}`;
    const group = groups.get(key) ?? { part: { id: item.part.id, number: item.part.partNumber, name: item.part.name, imageUrl: item.imageUrl ?? item.part.imageUrl }, color: { id: item.color.id, name: item.color.name, rgb: item.color.rgb }, wanted: 0, ordered: 0, received: 0, sets: [] };
    const set = group.sets.find((entry) => entry.instanceId === line.instanceId && entry.inventoryItemId === line.inventoryItemId) ?? { instanceId: line.instanceId, inventoryItemId: line.inventoryItemId, setNumber: item.definition.setNumber, setName: item.definition.name, nickname: line.instance.nickname, wanted: 0, ordered: 0, received: 0 };
    if (line.status === "WANTED") { group.wanted += line.quantity; set.wanted += line.quantity; } else if (line.status === "ORDERED") { group.ordered += line.quantity; set.ordered += line.quantity; } else { group.received += line.quantity; set.received += line.quantity; }
    if (!group.sets.includes(set)) group.sets.push(set);
    groups.set(key, group);
  }
  return NextResponse.json([...groups.values()].sort((a, b) => a.part.number.localeCompare(b.part.number, undefined, { numeric: true })));
}

export async function POST(request: NextRequest) {
  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiger Einkaufseintrag." }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: parsed.data.inventoryItemId, definition: { instances: { some: { id: parsed.data.instanceId } } } }, select: { id: true, quantity: true, isManual: true } });
      if (!item) throw new Error("Dieses Teil gehört nicht zu diesem Set.");
      const missing = await tx.missingPart.findUnique({ where: { instanceId_inventoryItemId: { instanceId: parsed.data.instanceId, inventoryItemId: item.id } } });
      if (parsed.data.moveToOrdered) {
        const wanted = await tx.shoppingItem.findUnique({ where: { instanceId_inventoryItemId_status: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: "WANTED" } } });
        if (!wanted) return;
        const ordered = await tx.shoppingItem.findUnique({ where: { instanceId_inventoryItemId_status: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: "ORDERED" } } });
        await tx.shoppingItem.upsert({ where: { instanceId_inventoryItemId_status: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: "ORDERED" } }, create: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: "ORDERED", quantity: wanted.quantity }, update: { quantity: (ordered?.quantity ?? 0) + wanted.quantity } });
        await tx.shoppingItem.delete({ where: { instanceId_inventoryItemId_status: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: "WANTED" } } });
        return;
      }
      if (parsed.data.receiveQuantity !== undefined) {
        const quantity = parsed.data.receiveQuantity;
        const ordered = await tx.shoppingItem.findUnique({ where: { instanceId_inventoryItemId_status: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: "ORDERED" } } });
        if (!ordered || quantity > ordered.quantity) throw new Error(`Es sind nur ${ordered?.quantity ?? 0} Stück bestellt.`);
        if (quantity > (missing?.quantity ?? 0)) throw new Error(`Es fehlen nur ${missing?.quantity ?? 0} Stück.`);
        const nextOrdered = ordered.quantity - quantity;
        if (nextOrdered) await tx.shoppingItem.update({ where: { id: ordered.id }, data: { quantity: nextOrdered } });
        else await tx.shoppingItem.delete({ where: { id: ordered.id } });
        await tx.shoppingItem.upsert({ where: { instanceId_inventoryItemId_status: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: "RECEIVED" } }, create: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: "RECEIVED", quantity }, update: { quantity: { increment: quantity } } });
        const nextMissing = (missing?.quantity ?? 0) - quantity;
        if (nextMissing) await tx.missingPart.update({ where: { id: missing!.id }, data: { quantity: nextMissing } });
        else if (missing) await tx.missingPart.delete({ where: { id: missing.id } });
        if (!item.isManual) await tx.inventoryReview.upsert({ where: { instanceId_inventoryItemId: { instanceId: parsed.data.instanceId, inventoryItemId: item.id } }, create: { instanceId: parsed.data.instanceId, inventoryItemId: item.id }, update: { reviewedAt: new Date() } });
        let remainingReceipt = quantity;
        const orderLines = await tx.purchaseOrderLine.findMany({ where: { instanceId: parsed.data.instanceId, inventoryItemId: item.id }, orderBy: { order: { orderedAt: "asc" } } });
        for (const orderLine of orderLines) {
          if (!remainingReceipt) break;
          const received = Math.min(remainingReceipt, orderLine.quantity - orderLine.receivedQuantity);
          if (!received) continue;
          await tx.purchaseOrderLine.update({ where: { id: orderLine.id }, data: { receivedQuantity: { increment: received } } });
          remainingReceipt -= received;
          const lines = await tx.purchaseOrderLine.findMany({ where: { orderId: orderLine.orderId } });
          const receivedCount = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
          const orderedCount = lines.reduce((sum, line) => sum + line.quantity, 0);
          await tx.purchaseOrder.update({ where: { id: orderLine.orderId }, data: { status: receivedCount >= orderedCount ? "RECEIVED" : "PARTIAL" } });
        }
        return;
      }
      const status = parsed.data.status!, quantity = parsed.data.quantity!;
      const other = await tx.shoppingItem.aggregate({ where: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status: { in: ["WANTED", "ORDERED"], not: status } }, _sum: { quantity: true } });
      if (quantity + (other._sum.quantity ?? 0) > (missing?.quantity ?? 0)) throw new Error("Die Einkaufsmengen dürfen die aktuelle Fehlmenge nicht überschreiten.");
      if (quantity === 0) await tx.shoppingItem.deleteMany({ where: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status } });
      else await tx.shoppingItem.upsert({ where: { instanceId_inventoryItemId_status: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status } }, create: { instanceId: parsed.data.instanceId, inventoryItemId: item.id, status, quantity }, update: { quantity } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Einkaufsliste konnte nicht aktualisiert werden." }, { status: 400 }); }
}
