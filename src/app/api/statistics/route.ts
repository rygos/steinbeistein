import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { completenessPercent } from "@/lib/serializers";

export const dynamic = "force-dynamic";
const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;

export async function GET() {
  const [instances, inventory, missingRows, reviews, shopping, definitions, partCount, colorCount, instanceDetails, looseStock, orders, prices, changes] = await Promise.all([
    prisma.setInstance.findMany({ select: { id: true, nickname: true, createdAt: true, definition: { select: { id: true, setNumber: true, name: true, year: true, theme: true, imageUrl: true, pieceCount: true } } } }),
    prisma.inventoryItem.findMany({ where: { isManual: false }, select: { id: true, definitionId: true, partId: true, colorId: true, quantity: true, sectionName: true, part: { select: { partNumber: true, name: true, imageUrl: true, categoryName: true } }, color: { select: { name: true, rgb: true } } } }),
    prisma.missingPart.findMany({ where: { quantity: { gt: 0 } }, select: { instanceId: true, inventoryItemId: true, quantity: true, confirmed: true, inventoryItem: { select: { definitionId: true, partId: true, colorId: true, isManual: true, part: { select: { partNumber: true, name: true, imageUrl: true } }, color: { select: { name: true, rgb: true } } } } } }),
    prisma.inventoryReview.findMany({ where: { inventoryItem: { isManual: false } }, select: { instanceId: true, status: true, inventoryItem: { select: { id: true, quantity: true, definitionId: true } } } }),
    prisma.shoppingItem.findMany({ select: { status: true, quantity: true } }),
    prisma.setDefinition.count(), prisma.part.count(), prisma.color.count(),
    prisma.setInstance.findMany({ select: { hasInstructions: true, instructionsCondition: true, hasBox: true, boxCondition: true, condition: true, collectionStatus: true, storageLocationId: true, purchasePrice: true, purchaseCurrency: true, photos: { select: { id: true } } } }),
    prisma.loosePartStock.findMany({ select: { partId: true, colorId: true, quantity: true, locationId: true } }),
    prisma.purchaseOrder.findMany({ select: { status: true, currency: true, shippingCost: true, lines: { select: { quantity: true, receivedQuantity: true, unitPrice: true } } } }),
    prisma.brickOwlPrice.findMany({ where: { avgPrice: { not: null } }, select: { source: true, itemType: true, currencyCode: true, setInstanceId: true } }),
    prisma.inventoryChange.findMany({ where: { undoneAt: null }, select: { beforeMissing: true, afterMissing: true } }),
  ]);

  const totalsByDefinition = new Map<string, number>();
  const ownedDefinitionIds = new Set(instances.map((instance) => instance.definition.id));
  const ownedInventory = inventory.filter((item) => ownedDefinitionIds.has(item.definitionId));
  const inventoryById = new Map(ownedInventory.map((item) => [item.id, item]));
  const itemCountByDefinition = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  const colorTotals = new Map<string, { name: string; rgb: string | null; count: number }>();
  for (const item of ownedInventory) {
    totalsByDefinition.set(item.definitionId, (totalsByDefinition.get(item.definitionId) ?? 0) + item.quantity);
    itemCountByDefinition.set(item.definitionId, (itemCountByDefinition.get(item.definitionId) ?? 0) + 1);
    const category = item.part.categoryName ?? "Nicht kategorisiert";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + item.quantity);
    const color = colorTotals.get(item.colorId) ?? { name: item.color.name, rgb: item.color.rgb, count: 0 };
    color.count += item.quantity;
    colorTotals.set(item.colorId, color);
  }
  const instancesById = new Map(instances.map((instance) => [instance.id, instance]));
  const missingByInstance = new Map<string, number>();
  const reviewedByInstance = new Map<string, Map<string, number>>();
  const commonMissing = new Map<string, { part: { number: string; name: string; imageUrl: string | null }; color: { name: string; rgb: string | null }; count: number }>();
  const missingColors = new Map<string, { name: string; rgb: string | null; count: number }>();
  for (const row of missingRows) {
    if (row.inventoryItem.isManual) continue;
    missingByInstance.set(row.instanceId, (missingByInstance.get(row.instanceId) ?? 0) + row.quantity);
    const existingItem = inventoryById.get(row.inventoryItemId);
    if (existingItem && row.confirmed) {
      const marked = reviewedByInstance.get(row.instanceId) ?? new Map<string, number>();
      marked.set(existingItem.id, existingItem.quantity);
      reviewedByInstance.set(row.instanceId, marked);
    }
    const key = `${row.inventoryItem.partId}|${row.inventoryItem.colorId}`;
    const group = commonMissing.get(key) ?? { part: { number: row.inventoryItem.part.partNumber, name: row.inventoryItem.part.name, imageUrl: row.inventoryItem.part.imageUrl }, color: { name: row.inventoryItem.color.name, rgb: row.inventoryItem.color.rgb }, count: 0 };
    group.count += row.quantity;
    commonMissing.set(key, group);
    const missingColor = missingColors.get(row.inventoryItem.colorId) ?? { name: row.inventoryItem.color.name, rgb: row.inventoryItem.color.rgb, count: 0 };
    missingColor.count += row.quantity;
    missingColors.set(row.inventoryItem.colorId, missingColor);
  }
  for (const review of reviews) {
    if (!instancesById.has(review.instanceId)) continue;
    const marked = reviewedByInstance.get(review.instanceId) ?? new Map<string, number>();
    marked.set(review.inventoryItem.id, review.inventoryItem.quantity);
    reviewedByInstance.set(review.instanceId, marked);
  }

  const rows = instances.map((instance) => {
    const total = totalsByDefinition.get(instance.definition.id) ?? 0;
    const missing = missingByInstance.get(instance.id) ?? 0;
    const reviewedQuantity = [...(reviewedByInstance.get(instance.id)?.values() ?? [])].reduce((sum, quantity) => sum + quantity, 0);
    const complete = completenessPercent(total, missing, reviewedQuantity);
    return { id: instance.id, nickname: instance.nickname, createdAt: instance.createdAt, setNumber: instance.definition.setNumber, name: instance.definition.name, year: instance.definition.year, theme: instance.definition.theme ?? "Ohne Themenangabe", imageUrl: instance.definition.imageUrl, total, missing, inventoryPositions: itemCountByDefinition.get(instance.definition.id) ?? 0, reviewedPositions: reviewedByInstance.get(instance.id)?.size ?? 0, reviewedQuantity, checkedPercent: total ? Math.round(Math.min(total, reviewedQuantity) / total * 1000) / 10 : 100, complete };
  });
  const totalPieces = rows.reduce((sum, row) => sum + row.total, 0);
  const totalMissing = rows.reduce((sum, row) => sum + row.missing, 0);
  const totalReviewed = rows.reduce((sum, row) => sum + row.reviewedQuantity, 0);
  const totalSetPositions = rows.reduce((sum, row) => sum + row.inventoryPositions, 0);
  const topSets = (selector: (row: typeof rows[number]) => number) => [...rows].sort((a, b) => selector(b) - selector(a)).slice(0, 8);
  const themeGroups = new Map<string, { name: string; count: number; pieces: number; missing: number }>();
  for (const row of rows) {
    const item = themeGroups.get(row.theme) ?? { name: row.theme, count: 0, pieces: 0, missing: 0 };
    item.count += 1; item.pieces += row.total; item.missing += row.missing; themeGroups.set(row.theme, item);
  }
  const eras = [{ name: "Bis 1990", min: 0, max: 1990 }, { name: "1991–2000", min: 1991, max: 2000 }, { name: "2001–2010", min: 2001, max: 2010 }, { name: "2011–2020", min: 2011, max: 2020 }, { name: "2021–heute", min: 2021, max: 9999 }].map((era) => ({ name: era.name, count: rows.filter((row) => row.year !== null && row.year >= era.min && row.year <= era.max).length }));
  const repeatCounts = new Map<string, number>();
  for (const row of rows) repeatCounts.set(row.setNumber, (repeatCounts.get(row.setNumber) ?? 0) + 1);
  const repeatedInstances = [...repeatCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  const monthly = new Map<string, number>();
  for (const row of rows) { const month = `${row.createdAt.getUTCFullYear()}-${String(row.createdAt.getUTCMonth() + 1).padStart(2, "0")}`; monthly.set(month, (monthly.get(month) ?? 0) + 1); }

  const orderSpend = new Map<string, number>();
  const activeOrders = orders.filter((order) => order.status !== "CANCELLED");
  for (const order of activeOrders) {
    const orderTotal = order.shippingCost + order.lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0);
    orderSpend.set(order.currency, (orderSpend.get(order.currency) ?? 0) + orderTotal);
  }
  const purchaseCurrencies = [...orderSpend.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })).sort((a, b) => a.currency.localeCompare(b.currency));
  const priceCurrencies = new Map<string, number>();
  for (const price of prices) priceCurrencies.set(price.currencyCode, (priceCurrencies.get(price.currencyCode) ?? 0) + 1);
  const purchaseTotals = new Map<string, { amount: number; count: number }>();
  for (const instance of instanceDetails) {
    if (instance.purchasePrice === null) continue;
    const total = purchaseTotals.get(instance.purchaseCurrency) ?? { amount: 0, count: 0 };
    total.amount += instance.purchasePrice;
    total.count += 1;
    purchaseTotals.set(instance.purchaseCurrency, total);
  }
  const reviewsByStatus = new Map<string, number>();
  for (const review of reviews) {
    reviewsByStatus.set(review.status, (reviewsByStatus.get(review.status) ?? 0) + 1);
  }
  const resolvedMissing = changes.reduce((sum, change) => sum + Math.max(0, change.beforeMissing - change.afterMissing), 0);
  const instancesWithPhotos = instanceDetails.filter((instance) => instance.photos.length > 0).length;
  const boxes = instanceDetails.filter((instance) => instance.hasBox).length;
  const instructions = instanceDetails.filter((instance) => instance.hasInstructions).length;
  const looseQuantity = looseStock.reduce((sum, item) => sum + item.quantity, 0);
  const looseKinds = new Set(looseStock.map((item) => `${item.partId}|${item.colorId}`)).size;
  const instanceCountByDefinition = new Map<string, number>();
  for (const instance of instances) instanceCountByDefinition.set(instance.definition.id, (instanceCountByDefinition.get(instance.definition.id) ?? 0) + 1);
  const minifigItems = ownedInventory.filter((item) => item.sectionName === "Minifigur" || item.part.categoryName?.toLowerCase().includes("minifig"));
  const minifigQuantity = minifigItems.reduce((sum, item) => sum + item.quantity * (instanceCountByDefinition.get(item.definitionId) ?? 0), 0);

  return NextResponse.json({
    overview: { definitions: new Set(rows.map((row) => row.setNumber)).size, cachedDefinitions: definitions, instances: rows.length, totalPieces, totalMissing, confirmedPresent: Math.max(0, totalReviewed - totalMissing), uncheckedPieces: Math.max(0, totalPieces - totalReviewed), totalReviewed, checkedPercent: totalPieces ? Math.round(Math.min(totalPieces, totalReviewed) / totalPieces * 1000) / 10 : 100, completionPercent: totalPieces ? Math.round(Math.max(0, totalReviewed - totalMissing) / totalPieces * 1000) / 10 : 100, completeInstances: rows.filter((row) => row.complete === 100).length, uniqueSetNumbers: repeatCounts.size, repeatedInstances, differentParts: new Set(ownedInventory.map((item) => item.partId)).size, differentColors: new Set(ownedInventory.map((item) => item.colorId)).size, positions: totalSetPositions, avgPiecesPerSet: rows.length ? Math.round(totalPieces / rows.length) : 0, avgMissingPerSet: rows.length ? Math.round(totalMissing / rows.length * 10) / 10 : 0, partRecords: partCount, colorRecords: colorCount, wantedPieces: shopping.filter((item) => item.status === "WANTED").reduce((sum, item) => sum + item.quantity, 0), orderedPieces: shopping.filter((item) => item.status === "ORDERED").reduce((sum, item) => sum + item.quantity, 0) },
    themes: [...themeGroups.values()].sort((a, b) => b.count - a.count), eras,
    topMissingSets: topSets((row) => row.missing).filter((row) => row.missing > 0), highestCompletion: [...rows].sort((a, b) => b.complete - a.complete || a.missing - b.missing).slice(0, 5),
    commonMissing: [...commonMissing.values()].sort(byCount).slice(0, 10), missingColors: [...missingColors.values()].sort(byCount),
    categories: [...categoryTotals.entries()].map(([name, count]) => ({ name, count })).sort(byCount).slice(0, 12), commonColors: [...colorTotals.values()].sort(byCount).slice(0, 12),
    repeats: [...repeatCounts.entries()].filter(([, count]) => count > 1).map(([setNumber, count]) => ({ setNumber, count })).sort((a, b) => b.count - a.count), collectionHistory: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, count]) => ({ month, count })),
    oldestSet: [...rows].filter((row) => row.year !== null).sort((a, b) => a.year! - b.year!)[0] ?? null, newestSet: [...rows].filter((row) => row.year !== null).sort((a, b) => b.year! - a.year!)[0] ?? null,
    fiveSetMissingShare: totalMissing ? Math.round(topSets((row) => row.missing).slice(0, 5).reduce((sum, row) => sum + row.missing, 0) / totalMissing * 100) : 0,
    additions: {
      collection: { forSale: instanceDetails.filter((instance) => instance.collectionStatus === "FOR_SALE").length, withStorage: instanceDetails.filter((instance) => instance.storageLocationId !== null).length, withPhotos: instancesWithPhotos, photoCount: instanceDetails.reduce((sum, instance) => sum + instance.photos.length, 0), boxes, instructions, boxesInGoodCondition: instanceDetails.filter((instance) => instance.hasBox && ["MINT", "VERY_GOOD", "GOOD"].includes(instance.boxCondition ?? "")).length, instructionsInGoodCondition: instanceDetails.filter((instance) => instance.hasInstructions && ["MINT", "VERY_GOOD", "GOOD"].includes(instance.instructionsCondition ?? "")).length, purchasePrices: [...purchaseTotals.entries()].map(([currency, total]) => ({ currency, amount: Math.round(total.amount * 100) / 100, count: total.count })).sort((a, b) => a.currency.localeCompare(b.currency)), conditionCounts: ["LIKE_NEW", "GOOD", "PLAYED", "DAMAGED"].map((condition) => ({ name: ({ LIKE_NEW: "Wie neu", GOOD: "Gut", PLAYED: "Gebraucht", DAMAGED: "Beschädigt" } as Record<string, string>)[condition], count: instanceDetails.filter((instance) => instance.condition === condition).length })) },
      looseStock: { quantity: looseQuantity, positions: looseStock.length, kinds: looseKinds, locations: new Set(looseStock.filter((item) => item.locationId !== null).map((item) => item.locationId)).size },
      orders: { count: activeOrders.length, lines: activeOrders.reduce((sum, order) => sum + order.lines.length, 0), ordered: activeOrders.reduce((sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0), received: activeOrders.reduce((sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.receivedQuantity, 0), 0), spend: purchaseCurrencies },
      prices: { quotes: prices.length, manual: prices.filter((price) => price.source === "manual").length, setQuotes: prices.filter((price) => price.itemType === "SET").length, partQuotes: prices.filter((price) => price.itemType !== "SET").length, currencies: [...priceCurrencies.entries()].map(([currency, count]) => ({ currency, count })).sort((a, b) => a.currency.localeCompare(b.currency)) },
      inventoryHealth: { damaged: reviewsByStatus.get("DAMAGED") ?? 0, wrongColor: reviewsByStatus.get("WRONG_COLOR") ?? 0, other: reviewsByStatus.get("OTHER") ?? 0, recovered: resolvedMissing, changes: changes.length },
      minifigs: { quantity: minifigQuantity, positions: minifigItems.reduce((sum, item) => sum + (instanceCountByDefinition.get(item.definitionId) ?? 0), 0), kinds: new Set(minifigItems.map((item) => item.partId)).size },
    },
  });
}
