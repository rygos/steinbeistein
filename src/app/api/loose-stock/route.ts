import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { legoProvider } from "@/lib/lego-provider";

export const dynamic = "force-dynamic";
const schema = z.object({ partNumber: z.string().trim().min(1).max(40), colorId: z.number().int().positive(), quantity: z.number().int().min(0).max(100000), locationId: z.string().nullable().optional(), unitCost: z.number().finite().min(0).max(100000).nullable().optional() });
const updateSchema = z.object({ id: z.string().min(1), quantity: z.number().int().min(0).max(100000), locationId: z.string().nullable(), unitCost: z.number().finite().min(0).max(100000).nullable() });

export async function GET() {
  const [stock, missing] = await Promise.all([
    prisma.loosePartStock.findMany({ include: { part: true, color: true, location: true }, orderBy: [{ part: { partNumber: "asc" } }, { color: { name: "asc" } }, { location: { name: "asc" } }] }),
    prisma.missingPart.findMany({ where: { quantity: { gt: 0 } }, select: { quantity: true, inventoryItem: { select: { partId: true, colorId: true, part: { select: { id: true, partNumber: true, name: true, imageUrl: true } }, color: { select: { id: true, name: true, rgb: true } } } }, instance: { select: { id: true, nickname: true, definition: { select: { setNumber: true, name: true } } } } } }),
  ]);
  const inventoryImages = await prisma.inventoryItem.findMany({
    where: { imageUrl: { not: null }, OR: stock.map((row) => ({ partId: row.partId, colorId: row.colorId })) },
    select: { partId: true, colorId: true, imageUrl: true },
  });
  const colorImageByKey = new Map<string, string>();
  for (const item of inventoryImages) if (item.imageUrl) colorImageByKey.set(`${item.partId}|${item.colorId}`, item.imageUrl);
  const missingByKey = new Map<string, { quantity: number; sets: { instanceId: string; name: string; setNumber: string; quantity: number }[] }>();
  for (const row of missing) {
    const key = `${row.inventoryItem.partId}|${row.inventoryItem.colorId}`;
    const group = missingByKey.get(key) ?? { quantity: 0, sets: [] };
    group.quantity += row.quantity;
    group.sets.push({ instanceId: row.instance.id, name: row.instance.nickname || row.instance.definition.name, setNumber: row.instance.definition.setNumber, quantity: row.quantity });
    missingByKey.set(key, group);
  }
  const costTotals = new Map<string, { amount: number; quantity: number }>();
  const stockGroups = new Map<string, { part: typeof stock[number]["part"]; color: typeof stock[number]["color"]; quantity: number; locations: { id: string; locationId: string | null; name: string; quantity: number; unitCost: number | null }[] }>();
  for (const row of stock) {
    const key = `${row.partId}|${row.colorId}`;
    const current = stockGroups.get(key) ?? { part: row.part, color: row.color, quantity: 0, locations: [] };
    if (row.unitCost !== null) {
      const costs = costTotals.get(key) ?? { amount: 0, quantity: 0 };
      costs.amount += row.unitCost * row.quantity;
      costs.quantity += row.quantity;
      costTotals.set(key, costs);
    }
    current.quantity += row.quantity;
    current.locations.push({ id: row.id, locationId: row.locationId, name: row.location?.name ?? "Ohne Lagerort", quantity: row.quantity, unitCost: row.unitCost });
    stockGroups.set(key, current);
  }
  const stockRows = [...stockGroups.entries()].map(([key, row]) => {
    const demand = missingByKey.get(key) ?? { quantity: 0, sets: [] };
    const costs = costTotals.get(key);
    return { id: key, part: { id: row.part.id, number: row.part.partNumber, name: row.part.name, imageUrl: colorImageByKey.get(key) ?? row.part.imageUrl }, color: { id: row.color.id, sourceId: row.color.rebrickableId, name: row.color.name, rgb: row.color.rgb }, quantity: row.quantity, unitCost: costs ? costs.amount / costs.quantity : null, locations: row.locations, missingQuantity: demand.quantity, covered: Math.min(row.quantity, demand.quantity), surplus: Math.max(0, row.quantity - demand.quantity), toBuy: Math.max(0, demand.quantity - row.quantity), sets: demand.sets };
  });
  const quantityByKey = new Map([...stockGroups.entries()].map(([key, row]) => [key, row.quantity]));
  const summary = [...missingByKey.entries()].map(([key, value]) => ({ key, ...value, available: quantityByKey.get(key) ?? 0 })).reduce((acc, row) => ({ needed: acc.needed + row.quantity, covered: acc.covered + Math.min(row.quantity, row.available), toBuy: acc.toBuy + Math.max(0, row.quantity - row.available) }), { needed: 0, covered: 0, toBuy: 0 });
  return NextResponse.json({ stock: stockRows, summary });
}

