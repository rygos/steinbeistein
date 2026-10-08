import { InventoryItem, Part, Color, SetDefinition, SetInstance, MissingPart, InventoryReview } from "@prisma/client";

export type FullItem = InventoryItem & { part: Part; color: Color };
export type FullInstance = SetInstance & { definition: SetDefinition & { inventory: FullItem[] }; missing: MissingPart[]; reviews: InventoryReview[]; storageLocation?: { id: string; name: string } | null };

export function completenessPercent(total: number, missing: number, reviewed = total) {
  if (total <= 0) return 100;
  const confirmedPresent = Math.max(0, Math.min(total, reviewed) - missing);
  const rounded = Math.round(confirmedPresent / total * 1000) / 10;
  if (confirmedPresent >= total) return 100;
  return Math.min(99.9, rounded);
}

export function reviewedPercent(total: number, reviewed: number) {
  if (total <= 0) return 100;
  return Math.round(Math.min(total, reviewed) / total * 1000) / 10;
}

export function summarize(instance: FullInstance) {
  const items = instance.definition.inventory.filter((item) => !item.isManual);
  const itemIds = new Set(items.map((item) => item.id));
  const missingById = new Map(instance.missing.map((item) => [item.inventoryItemId, item.quantity]));
  const reviewedIds = new Set(instance.reviews.map((review) => review.inventoryItemId));
  for (const [itemId, quantity] of missingById) if (quantity > 0 && itemIds.has(itemId)) reviewedIds.add(itemId);
  const reviewedItems = items.filter((item) => reviewedIds.has(item.id));
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  const reviewedQuantity = reviewedItems.reduce((sum, item) => sum + item.quantity, 0);
  const officialMissing = instance.missing.filter((item) => itemIds.has(item.inventoryItemId));
  const missing = officialMissing.reduce((sum, item) => sum + item.quantity, 0);
  return { total, missing, positions: officialMissing.filter((item) => item.quantity > 0).length, inventoryPositions: items.length, reviewedPositions: reviewedIds.size, reviewedQuantity, checkedPercent: reviewedPercent(total, reviewedQuantity), complete: completenessPercent(total, missing, reviewedQuantity) };
}

export function instanceDto(instance: FullInstance) {
  return { id: instance.id, nickname: instance.nickname, createdAt: instance.createdAt, storageLocationId: instance.storageLocationId, storageLocation: instance.storageLocation ?? null, condition: instance.condition, hasInstructions: instance.hasInstructions, instructionsCondition: instance.instructionsCondition, hasBox: instance.hasBox, boxCondition: instance.boxCondition, notes: instance.notes, collectionStatus: instance.collectionStatus, purchasePrice: instance.purchasePrice, purchaseCurrency: instance.purchaseCurrency, purchasedAt: instance.purchasedAt,
    definition: { id: instance.definition.id, setNumber: instance.definition.setNumber, name: instance.definition.name, year: instance.definition.year, theme: instance.definition.theme, imageUrl: instance.definition.imageUrl, pieceCount: instance.definition.pieceCount },
    inventoryDelta: instance.definition.importMetadata,
    ...summarize(instance), inventory: instance.definition.inventory.map((item) => { const review = instance.reviews.find((entry) => entry.inventoryItemId === item.id); const missing = instance.missing.find((entry) => entry.inventoryItemId === item.id)?.quantity ?? 0; return { id: item.id, quantity: item.quantity, isManual: item.isManual, sectionName: item.sectionName, status: missing ? "MISSING" : review?.status ?? "UNCHECKED", reviewNote: review?.note ?? null, part: { id: item.part.id, number: item.part.partNumber, name: item.part.name, imageUrl: item.imageUrl ?? item.part.imageUrl, categoryId: item.part.categoryId, categoryName: item.part.categoryName }, color: { id: item.color.id, sourceId: item.color.rebrickableId, name: item.color.name, rgb: item.color.rgb }, missing, reviewed: item.isManual || Boolean(review) || missing > 0 }; }) };
}
