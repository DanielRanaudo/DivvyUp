import { describe, it, expect } from "vitest";
import { evenShare, evenSplit, splitByWeights } from "./splits";

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

describe("evenShare", () => {
  it("divides evenly", () => {
    expect(evenShare(90, 3)).toBe(30);
  });

  it("is zero in an empty house, rather than infinite", () => {
    expect(evenShare(90, 0)).toBe(0);
  });
});

describe("splitByWeights", () => {
  it("divides in proportion to the weights", () => {
    expect(splitByWeights(100, { a: 75, b: 25 })).toEqual({ a: 75, b: 25 });
  });

  it("hands leftover cents to the largest remainders, to the penny", () => {
    const splits = splitByWeights(100, { a: 1, b: 1, c: 1 });
    const total = Object.values(splits).reduce((s, x) => s + x, 0);
    expect(total).toBeCloseTo(100, 10);
  });

  it("falls back to an even split when nobody has any weight", () => {
    expect(splitByWeights(10, { a: 0, b: 0 })).toEqual({ a: 5, b: 5 });
  });

  it("treats a negative weight as no weight at all", () => {
    expect(splitByWeights(10, { a: -5, b: 10 })).toEqual({ a: 0, b: 10 });
  });

  it("has nothing to divide when there is nobody to divide it between", () => {
    expect(splitByWeights(10, {})).toEqual({});
  });
});