export async function PATCH(request: NextRequest) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Menge, Lagerort und Einstandspreis prüfen." }, { status: 400 });
  try {
    if (parsed.data.locationId && !(await prisma.storageLocation.findUnique({ where: { id: parsed.data.locationId } }))) throw new Error("Der gewählte Lagerort existiert nicht.");
    await prisma.$transaction(async (tx) => {
      const current = await tx.loosePartStock.findUnique({ where: { id: parsed.data.id } });
      if (!current) throw new Error("Diese Lagerposition wurde nicht gefunden.");
      if (parsed.data.quantity === 0) {
        await tx.loosePartStock.delete({ where: { id: current.id } });
        return;
      }
      const locationKey = parsed.data.locationId ?? "none";
      if (locationKey === current.locationKey) {
        await tx.loosePartStock.update({ where: { id: current.id }, data: { quantity: parsed.data.quantity, unitCost: parsed.data.unitCost } });
        return;
      }
      const target = await tx.loosePartStock.findUnique({ where: { partId_colorId_locationKey: { partId: current.partId, colorId: current.colorId, locationKey } } });
      if (!target) {
        await tx.loosePartStock.update({ where: { id: current.id }, data: { quantity: parsed.data.quantity, unitCost: parsed.data.unitCost, locationId: parsed.data.locationId, locationKey } });
        return;
      }
      const pricedQuantity = (target.unitCost === null ? 0 : target.quantity) + (parsed.data.unitCost === null ? 0 : parsed.data.quantity);
      const unitCost = pricedQuantity === 0 ? null : ((target.unitCost ?? 0) * (target.unitCost === null ? 0 : target.quantity) + (parsed.data.unitCost ?? 0) * (parsed.data.unitCost === null ? 0 : parsed.data.quantity)) / pricedQuantity;
      await tx.loosePartStock.update({ where: { id: target.id }, data: { quantity: target.quantity + parsed.data.quantity, unitCost } });
      await tx.loosePartStock.delete({ where: { id: current.id } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bestand konnte nicht geändert werden." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Teil, Farbe und eine gültige Menge angeben." }, { status: 400 });
  try {
    if (parsed.data.locationId && !(await prisma.storageLocation.findUnique({ where: { id: parsed.data.locationId } }))) throw new Error("Der gewählte Lagerort existiert nicht.");
    const [parts, colors] = await Promise.all([legoProvider.searchParts(parsed.data.partNumber), legoProvider.getColors()]);
    const part = parts.find((entry) => entry.part_num.toLowerCase() === parsed.data.partNumber.toLowerCase()) ?? (parts.length === 1 ? parts[0] : null);
    const color = colors.find((entry) => entry.id === parsed.data.colorId);
    if (!part || !color) throw new Error("Teil oder Farbe wurde bei Rebrickable nicht eindeutig gefunden.");
    const saved = await prisma.$transaction(async (tx) => {
      const partRecord = await tx.part.upsert({ where: { rebrickableId: part.part_num }, create: { rebrickableId: part.part_num, partNumber: part.part_num, name: part.name, imageUrl: part.part_img_url }, update: { name: part.name, imageUrl: part.part_img_url } });
      const colorRecord = await tx.color.upsert({ where: { rebrickableId: color.id }, create: { rebrickableId: color.id, name: color.name, rgb: color.rgb }, update: { name: color.name, rgb: color.rgb } });
      if (parsed.data.quantity === 0) {
        await tx.loosePartStock.deleteMany({ where: { partId: partRecord.id, colorId: colorRecord.id, locationKey: parsed.data.locationId ?? "none" } });
        return null;
      }
      const locationKey = parsed.data.locationId ?? "none";
      return tx.loosePartStock.upsert({ where: { partId_colorId_locationKey: { partId: partRecord.id, colorId: colorRecord.id, locationKey } }, create: { partId: partRecord.id, colorId: colorRecord.id, quantity: parsed.data.quantity, locationId: parsed.data.locationId ?? null, locationKey, unitCost: parsed.data.unitCost ?? null }, update: { quantity: parsed.data.quantity, unitCost: parsed.data.unitCost ?? null } });
    });
    return NextResponse.json({ ok: true, stock: saved }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Teilebestand konnte nicht gespeichert werden." }, { status: 400 }); }
}
