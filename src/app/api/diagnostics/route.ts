import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET() {
  const [sets, instances, parts, colors, last, partsWithoutCategory, partsWithoutImage, colorsWithoutBricklinkId, partsWithoutBricklinkId] = await Promise.all([
    prisma.setDefinition.count(), prisma.setInstance.count(), prisma.part.count(), prisma.color.count(),
    prisma.importMetadata.findFirst({ where: { result: "success" }, orderBy: { importedAt: "desc" }, select: { importedAt: true } }),
    prisma.part.count({ where: { categoryName: null } }), prisma.part.count({ where: { imageUrl: null } }), prisma.color.count({ where: { bricklinkId: null } }), prisma.part.count({ where: { bricklinkId: null } }),
  ]);
  return NextResponse.json({ sets, instances, parts, colors, partsWithoutCategory, partsWithoutImage, colorsWithoutBricklinkId, partsWithoutBricklinkId, lastImport: last?.importedAt ?? null, provider: "Rebrickable API v3", providerConfigured: Boolean(process.env.REBRICKABLE_API_KEY) });
}
