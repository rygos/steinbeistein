import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const schema = z.object({ currentItemId: z.string().nullable(), groupBy: z.enum(["number", "color", "category"]), onlyUnchecked: z.boolean() });

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await prisma.inventorySession.findUnique({ where: { instanceId: id } });
  return NextResponse.json(session ?? { instanceId: id, currentItemId: null, groupBy: "number", onlyUnchecked: false });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiger Inventurstand." }, { status: 400 });
  const instance = await prisma.setInstance.findUnique({ where: { id }, select: { id: true, definitionId: true } });
  if (!instance) return NextResponse.json({ error: "Set-Exemplar nicht gefunden." }, { status: 404 });
  if (parsed.data.currentItemId) {
    const item = await prisma.inventoryItem.findFirst({ where: { id: parsed.data.currentItemId, definitionId: instance.definitionId }, select: { id: true } });
    if (!item) return NextResponse.json({ error: "Das Inventurteil gehört nicht zu diesem Set." }, { status: 400 });
  }
  const session = await prisma.inventorySession.upsert({ where: { instanceId: id }, create: { instanceId: id, ...parsed.data }, update: parsed.data });
  return NextResponse.json(session);
}
