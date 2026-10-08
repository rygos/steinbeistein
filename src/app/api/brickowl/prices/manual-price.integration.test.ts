import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { manualSetCacheKey } from "@/lib/manual-price";

const testUrl = process.env.TEST_DATABASE_URL;
const dbSuite = testUrl ? describe : describe.skip;

dbSuite("manual BrickOwl prices stay put", () => {
  let db: PrismaClient;
  let post: (request: NextRequest) => Promise<Response>;
  let get: () => Promise<Response>;
  let backupGet: () => Promise<Response>;
  let backupPost: (request: NextRequest) => Promise<Response>;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const setNumber = `TEST-PRICE-${suffix}`;
  const partNumber = `TEST-PRICE-PART-${suffix}`;
  let instanceId = "";
  let inventoryItemId = "";
  let partId = "";
  let colorId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    delete process.env.BRICKOWL_API_KEY;
    db = new PrismaClient({ datasources: { db: { url: testUrl! } } });
    await db.$connect();
    const part = await db.part.create({ data: { rebrickableId: partNumber, partNumber, name: "Manual price brick" } });
    const color = await db.color.create({ data: { rebrickableId: Math.floor(Math.random() * 1_000_000) + 1_000_000, name: `Manual price color ${suffix}` } });
    partId = part.id;
    colorId = color.id;
    const definition = await db.setDefinition.create({ data: { setNumber, name: "Manual price set", inventory: { create: { partId, colorId, quantity: 4 } } } });
    const instance = await db.setInstance.create({ data: { definitionId: definition.id, nickname: "Manuelles Exemplar" } });
    instanceId = instance.id;
    const item = await db.inventoryItem.findFirstOrThrow({ where: { definitionId: definition.id } });
    inventoryItemId = item.id;
    await db.missingPart.create({ data: { instanceId, inventoryItemId, quantity: 3 } });
    const route = await import("@/app/api/brickowl/prices/route");
    const backupRoute = await import("@/app/api/backup/route");
    post = route.POST;
    get = route.GET;
    backupGet = backupRoute.GET;
    backupPost = backupRoute.POST;
    delete process.env.BRICKOWL_API_KEY;
  });

  afterAll(async () => {
    if (!db) return;
    await db.brickOwlPrice.deleteMany({ where: { OR: [{ itemNumber: setNumber }, { itemNumber: partNumber }, ...(partId ? [{ partId }] : []), ...(instanceId ? [{ setInstanceId: instanceId }] : [])] } });
    await db.setDefinition.deleteMany({ where: { setNumber } });
    await db.part.deleteMany({ where: { rebrickableId: partNumber } });
    if (colorId) await db.color.deleteMany({ where: { id: colorId } });
    await db.$disconnect();
  });

  const send = (body: unknown) => post(new NextRequest("http://localhost/api/brickowl/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

  it("stores a manual set price and ignores a refresh after the 24 hour window", async () => {
    const saved = await send({ setInstanceId: instanceId, manualPrice: { avgPrice: 42.5, currencyCode: "EUR" } });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ manual: true, price: { source: "manual", avgPrice: 42.5, currencyCode: "EUR", itemNumber: setNumber } });

    const stored = await db.brickOwlPrice.findFirstOrThrow({ where: { setInstanceId: instanceId, source: "manual" } });
    const aged = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await db.brickOwlPrice.update({ where: { id: stored.id }, data: { fetchedAt: aged } });

    const refreshed = await send({ setInstanceId: instanceId, refresh: true });
    expect(refreshed.status).toBe(200);
    const body = await refreshed.json();
    expect(body).toMatchObject({ manual: true, refreshSkipped: true, price: { avgPrice: 42.5, source: "manual" } });
    expect(new Date(body.price.fetchedAt).toISOString()).toBe(aged.toISOString());

    const listed = await get();
    const prices = (await listed.json()).manualPrices as { key: string; avgPrice: number }[];
    expect(prices).toContainEqual(expect.objectContaining({ key: `set:${instanceId}`, avgPrice: 42.5, source: "manual" }));
  });

  it("stores one manual part price for the part and color and keeps it without an API key", async () => {
    const saved = await send({ inventoryItemId, manualPrice: { avgPrice: 0.15, currencyCode: "EUR" } });
    expect(saved.status).toBe(200);
    const listed = await get();
    const prices = (await listed.json()).manualPrices as { key: string; avgPrice: number }[];
    expect(prices).toContainEqual(expect.objectContaining({ key: `part:${partId}:${colorId}`, avgPrice: 0.15 }));

    const removed = await send({ inventoryItemId, clearManual: true });
    expect(removed.status).toBe(200);
    delete process.env.BRICKOWL_API_KEY;
    const blocked = await send({ inventoryItemId, refresh: true });
    expect(blocked.status).toBe(503);
    expect(await db.brickOwlPrice.count({ where: { partId, colorId, source: "manual" } })).toBe(0);
  });

  it("rejects a price with more than two decimal places", async () => {
    const rejected = await send({ setInstanceId: instanceId, manualPrice: { avgPrice: 1.234, currencyCode: "EUR" } });
    expect(rejected.status).toBe(400);
  });

  it("exports and restores a manual set price using the restored instance id", async () => {
    await send({ setInstanceId: instanceId, manualPrice: { avgPrice: 51.25, currencyCode: "EUR" } });
    const exported = await backupGet();
    expect(exported.status).toBe(200);
    const backup = await exported.json() as {
      instances: { id: string }[];
      brickOwlManualPrices: { setInstanceId: string | null; partId: string | null; colorId: string | null; avgPrice: number | null }[];
      [key: string]: unknown;
    };
    expect(backup.brickOwlManualPrices).toContainEqual(expect.objectContaining({ setInstanceId: instanceId, avgPrice: 51.25 }));

    const restoredInstanceId = "restored-" + suffix;
    const restoredBackup = {
      ...backup,
      instances: backup.instances.map((instance) => instance.id === instanceId ? { ...instance, id: restoredInstanceId } : instance),
      brickOwlManualPrices: backup.brickOwlManualPrices.map((price) => price.setInstanceId === instanceId ? { ...price, setInstanceId: restoredInstanceId } : price),
    };
    const restored = await backupPost(new NextRequest("http://localhost/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(restoredBackup),
    }));
    expect(restored.status).toBe(200);
    const price = await db.brickOwlPrice.findUniqueOrThrow({ where: { cacheKey: manualSetCacheKey(restoredInstanceId) } });
    expect(price).toMatchObject({ source: "manual", setInstanceId: restoredInstanceId, avgPrice: 51.25, currencyCode: "EUR" });
  });
});
