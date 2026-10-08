import { describe, expect, it } from "vitest";
import { completenessPercent } from "@/lib/serializers";

describe("completenessPercent", () => {
  it("shows 100 percent only when the set has no missing pieces", () => {
    expect(completenessPercent(7499, 0)).toBe(100);
    expect(completenessPercent(7499, 2)).toBe(99.9);
  });

  it("uses the rounded percentage for ordinary set sizes", () => {
    expect(completenessPercent(8, 2)).toBe(75);
    expect(completenessPercent(0, 0)).toBe(100);
  });

  it("keeps unreviewed pieces separate from confirmed present pieces", () => {
    expect(completenessPercent(8, 0, 0)).toBe(0);
    expect(completenessPercent(8, 0, 4)).toBe(50);
    expect(completenessPercent(8, 2, 8)).toBe(75);
    expect(completenessPercent(8, 0, 8)).toBe(100);
  });
});
