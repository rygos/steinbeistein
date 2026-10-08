import { NextRequest, NextResponse } from "next/server";
import { PurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const schema = z.object({ supplier: z.string().trim().min(1).max(120), orderNumber: z.string().max(120).nullable().optional(), shippingCost: z.number().finite().min(0).max(100000).default(0), currency: z.string().length(3).default("EUR"), notes: z.string().max(1000).nullable().optional(), orderedAt: z.string().datetime().optional(), lines: z.array(z.object({ inventoryItemId: z.string().min(1), quantity: z.number().int().positive().max(10000), unitPrice: z.number().finite().min(0).nullable().optional() })).min(1).max(1000) });

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json(await prisma.purchaseOrder.findMany({ where: { lines: { some: { instanceId: id } } }, include: { lines: { where: { instanceId: id }, include: { inventoryItem: { include: { part: true, color: true } } } } }, orderBy: { orderedAt: "desc" } }));
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Händler und mindestens eine gültige Bestellposition angeben." }, { status: 400 });
  try {
    const order = await prisma.$transaction(async (tx) => {
      const instance = await tx.setInstance.findUnique({ where: { id }, select: { id: true } });
      if (!instance) throw new Error("Set-Exemplar nicht gefunden.");
      const inventoryIds = [...new Set(parsed.data.lines.map((line) => line.inventoryItemId))];
      const items = await tx.inventoryItem.findMany({ where: { id: { in: inventoryIds }, definition: { instances: { some: { id } } } } });
      if (items.length !== inventoryIds.length) throw new Error("Eine Bestellposition gehört nicht zu diesem Set.");
      for (const line of parsed.data.lines) {
        const missing = await tx.missingPart.findUnique({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: line.inventoryItemId } } });
        const shopping = await tx.shoppingItem.aggregate({ where: { instanceId: id, inventoryItemId: line.inventoryItemId, status: { in: ["WANTED", "ORDERED"] } }, _sum: { quantity: true } });
        if (line.quantity + (shopping._sum.quantity ?? 0) > (missing?.quantity ?? 0)) throw new Error("Eine Bestellmenge überschreitet die aktuelle Fehlmenge.");
      }
      const created = await tx.purchaseOrder.create({ data: { supplier: parsed.data.supplier, orderNumber: parsed.data.orderNumber ?? null, shippingCost: parsed.data.shippingCost, currency: parsed.data.currency.toUpperCase(), notes: parsed.data.notes ?? null, orderedAt: parsed.data.orderedAt ? new Date(parsed.data.orderedAt) : new Date(), status: PurchaseOrderStatus.ORDERED, lines: { create: parsed.data.lines.map((line) => ({ instanceId: id, inventoryItemId: line.inventoryItemId, quantity: line.quantity, unitPrice: line.unitPrice ?? null })) } }, include: { lines: true } });
      for (const line of created.lines) {
        const wanted = await tx.shoppingItem.findUnique({ where: { instanceId_inventoryItemId_status: { instanceId: id, inventoryItemId: line.inventoryItemId, status: "WANTED" } } });
        const move = Math.min(line.quantity, wanted?.quantity ?? 0);
        if (line.quantity > 0) {
          const ordered = await tx.shoppingItem.findUnique({ where: { instanceId_inventoryItemId_status: { instanceId: id, inventoryItemId: line.inventoryItemId, status: "ORDERED" } } });
          await tx.shoppingItem.upsert({ where: { instanceId_inventoryItemId_status: { instanceId: id, inventoryItemId: line.inventoryItemId, status: "ORDERED" } }, create: { instanceId: id, inventoryItemId: line.inventoryItemId, status: "ORDERED", quantity: line.quantity }, update: { quantity: { increment: line.quantity } } });
          if (wanted && move === wanted.quantity) await tx.shoppingItem.delete({ where: { id: wanted.id } }); else if (wanted && move > 0) await tx.shoppingItem.update({ where: { id: wanted.id }, data: { quantity: wanted.quantity - move } });
          if (!ordered) await tx.shoppingItem.updateMany({ where: { instanceId: id, inventoryItemId: line.inventoryItemId, status: "ORDERED" }, data: { updatedAt: new Date() } });
        }
      }
      return created;
    }, { timeout: 15000 });
    return NextResponse.json(order, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Bestellung konnte nicht gespeichert werden." }, { status: 400 }); }
}
