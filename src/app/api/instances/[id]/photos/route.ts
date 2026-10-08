import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const photoInput = z.object({ name: z.string().trim().min(1).max(160), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().min(1).max(8_000_000) });

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json(await prisma.setPhoto.findMany({ where: { instanceId: id }, select: { id: true, name: true, mimeType: true, data: true, createdAt: true }, orderBy: { createdAt: "desc" } }));
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = photoInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte ein JPG-, PNG- oder WebP-Foto bis 6 MB auswählen." }, { status: 400 });
  const instance = await prisma.setInstance.findUnique({ where: { id }, select: { id: true } });
  if (!instance) return NextResponse.json({ error: "Set-Exemplar nicht gefunden." }, { status: 404 });
  const existing = await prisma.setPhoto.count({ where: { instanceId: id } });
  if (existing >= 20) return NextResponse.json({ error: "Pro Exemplar sind maximal 20 Fotos möglich." }, { status: 400 });
  const photo = await prisma.setPhoto.create({ data: { instanceId: id, ...parsed.data } });
  return NextResponse.json({ id: photo.id, name: photo.name, mimeType: photo.mimeType, data: photo.data, createdAt: photo.createdAt }, { status: 201 });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const photoId = request.nextUrl.searchParams.get("photoId");
  if (!photoId) return NextResponse.json({ error: "Foto-ID fehlt." }, { status: 400 });
  await prisma.setPhoto.deleteMany({ where: { id: photoId, instanceId: id } });
  return NextResponse.json({ ok: true });
}
