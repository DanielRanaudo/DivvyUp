import { describe, it, expect } from "vitest";
import {
  buildSplits,
  describeSplit,
  draftFromExpense,
  emptyDraft,
  splitProblem,
  splitTotal,
  type SplitDraft,
} from "./expenseSplits";
import type { Expense, Member } from "./types";

const member = (id: string, name: string): Member => ({
  id,
  name,
  venmo: "",
  zelle: "",
  isTreasurer: false,
});

const members = [member("a", "Ada"), member("b", "Bo"), member("c", "Cid")];
const ids = members.map((m) => m.id);

const draft = (over: Partial<SplitDraft>): SplitDraft => ({
  ...emptyDraft(ids),
  ...over,
});

describe("buildSplits", () => {
  it("divides evenly across everyone", () => {
    expect(buildSplits(draft({ mode: "even" }), 30, ids)).toEqual({
      a: 10,
      b: 10,
      c: 10,
    });
  });

  it("gives the leftover cents away rather than losing them", () => {
    const splits = buildSplits(draft({ mode: "even" }), 10, ids);
    expect(splitTotal(splits)).toBe(10);
    expect(Object.values(splits).sort()).toEqual([3.33, 3.33, 3.34]);
  });

  it("leaves out anyone unticked in subset mode", () => {
    const splits = buildSplits(
      draft({ mode: "subset", includedIds: ["a", "c"] }),
      50,
      ids
    );
    expect(splits).toEqual({ a: 25, c: 25 });
  });

  it("takes exact amounts as typed, skipping blanks", () => {
    const splits = buildSplits(
      draft({ mode: "exact", entries: { a: "12.50", b: "", c: "7.50" } }),
      20,
      ids
    );
    expect(splits).toEqual({ a: 12.5, c: 7.5 });
  });

  it("turns percentages into amounts that still sum to the total", () => {
    const splits = buildSplits(
      draft({ mode: "percentage", entries: { a: "50", b: "25", c: "25" } }),
      99.99,
      ids
    );
    expect(splitTotal(splits)).toBe(99.99);
    expect(splits.a).toBeCloseTo(50, 1);
  });

  it("ignores the ratio and only keeps who was named", () => {
    // 1:1 between two of three people is a half each, not a third.
    const splits = buildSplits(
      draft({ mode: "percentage", entries: { a: "1", b: "1" } }),
      10,
      ids
    );
    expect(splits).toEqual({ a: 5, b: 5 });
  });
});

describe("splitProblem", () => {
  it("passes an even split", () => {
    expect(splitProblem(draft({ mode: "even" }), 30, ids)).toBeNull();
  });

  it("refuses a subset with nobody in it", () => {
    expect(
      splitProblem(draft({ mode: "subset", includedIds: [] }), 30, ids)
    ).toMatch(/at least one person/);
  });

  it("says how much of an exact split is unassigned", () => {
    expect(
      splitProblem(draft({ mode: "exact", entries: { a: "10" } }), 30, ids)
    ).toBe("$20.00 still unassigned.");
  });

  it("says when an exact split overshoots", () => {
    expect(
      splitProblem(
        draft({ mode: "exact", entries: { a: "20", b: "20" } }),
        30,
        ids
      )
    ).toBe("$10.00 over the total.");
  });

  it("accepts an exact split that lands on the total", () => {
    expect(
      splitProblem(
        draft({ mode: "exact", entries: { a: "10", b: "20" } }),
        30,
        ids
      )
    ).toBeNull();
  });

  it("requires percentages to reach a hundred", () => {
    expect(
      splitProblem(
        draft({ mode: "percentage", entries: { a: "40", b: "40" } }),
        30,
        ids
      )
    ).toBe("20% left to assign.");
    expect(
      splitProblem(
        draft({ mode: "percentage", entries: { a: "60", b: "60" } }),
        30,
        ids
      )
    ).toBe("20% over 100%.");
    expect(
      splitProblem(
        draft({ mode: "percentage", entries: { a: "60", b: "40" } }),
        30,
        ids
      )
    ).toBeNull();
  });

  it("refuses an expense with no amount", () => {
    expect(splitProblem(draft({ mode: "even" }), 0, ids)).toMatch(/no amount/);
  });
});

describe("draftFromExpense", () => {
  const approved = (over: Partial<Expense>): Expense => ({
    id: "e1",
    description: "Soap",
    amount: 30,
    submittedBy: "a",
    submittedByName: "Ada",
    status: "approved",
    date: "2026-07-01T00:00:00.000Z",
    ...over,
  });

  it("recovers the people who shared a subset split", () => {
    const d = draftFromExpense(
      approved({ splitMode: "subset", splits: { a: 15, b: 15 } }),
      ids
    );
    expect(d.mode).toBe("subset");
    expect(d.includedIds).toEqual(["a", "b"]);
  });

  it("puts exact amounts back in the inputs", () => {
    const d = draftFromExpense(
      approved({ splitMode: "exact", splits: { a: 20, c: 10 } }),
      ids
    );
    expect(d.entries).toEqual({ a: "20.00", c: "10.00" });
  });

  it("converts amounts back to percentages", () => {
    const d = draftFromExpense(
      approved({ splitMode: "percentage", splits: { a: 20, b: 10 } }),
      ids
    );
    expect(d.entries).toEqual({ a: "66.67", b: "33.33" });
  });

  it("treats an expense from before split modes as an even one", () => {
    const d = draftFromExpense(approved({ splits: { a: 10, b: 10, c: 10 } }), ids);
    expect(d.mode).toBe("even");
  });
});

describe("describeSplit", () => {
  it("reports the per-person share when everyone shared it", () => {
    expect(describeSplit({ a: 10, b: 10, c: 10 }, members)).toBe("$10.00/person");
  });

  it("counts the people involved when some were left out", () => {
    expect(describeSplit({ a: 15, b: 15 }, members)).toBe("$15.00 each, 2 of 3");
  });

  it("names the one person who owes all of it", () => {
    expect(describeSplit({ b: 30 }, members)).toBe("all of it to Bo");
  });

  it("falls back to a count for uneven shares", () => {
    expect(describeSplit({ a: 20, b: 5, c: 5 }, members)).toBe("split 3 ways");
  });

  it("says nothing about an expense with no splits yet", () => {
    expect(describeSplit(undefined, members)).toBe("");
  });
});
