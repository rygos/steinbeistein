import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const instances = await prisma.setInstance.findMany({
    include: {
      definition: { include: { inventory: { where: { sectionName: "Minifigur" }, include: { part: true, color: true } } } },
      missing: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const groups = new Map<string, {
    part: { id: string; number: string; name: string; imageUrl: string | null };
    color: { id: string; name: string; rgb: string | null };
    quantity: number;
    missing: number;
    sets: { instanceId: string; inventoryItemId: string; setNumber: string; name: string; nickname: string | null; quantity: number; missing: number }[];
  }>();

  for (const instance of instances) {
    const missingByItem = new Map(instance.missing.map((entry) => [entry.inventoryItemId, entry.quantity]));
    for (const item of instance.definition.inventory) {
      const missing = missingByItem.get(item.id) ?? 0;
      const key = `${item.partId}|${item.colorId}`;
      const group = groups.get(key) ?? {
        part: { id: item.part.id, number: item.part.partNumber, name: item.part.name, imageUrl: item.imageUrl ?? item.part.imageUrl },
        color: { id: item.color.id, name: item.color.name, rgb: item.color.rgb },
        quantity: 0,
        missing: 0,
        sets: [],
      };
      group.quantity += item.quantity;
      group.missing += missing;
      group.sets.push({ instanceId: instance.id, inventoryItemId: item.id, setNumber: instance.definition.setNumber, name: instance.definition.name, nickname: instance.nickname, quantity: item.quantity, missing });
      groups.set(key, group);
    }
  }

  return NextResponse.json([...groups.values()]);
}
