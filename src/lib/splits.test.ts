import { describe, it, expect } from "vitest";
import { evenSplit } from "./splits";

const sum = (splits: Record<string, number>) =>
  Math.round(Object.values(splits).reduce((a, b) => a + b, 0) * 100) / 100;

describe("evenSplit", () => {
  it("splits an amount that divides evenly", () => {
    expect(evenSplit(90, ["a", "b", "c"])).toEqual({ a: 30, b: 30, c: 30 });
  });

  it("distributes leftover cents to the first members", () => {
    const splits = evenSplit(100, ["a", "b", "c"]);
    expect(splits).toEqual({ a: 33.34, b: 33.33, c: 33.33 });
  });

  it("always sums exactly to the original amount (no penny drift)", () => {
    const members = ["a", "b", "c", "d", "e", "f", "g"];
    for (const amount of [0.01, 0.05, 1, 10.99, 333.33, 1234.56, 9999.97]) {
      expect(sum(evenSplit(amount, members))).toBe(amount);
    }
  });

  it("handles a single member", () => {
    expect(evenSplit(42.42, ["only"])).toEqual({ only: 42.42 });
  });

  it("returns an empty object for no members", () => {
    expect(evenSplit(100, [])).toEqual({});
  });

  it("handles zero amount", () => {
    expect(evenSplit(0, ["a", "b"])).toEqual({ a: 0, b: 0 });
  });
});
