import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const rows = await prisma.inventoryChange.findMany({ where: { instanceId: id }, include: { inventoryItem: { include: { part: true, color: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json(rows.map((row) => ({ id: row.id, part: row.inventoryItem.part.partNumber, name: row.inventoryItem.part.name, color: row.inventoryItem.color.name, beforeMissing: row.beforeMissing, afterMissing: row.afterMissing, reason: row.reason, changedAt: row.createdAt, undone: Boolean(row.undoneAt) })));
}
