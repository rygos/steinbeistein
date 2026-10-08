import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json({ sets: [], parts: [] });
  const [sets, parts] = await Promise.all([
    prisma.setInstance.findMany({ where: { OR: [{ nickname: { contains: query, mode: "insensitive" } }, { definition: { setNumber: { contains: query, mode: "insensitive" } } }, { definition: { name: { contains: query, mode: "insensitive" } } }] }, select: { id: true, nickname: true, definition: { select: { setNumber: true, name: true, imageUrl: true } } }, take: 8, orderBy: { createdAt: "desc" } }),
    prisma.inventoryItem.findMany({ where: { OR: [{ part: { partNumber: { contains: query, mode: "insensitive" } } }, { part: { name: { contains: query, mode: "insensitive" } } }], definition: { instances: { some: {} } } }, select: { id: true, part: { select: { partNumber: true, name: true, imageUrl: true } }, color: { select: { name: true, rgb: true } }, definition: { select: { setNumber: true, name: true, instances: { select: { id: true, nickname: true }, take: 5 } } } }, take: 12, orderBy: { part: { partNumber: "asc" } } }),
  ]);
  return NextResponse.json({ sets, parts });
}
