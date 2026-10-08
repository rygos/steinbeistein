import { describe, expect, it } from "vitest";
import { normalizeInventory, RawInventoryRow, validateMissingQuantity } from "./inventory-normalization";

const row = (part: string, quantity: number, extra: Partial<RawInventoryRow> = {}): RawInventoryRow => ({
  part: { part_num: part, name: part }, color: { id: 5, name: "Red" }, quantity, ...extra,
});

describe("normalizeInventory", () => {
  it("excludes extra/spare items from required physical quantities", () => {
    const items = normalizeInventory([row("3005", 10), row("3005", 1, { is_spare: true })]);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(10);
  });

  it("drops alternate parts instead of summing them with the selected part", () => {
    const items = normalizeInventory([row("3001", 2), row("3002", 2, { is_alternate: true, alternate_of: "3001" })]);
    expect(items.map((item) => [item.part.part_num, item.quantity])).toEqual([["3001", 2]]);
  });

  it("keeps the physically representative counterpart without double counting the base", () => {
    const items = normalizeInventory([
      row("panel", 1),
      row("panel-stickered", 1, { counterpart_of: "panel", is_preferred_counterpart: true }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].part.part_num).toBe("panel-stickered");
    expect(items[0].quantity).toBe(1);
  });

  it("does not conflate unrelated physical parts when the source provides no relation", () => {
    expect(normalizeInventory([row("a", 1), row("b", 1)])).toHaveLength(2);
  });

  it("adds minifigure components to overlapping set part and color quantities", () => {
    const items = normalizeInventory([
      { ...row("3001", 5), id: 10 },
      { ...row("3001", 2), id: 11 },
      { ...row("3002", 1), id: 12, is_spare: true },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(7);
    expect(items[0].id).toBe("10,11");
  });
});

describe("validateMissingQuantity", () => {
  it("accepts a valid missing amount", () => expect(validateMissingQuantity(3, 8)).toBe(3));
  it("rejects amounts above the required quantity and negative values", () => {
    expect(() => validateMissingQuantity(9, 8)).toThrow();
    expect(() => validateMissingQuantity(-1, 8)).toThrow();
  });
});
