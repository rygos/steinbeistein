import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const instances = await prisma.setInstance.findMany({
    select: {
      id: true,
      definition: {
        select: {
          inventory: {
            where: { isManual: false },
            select: {
              id: true,
              quantity: true,
              imageUrl: true,
              isManual: true,
              part: { select: { id: true, partNumber: true, name: true, imageUrl: true } },
              color: { select: { id: true, name: true } },
            },
          },
        },
      },
      missing: { where: { quantity: { gt: 0 } }, select: { inventoryItemId: true, quantity: true } },
    },
  });

  return NextResponse.json(instances.map((instance) => {
    const missingByItem = new Map(instance.missing.map((missing) => [missing.inventoryItemId, missing.quantity]));
    return {
      instanceId: instance.id,
      inventory: instance.definition.inventory.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        isManual: item.isManual,
        missing: missingByItem.get(item.id) ?? 0,
        part: { id: item.part.id, number: item.part.partNumber, name: item.part.name, imageUrl: item.imageUrl ?? item.part.imageUrl },
        color: { id: item.color.id, name: item.color.name },
      })),
    };
  }));
}
