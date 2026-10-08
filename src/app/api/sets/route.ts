import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { completenessPercent, instanceDto, reviewedPercent } from "@/lib/serializers";
import { legoProvider } from "@/lib/lego-provider";
import { normalizeInventory } from "@/lib/inventory-normalization";
import { z } from "zod";

export const dynamic = "force-dynamic";
const include = { definition: { include: { inventory: { include: { part: true, color: true } } } }, missing: true, reviews: true, storageLocation: true } as const;
const idSchema = z.string().min(1);

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (query) {
    try { return NextResponse.json(await legoProvider.searchSets(query)); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Suche fehlgeschlagen." }, { status: 502 }); }
  }
  const instances = await prisma.setInstance.findMany({ select: { id: true, nickname: true, createdAt: true, definition: { select: { id: true, setNumber: true, name: true, year: true, theme: true, imageUrl: true, pieceCount: true } } }, orderBy: { createdAt: "desc" } });
  const instanceIds = instances.map((instance) => instance.id);
  const [totals, missingRows, reviews] = await Promise.all([
    prisma.inventoryItem.groupBy({ by: ["definitionId"], where: { isManual: false }, _sum: { quantity: true }, _count: { _all: true } }),
    prisma.missingPart.findMany({ where: { instanceId: { in: instanceIds }, quantity: { gt: 0 }, inventoryItem: { isManual: false } }, select: { instanceId: true, inventoryItemId: true, quantity: true, inventoryItem: { select: { quantity: true } } } }),
    prisma.inventoryReview.findMany({ where: { instanceId: { in: instanceIds }, inventoryItem: { isManual: false } }, select: { instanceId: true, inventoryItemId: true, inventoryItem: { select: { quantity: true } } } }),
  ]);
  const totalMap = new Map(totals.map((entry) => [entry.definitionId, entry._sum.quantity ?? 0]));
  const positionMap = new Map(totals.map((entry) => [entry.definitionId, entry._count._all]));
  const reviewedByInstance = new Map<string, Map<string, number>>();
  const missingByInstance = new Map<string, { quantity: number; positions: Set<string> }>();
  for (const review of reviews) {
    const items = reviewedByInstance.get(review.instanceId) ?? new Map<string, number>();
    items.set(review.inventoryItemId, review.inventoryItem.quantity);
    reviewedByInstance.set(review.instanceId, items);
  }
  for (const row of missingRows) {
    const items = reviewedByInstance.get(row.instanceId) ?? new Map<string, number>();
    items.set(row.inventoryItemId, row.inventoryItem.quantity);
    reviewedByInstance.set(row.instanceId, items);
    const missing = missingByInstance.get(row.instanceId) ?? { quantity: 0, positions: new Set<string>() };
    missing.quantity += row.quantity;
    missing.positions.add(row.inventoryItemId);
    missingByInstance.set(row.instanceId, missing);
  }
  return NextResponse.json(instances.map((instance) => {
    const total = totalMap.get(instance.definition.id) ?? 0;
    const reviewedItems = reviewedByInstance.get(instance.id) ?? new Map<string, number>();
    const reviewedQuantity = [...reviewedItems.values()].reduce((sum, quantity) => sum + quantity, 0);
    const missing = missingByInstance.get(instance.id);
    const missingQuantity = missing?.quantity ?? 0;
    return { ...instance, total, missing: missingQuantity, positions: missing?.positions.size ?? 0, inventoryPositions: positionMap.get(instance.definition.id) ?? 0, reviewedPositions: reviewedItems.size, reviewedQuantity, checkedPercent: reviewedPercent(total, reviewedQuantity), complete: completenessPercent(total, missingQuantity, reviewedQuantity) };
  }));
}

