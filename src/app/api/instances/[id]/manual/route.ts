import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { legoProvider } from "@/lib/lego-provider";
const schema = z.object({ partNumber: z.string().min(1).max(40), colorId: z.number().int().nonnegative(), quantity: z.number().int().positive().max(10000) });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Teilenummer, Farbe und eine positive Anzahl sind erforderlich." }, { status: 400 });
  try {
    const [parts, colors] = await Promise.all([legoProvider.searchParts(input.data.partNumber), legoProvider.getColors()]);
    const part = parts.find((entry) => entry.part_num.toLowerCase() === input.data.partNumber.trim().toLowerCase());
    const color = colors.find((entry) => entry.id === input.data.colorId);
    if (!part || !color) return NextResponse.json({ error: "Teil oder Farbe wurde bei Rebrickable nicht gefunden." }, { status: 404 });
    const result = await prisma.$transaction(async (tx) => {
      const instance = await tx.setInstance.findUnique({ where: { id }, select: { id: true, definitionId: true } });
      if (!instance) throw new Error("Set-Exemplar nicht gefunden.");
      const existingPart = await tx.part.upsert({ where: { rebrickableId: part.part_num }, create: { rebrickableId: part.part_num, partNumber: part.part_num, name: part.name, imageUrl: part.part_img_url }, update: { name: part.name, imageUrl: part.part_img_url } });
      const existingColor = await tx.color.upsert({ where: { rebrickableId: color.id }, create: { rebrickableId: color.id, name: color.name, rgb: color.rgb }, update: { name: color.name, rgb: color.rgb } });
      const inventory = await tx.inventoryItem.findUnique({ where: { definitionId_partId_colorId: { definitionId: instance.definitionId, partId: existingPart.id, colorId: existingColor.id } } });
      if (inventory) {
        const old = await tx.missingPart.findUnique({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: inventory.id } } });
        if ((old?.quantity ?? 0) + input.data.quantity > inventory.quantity) throw new Error(`Dieses Set benötigt ${inventory.quantity} Stück; eine Fehlmenge von ${input.data.quantity} zusätzlich wäre zu hoch.`);
        await tx.missingPart.upsert({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: inventory.id } }, create: { instanceId: id, inventoryItemId: inventory.id, quantity: input.data.quantity }, update: { quantity: (old?.quantity ?? 0) + input.data.quantity } });
        return { belongsToSet: true, quantity: input.data.quantity };
      }
      const manualInventory = await tx.inventoryItem.upsert({ where: { definitionId_partId_colorId: { definitionId: instance.definitionId, partId: existingPart.id, colorId: existingColor.id } }, create: { definitionId: instance.definitionId, partId: existingPart.id, colorId: existingColor.id, quantity: input.data.quantity, imageUrl: part.part_img_url, isManual: true }, update: { quantity: input.data.quantity, imageUrl: part.part_img_url, isManual: true } });
      await tx.missingPart.upsert({ where: { instanceId_inventoryItemId: { instanceId: id, inventoryItemId: manualInventory.id } }, create: { instanceId: id, inventoryItemId: manualInventory.id, quantity: input.data.quantity }, update: { quantity: input.data.quantity } });
      return { belongsToSet: false, quantity: input.data.quantity };
    });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Manuelles Fehlteil konnte nicht hinzugefügt werden." }, { status: 400 }); }
}
