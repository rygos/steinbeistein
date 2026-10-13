import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

const testUrl = process.env.TEST_DATABASE_URL;
const dbSuite = testUrl ? describe : describe.skip;

dbSuite("collection database integration", () => {
  let db: PrismaClient;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const setNumber = `TEST-E2E-${suffix}`;
  const partNumber = `TEST-PART-${suffix}`;
  const colorSpecificImageUrl = "https://example.test/light-bluish-gray-brick.png";

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: testUrl! } } });
    process.env.DATABASE_URL = testUrl;
    await db.$connect();
    const part = await db.part.create({ data: { rebrickableId: partNumber, partNumber, name: "Integration brick", imageUrl: "https://example.test/generic-brick.png" } });
    const color = await db.color.create({ data: { rebrickableId: Math.floor(Math.random() * 1_000_000) + 1, name: "Integration color" } });
    const definition = await db.setDefinition.create({ data: { setNumber, name: "Integration set", inventory: { create: { partId: part.id, colorId: color.id, quantity: 8, imageUrl: colorSpecificImageUrl } } } });
    const [first, second] = await Promise.all([
      db.setInstance.create({ data: { definitionId: definition.id } }),
      db.setInstance.create({ data: { definitionId: definition.id } }),
    ]);
    const item = await db.inventoryItem.findFirstOrThrow({ where: { definitionId: definition.id } });
    await db.missingPart.createMany({ data: [
      { instanceId: first.id, inventoryItemId: item.id, quantity: 2 },
      { instanceId: second.id, inventoryItemId: item.id, quantity: 8 },
    ] });
  });

  afterAll(async () => {
    await db.setDefinition.deleteMany({ where: { setNumber: { in: [setNumber, `TN-${suffix}`] } } });
    await db.storageLocation.deleteMany({ where: { name: { startsWith: "Test location " } } });
    await db.part.deleteMany({ where: { rebrickableId: partNumber } });
    await db.color.deleteMany({ where: { name: "Integration color" } });
    await db.$disconnect();
  });

  it("keeps missing quantities independent for two instances of one set", async () => {
    const instances = await db.setInstance.findMany({ where: { definition: { setNumber } }, include: { missing: true } });
    expect(instances).toHaveLength(2);
    expect(instances.map((instance) => instance.missing.reduce((sum, row) => sum + row.quantity, 0)).sort((a, b) => a - b)).toEqual([2, 8]);
  });

  it("starts a newly added instance fully missing until its inventory is checked", async () => {
    const part = await db.part.findFirstOrThrow({ where: { rebrickableId: partNumber } });
    const color = await db.color.findFirstOrThrow({ where: { name: "Integration color" } });
    const newSetNumber = `TN-${suffix}`;
    await db.setDefinition.create({ data: { setNumber: newSetNumber, name: "New integration model", importMetadata: { minifigInventoryVersion: 2 }, inventory: { create: { partId: part.id, colorId: color.id, quantity: 8 } } } });
    const { POST: addInstance } = await import("@/app/api/sets/route");
    const { PATCH } = await import("@/app/api/instances/[id]/route");
    const request = (method: string, body: unknown) => new NextRequest("http://localhost/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const responseSchema = z.object({ id: z.string(), missing: z.number(), checkedPercent: z.number(), complete: z.number(), inventory: z.array(z.object({ id: z.string(), missing: z.number(), reviewed: z.boolean() })) });
    const added = await addInstance(request("POST", { setNumber: newSetNumber }));
    if (added.status !== 201) throw new Error(JSON.stringify(await added.json()));
    expect(added.status).toBe(201);
    const initial = responseSchema.parse(await added.json());
    expect(initial).toMatchObject({ missing: 8, checkedPercent: 0, complete: 0, inventory: [{ missing: 8, reviewed: false }] });
    const inventoryItem = initial.inventory[0];
    if (!inventoryItem) throw new Error("New instance has no inventory item.");

    const counted = await PATCH(request("PATCH", { inventoryItemId: inventoryItem.id, setMissing: 3 }), { params: Promise.resolve({ id: initial.id }) });
    const countedInstance = responseSchema.parse(await counted.json());
    expect(countedInstance).toMatchObject({ missing: 3, checkedPercent: 100, complete: 62.5, inventory: [{ missing: 3, reviewed: true }] });

    const complete = await PATCH(request("PATCH", { inventoryItemId: inventoryItem.id, setMissing: 0 }), { params: Promise.resolve({ id: initial.id }) });
    expect(responseSchema.parse(await complete.json())).toMatchObject({ missing: 0, checkedPercent: 100, complete: 100, inventory: [{ missing: 0, reviewed: true }] });
  });

  it("updates an instance and the global shopping list through the API handlers", async () => {
    const { GET: getInstance, PATCH } = await import("@/app/api/instances/[id]/route");
    const { GET: getGlobal, POST: markFound } = await import("@/app/api/missing/route");
    const instances = await db.setInstance.findMany({ where: { definition: { setNumber } }, include: { missing: true } });
    const first = instances.find((instance) => instance.missing.some((row) => row.quantity === 2));
    const second = instances.find((instance) => instance.id !== first?.id);
    const item = await db.inventoryItem.findFirstOrThrow({ where: { definition: { setNumber } } });
    const request = (method: string, body: unknown) => new NextRequest("http://localhost/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const incremented = await PATCH(request("PATCH", { inventoryItemId: item.id, delta: 1 }), { params: Promise.resolve({ id: first!.id }) });
    expect(incremented.status).toBe(200);
    const rejected = await PATCH(request("PATCH", { inventoryItemId: item.id, setMissing: 9 }), { params: Promise.resolve({ id: first!.id }) });
    expect(rejected.status).toBe(400);

    const globalResponse = await getGlobal();
    const group = (await globalResponse.json()).find((entry: { part: { id: string; imageUrl: string | null }; color: { name: string } }) => entry.part.id === item.partId);
    expect(group.quantity).toBe(11);
    expect(group.sets).toHaveLength(2);
    expect(group.part.imageUrl).toBe(colorSpecificImageUrl);
    const instanceResponse = await getInstance(new NextRequest("http://localhost/api/instance"), { params: Promise.resolve({ id: first!.id }) });
    expect((await instanceResponse.json()).inventory[0].part.imageUrl).toBe(colorSpecificImageUrl);
    const found = await markFound(request("POST", { instanceId: first!.id, inventoryItemId: item.id, found: 2 }));
    expect(found.status).toBe(200);
    const remaining = await db.missingPart.findMany({ where: { inventoryItemId: item.id }, orderBy: { instanceId: "asc" } });
    expect(remaining.map((row) => row.quantity).sort((a, b) => a - b)).toEqual([1, 8]);
    expect(second).toBeDefined();

    const { POST: setShopping, GET: getShopping } = await import("@/app/api/shopping/route");
    const wanted = await setShopping(request("POST", { instanceId: first!.id, inventoryItemId: item.id, status: "WANTED", quantity: 1 }));
    expect(wanted.status).toBe(200);
    const moved = await setShopping(request("POST", { instanceId: first!.id, inventoryItemId: item.id, moveToOrdered: true }));
    expect(moved.status).toBe(200);
    const shoppingGroups = await getShopping();
    const shoppingGroup = (await shoppingGroups.json()).find((entry: { part: { id: string } }) => entry.part.id === item.partId);
    expect(shoppingGroup.sets.find((entry: { instanceId: string }) => entry.instanceId === first!.id)).toMatchObject({ wanted: 0, ordered: 1 });
    const tooMany = await setShopping(request("POST", { instanceId: first!.id, inventoryItemId: item.id, status: "WANTED", quantity: 2 }));
    expect(tooMany.status).toBe(400);
    await markFound(request("POST", { instanceId: first!.id, inventoryItemId: item.id, found: 1 }));
    expect(await db.shoppingItem.count({ where: { instanceId: first!.id, inventoryItemId: item.id } })).toBe(0);

    await setShopping(request("POST", { instanceId: second!.id, inventoryItemId: item.id, status: "ORDERED", quantity: 3 }));
    const received = await setShopping(request("POST", { instanceId: second!.id, inventoryItemId: item.id, receiveQuantity: 2 }));
    expect(received.status).toBe(200);
    expect(await db.missingPart.findUnique({ where: { instanceId_inventoryItemId: { instanceId: second!.id, inventoryItemId: item.id } } })).toMatchObject({ quantity: 6 });
    expect(await db.shoppingItem.findUnique({ where: { instanceId_inventoryItemId_status: { instanceId: second!.id, inventoryItemId: item.id, status: "RECEIVED" } } })).toMatchObject({ quantity: 2 });
    const forbiddenReceivedStatus = await setShopping(request("POST", { instanceId: second!.id, inventoryItemId: item.id, status: "RECEIVED", quantity: 1 }));
    expect(forbiddenReceivedStatus.status).toBe(400);

    const { PATCH: updateInstance } = await import("@/app/api/instances/[id]/route");
    const locationResponse = await (await import("@/app/api/storage-locations/route")).POST(request("POST", { name: `Test location ${suffix}` }));
    const location = await locationResponse.json();
    const details = await updateInstance(request("PATCH", { details: { storageLocationId: location.id, condition: "GOOD", hasInstructions: true, instructionsCondition: "WORN", hasBox: true, boxCondition: "VERY_GOOD", notes: "Kartonecke intakt" } }), { params: Promise.resolve({ id: second!.id }) });
    expect(details.status).toBe(200);
    expect(await db.setInstance.findUnique({ where: { id: second!.id } })).toMatchObject({ storageLocationId: location.id, condition: "GOOD", hasInstructions: true, instructionsCondition: "WORN", hasBox: true, boxCondition: "VERY_GOOD", notes: "Kartonecke intakt" });

    const sessionRoute = await import("@/app/api/instances/[id]/session/route");
    const savedSession = await sessionRoute.PUT(request("PUT", { currentItemId: item.id, groupBy: "color", onlyUnchecked: true }), { params: Promise.resolve({ id: second!.id }) });
    expect(savedSession.status).toBe(200);
    expect(await (await sessionRoute.GET(new NextRequest("http://localhost/api/session"), { params: Promise.resolve({ id: second!.id }) })).json()).toMatchObject({ currentItemId: item.id, groupBy: "color", onlyUnchecked: true });

    const csvResponse = await (await import("@/app/api/shopping/export/route")).GET(new NextRequest("http://localhost/api/shopping/export?format=csv"));
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get("content-type")).toContain("text/csv");
  });
});