const addSchema = z.object({ setNumber: z.string().min(1).max(30), nickname: z.string().max(80).optional().nullable(), forceRefresh: z.boolean().optional(), previewRefresh: z.boolean().optional(), instanceId: z.string().optional() });
export async function POST(request: NextRequest) {
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte eine gültige Setnummer angeben." }, { status: 400 });
  const setNumber = parsed.data.setNumber.trim();
  try {
    let definition = await prisma.setDefinition.findUnique({ where: { setNumber }, include: { inventory: true } });
    const importInfo = definition?.importMetadata;
    const needsMinifigImport = Boolean(definition && (!importInfo || typeof importInfo !== "object" || !("minifigInventoryVersion" in importInfo) || importInfo.minifigInventoryVersion !== 2));
    if (parsed.data.previewRefresh && !definition) return NextResponse.json({ error: "Eine Aktualisierungsvorschau ist nur für bereits importierte Sets verfügbar." }, { status: 404 });
    if (!definition || parsed.data.forceRefresh || parsed.data.previewRefresh || needsMinifigImport) {
      const matches = await legoProvider.searchSets(setNumber);
      const selected = matches.find((set) => set.set_num.toLowerCase() === setNumber.toLowerCase()) ?? (matches.length === 1 ? matches[0] : undefined);
      if (!selected) return NextResponse.json({ error: matches.length ? "Mehrere Sets gefunden. Bitte wähle zuerst das gewünschte Set." : "Kein passendes Set gefunden.", matches }, { status: 404 });
      const inventoryResponse = await legoProvider.getInventory(selected.set_num);
      const rows = normalizeInventory(inventoryResponse.results);
      const partCategories = await legoProvider.getPartCategories().catch(() => new Map<number, string>());
      const themeName = await legoProvider.getThemeName(selected.theme_id);
      if (!rows.length) return NextResponse.json({ error: "Das Set lieferte ein leeres Inventar. Es wurde nichts gespeichert." }, { status: 422 });
      if (parsed.data.previewRefresh && definition) {
        const current = await prisma.inventoryItem.findMany({ where: { definitionId: definition.id }, include: { part: true, color: true, missing: true } });
        const oldByKey = new Map(current.map((item) => [`${item.part.rebrickableId}|${item.color.rebrickableId}`, item]));
        const newByKey = new Map(rows.map((row) => [`${row.part.part_num}|${row.color.id}`, row]));
        const added = rows.filter((row) => !oldByKey.has(`${row.part.part_num}|${row.color.id}`)).map((row) => ({ part: row.part.part_num, name: row.part.name, color: row.color.name, quantity: row.quantity }));
        const removed = current.filter((item) => !newByKey.has(`${item.part.rebrickableId}|${item.color.rebrickableId}`)).map((item) => ({ part: item.part.partNumber, name: item.part.name, color: item.color.name, quantity: item.quantity, missing: item.missing.reduce((sum, miss) => sum + miss.quantity, 0) }));
        const changed = current.flatMap((item) => { const row = newByKey.get(`${item.part.rebrickableId}|${item.color.rebrickableId}`); return row && row.quantity !== item.quantity ? [{ part: item.part.partNumber, name: item.part.name, color: item.color.name, oldQuantity: item.quantity, newQuantity: row.quantity }] : []; });
        return NextResponse.json({ preview: true, inventoryDelta: { added, removed, changed, addedCount: added.length, removedCount: removed.length, changedCount: changed.length } });
      }
      definition = await prisma.$transaction(async (tx) => {
        const importMetadata = { provider: "Rebrickable API v3", downloadedRows: inventoryResponse.results.length, normalizedRows: rows.length, minifigInventoryVersion: 2, minifigCount: inventoryResponse.minifigCount ?? 0, minifigPartRows: inventoryResponse.minifigPartRows ?? 0 };
        const def = await tx.setDefinition.upsert({ where: { setNumber: selected.set_num }, create: { setNumber: selected.set_num, name: selected.name, year: selected.year, theme: themeName, imageUrl: selected.set_img_url, pieceCount: selected.num_parts, provider: "rebrickable", externalId: String(inventoryResponse.id ?? ""), importedAt: new Date(), importMetadata }, update: { name: selected.name, year: selected.year, theme: themeName, imageUrl: selected.set_img_url, pieceCount: selected.num_parts, refreshedAt: new Date() } });
        if (parsed.data.forceRefresh || needsMinifigImport || !(await tx.inventoryItem.count({ where: { definitionId: def.id } }))) {
          const old = await tx.inventoryItem.findMany({ where: { definitionId: def.id }, include: { part: true, color: true } });
          const oldKeys = new Map(old.map((item) => [`${item.part.rebrickableId}|${item.color.rebrickableId}`, item]));
          const normalizedKeys = new Set(rows.map((row) => `${row.part.part_num}|${row.color.id}`));
          const delta = { added: rows.filter((row) => !oldKeys.has(`${row.part.part_num}|${row.color.id}`)).length, removed: old.filter((item) => !normalizedKeys.has(`${item.part.rebrickableId}|${item.color.rebrickableId}`)).length };
          const parts = [...new Map(rows.map((row) => [row.part.part_num, row])).values()].map((row) => ({ rebrickableId: row.part.part_num, partNumber: row.part.part_num, name: row.part.name ?? row.part.part_num, imageUrl: row.part.part_img_url ?? null, categoryId: row.part.part_cat_id ?? null, categoryName: row.part.part_cat_id ? partCategories.get(row.part.part_cat_id) ?? null : row.part.part_cat_name ?? null, bricklinkId: Array.isArray(row.part.external_ids?.BrickLink) ? String(row.part.external_ids?.BrickLink[0]) : null }));
          const colors = [...new Map(rows.map((row) => [row.color.id, row])).values()].map((row) => ({ rebrickableId: row.color.id, name: row.color.name ?? "Unbekannt", rgb: row.color.rgb ?? null, bricklinkId: Array.isArray(row.color.external_ids?.BrickLink) ? Number(row.color.external_ids?.BrickLink[0]) : null }));
          await tx.part.createMany({ data: parts, skipDuplicates: true });
          for (const part of parts.filter((entry) => entry.categoryId !== null && entry.categoryName)) await tx.part.updateMany({ where: { rebrickableId: part.rebrickableId, categoryName: null }, data: { categoryId: part.categoryId, categoryName: part.categoryName } });
          await tx.color.createMany({ data: colors, skipDuplicates: true });
          const partMap = new Map((await tx.part.findMany({ where: { rebrickableId: { in: parts.map((part) => part.rebrickableId) } } })).map((part) => [part.rebrickableId, part]));
          const colorMap = new Map((await tx.color.findMany({ where: { rebrickableId: { in: colors.map((color) => color.rebrickableId) } } })).map((color) => [color.rebrickableId, color]));
          const inventoryRows = rows.map((row) => ({ row, part: partMap.get(row.part.part_num)!, color: colorMap.get(row.color.id)! }));
          if (!old.length) {
            await tx.inventoryItem.createMany({ data: inventoryRows.map(({ row, part, color }) => ({ definitionId: def.id, partId: part.id, colorId: color.id, quantity: row.quantity, imageUrl: row.part.part_img_url ?? part.imageUrl, externalId: String(row.id ?? ""), legoElementId: row.element_id ?? null, sectionName: row.is_minifig_part ? "Minifigur" : null })) });
          } else {
            for (const { row, part, color } of inventoryRows) {
              const existing = oldKeys.get(`${row.part.part_num}|${row.color.id}`);
              const maxMissing = existing ? await tx.missingPart.aggregate({ where: { inventoryItemId: existing.id }, _max: { quantity: true } }) : null;
              const preservedMissing = maxMissing?._max.quantity ?? 0;
              await tx.inventoryItem.upsert({ where: { definitionId_partId_colorId: { definitionId: def.id, partId: part.id, colorId: color.id } }, create: { definitionId: def.id, partId: part.id, colorId: color.id, quantity: row.quantity, imageUrl: row.part.part_img_url ?? part.imageUrl, externalId: String(row.id ?? ""), legoElementId: row.element_id ?? null, sectionName: row.is_minifig_part ? "Minifigur" : null }, update: { quantity: Math.max(row.quantity, preservedMissing), imageUrl: row.part.part_img_url ?? part.imageUrl, isManual: preservedMissing > row.quantity, externalId: String(row.id ?? ""), legoElementId: row.element_id ?? null, sectionName: row.is_minifig_part ? "Minifigur" : null } });
            }
          }
          for (const obsolete of old.filter((item) => !normalizedKeys.has(`${item.part.rebrickableId}|${item.color.rebrickableId}`) && !item.isManual)) {
            const maxMissing = await tx.missingPart.aggregate({ where: { inventoryItemId: obsolete.id }, _max: { quantity: true } });
            if ((maxMissing._max.quantity ?? 0) > 0) await tx.inventoryItem.update({ where: { id: obsolete.id }, data: { quantity: maxMissing._max.quantity as number, isManual: true } });
            else await tx.inventoryItem.delete({ where: { id: obsolete.id } });
          }
          await tx.setDefinition.update({ where: { id: def.id }, data: { importMetadata: { ...importMetadata, inventoryDelta: delta } } });
          await tx.importMetadata.create({ data: { setNumber: selected.set_num, provider: "rebrickable", externalInventoryId: String(inventoryResponse.id ?? ""), providerVersion: "API v3", itemCount: rows.length } });
        }
        return tx.setDefinition.findUniqueOrThrow({ where: { id: def.id }, include: { inventory: true } });
      });
    }
    if (parsed.data.forceRefresh && parsed.data.instanceId) {
      const instance = await prisma.setInstance.findFirst({ where: { id: parsed.data.instanceId, definitionId: definition.id }, include });
      if (!instance) return NextResponse.json({ error: "Set-Exemplar nicht gefunden." }, { status: 404 });
      return NextResponse.json(instanceDto(instance));
    }
    const instance = await prisma.setInstance.create({ data: { definitionId: definition.id, nickname: parsed.data.nickname?.trim() || null }, include });
    return NextResponse.json(instanceDto(instance), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Set konnte nicht importiert werden.";
    await prisma.importMetadata.create({ data: { setNumber, provider: "rebrickable", providerVersion: "API v3", itemCount: 0, result: "error", message } }).catch(() => null);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
