import { describe, expect, it } from "vitest";
import { assignPartCodes, snapInches, BEGINNER_SNAP } from "./plan-model";

describe("part labels", () => {
  it("gives one letter per role and numbers within it", () => {
    const codes = assignPartCodes([
      { id: "a", role: "front-wall" },
      { id: "b", role: "side-wall" },
      { id: "c", role: "side-wall" },
      { id: "d", role: "front-wall" },
    ]);
    expect([...codes.values()]).toEqual(["A1", "B1", "B2", "A2"]);
  });
});

describe("beginner rounding", () => {
  it("rounds cuts to the nearest 1/16 inch", () => {
    expect(snapInches(3.03, BEGINNER_SNAP)).toBe(3.0);
    expect(snapInches(3.04, BEGINNER_SNAP)).toBe(3.0625);
  });
});
