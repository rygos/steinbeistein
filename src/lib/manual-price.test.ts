import { describe, expect, it } from "vitest";
import { apiMayReplace, brickOwlCacheMs, manualPartCacheKey, manualQuoteKey, manualSetCacheKey } from "@/lib/manual-price";

describe("manual BrickOwl prices", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");

  it("keeps a manual price even after 24 hours and an explicit refresh", () => {
    const price = { source: "manual", fetchedAt: new Date(now - brickOwlCacheMs - 60_000) };
    expect(apiMayReplace(price, false, now)).toBe(false);
    expect(apiMayReplace(price, true, now)).toBe(false);
  });

  it("refreshes an API price after 24 hours or when a refresh is requested", () => {
    const fresh = { source: "api", fetchedAt: new Date(now - brickOwlCacheMs + 60_000) };
    const stale = { source: "api", fetchedAt: new Date(now - brickOwlCacheMs - 60_000) };
    expect(apiMayReplace(null, false, now)).toBe(true);
    expect(apiMayReplace(fresh, false, now)).toBe(false);
    expect(apiMayReplace(fresh, true, now)).toBe(true);
    expect(apiMayReplace(stale, false, now)).toBe(true);
  });

  it("addresses a manual set price per exemplar and a part price per part and color", () => {
    expect(manualSetCacheKey("set-1")).toBe("manual|set|set-1");
    expect(manualPartCacheKey("part-1", "color-1")).toBe("manual|part|part-1|color-1");
    expect(manualQuoteKey({ setInstanceId: "set-1", partId: null, colorId: null })).toBe("set:set-1");
    expect(manualQuoteKey({ setInstanceId: null, partId: "part-1", colorId: "color-1" })).toBe("part:part-1:color-1");
    expect(manualQuoteKey({ setInstanceId: null, partId: "part-1", colorId: null })).toBeNull();
  });
});
