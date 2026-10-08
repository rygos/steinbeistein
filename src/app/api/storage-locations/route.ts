import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const schema = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(240).optional() });

export async function GET() {
  return NextResponse.json(await prisma.storageLocation.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { instances: true, looseStock: true } } } }));
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte einen gültigen Lagerortnamen angeben." }, { status: 400 });
  try {
    const location = await prisma.storageLocation.upsert({ where: { name: parsed.data.name }, create: parsed.data, update: {} });
    return NextResponse.json(location, { status: 201 });
  } catch { return NextResponse.json({ error: "Lagerort konnte nicht gespeichert werden." }, { status: 400 }); }
}
