import { describe, it, expect } from "vitest";
import { canRemoveMember, memberBalance, removeMember } from "@/lib/members";
import { calcBalances } from "@/lib/settlements";
import { evenSplit } from "@/lib/splits";
import type { Charge, Group, Member } from "@/lib/types";

function member(id: string, name: string, isTreasurer = false): Member {
  return { id, name, venmo: "", zelle: "", isTreasurer };
}

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: "g1",
    name: "Apt 4B",
    code: "ABC1234567",
    members: [member("a", "Alex", true), member("b", "Bea"), member("c", "Cy")],
    rent: null,
    utilities: [],
    expenses: [],
    payments: [],
    subgroups: [],
    chores: [],
    periods: [],
    smartSettle: false,
    docsVersion: 0,
    ...overrides,
  };
}

function rentCharge(g: Group): Charge[] {
  if (!g.rent) return [];
  return [
    {
      id: g.rent.id,
      type: "rent",
      description: "Rent",
      amount: g.rent.amount,
      splits: g.rent.splits,
      recurring: g.rent.recurring,
      paidBy: g.members.find((m) => m.isTreasurer)?.id,
    },
  ];
}

describe("memberBalance", () => {
  it("is zero for a member with no activity", () => {
    expect(memberBalance(group(), "b", [])).toBe(0);
  });

  it("is negative for someone who owes their share", () => {
    const g = group({
      rent: {
        id: "rent",
        amount: 3000,
        splitType: "equal",
        recurring: true,
        percentages: {},
        customs: {},
        splits: evenSplit(3000, ["a", "b", "c"]),
      },
    });
    expect(memberBalance(g, "b", rentCharge(g))).toBe(-1000);
    // The treasurer paid, so they are owed the other two shares.
    expect(memberBalance(g, "a", rentCharge(g))).toBe(2000);
  });

  it("counts a confirmed payment but not a pending one", () => {
    const g = group({
      rent: {
        id: "rent",
        amount: 3000,
        splitType: "equal",
        recurring: true,
        percentages: {},
        customs: {},
        splits: evenSplit(3000, ["a", "b", "c"]),
      },
      payments: [
        {
          id: "p1",
          fromId: "b",
          fromName: "Bea",
          toId: "a",
          toName: "Alex",
          amount: 1000,
          status: "pending",
          date: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    expect(memberBalance(g, "b", rentCharge(g))).toBe(-1000);

    const confirmed = {
      ...g,
      payments: [{ ...g.payments[0], status: "confirmed" as const }],
    };
    expect(memberBalance(confirmed, "b", rentCharge(confirmed))).toBe(0);
  });
});

describe("canRemoveMember", () => {
  it("allows removing a member who is square", () => {
    expect(canRemoveMember(group(), "b", []).ok).toBe(true);
  });

  it("refuses when the member still owes money", () => {
    const g = group({
      rent: {
        id: "rent",
        amount: 3000,
        splitType: "equal",
        recurring: true,
        percentages: {},
        customs: {},
        splits: evenSplit(3000, ["a", "b", "c"]),
      },
    });
    const check = canRemoveMember(g, "b", rentCharge(g));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("still owes");
    expect(check.reason).toContain("$1000.00");
  });

  it("refuses when the member is still owed money", () => {
    const g = group({
      rent: {
        id: "rent",
        amount: 3000,
        splitType: "equal",
        recurring: true,
        percentages: {},
        customs: {},
        splits: evenSplit(3000, ["a", "b", "c"]),
      },
    });
    const check = canRemoveMember(g, "a", rentCharge(g));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("still owed");
  });

  it("refuses to empty the group", () => {
    const g = group({ members: [member("a", "Alex", true)] });
    expect(canRemoveMember(g, "a", []).ok).toBe(false);
  });

  it("refuses for someone who isn't a member", () => {
    expect(canRemoveMember(group(), "nobody", []).ok).toBe(false);
  });
});

describe("removeMember", () => {
  it("takes the member out and leaves the rest alone", () => {
    const result = removeMember(group(), "b");
    expect(result.group.members.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("is a no-op for an unknown member", () => {
    const g = group();
    const result = removeMember(g, "nobody");
    expect(result.group).toBe(g);
    expect(result.notes).toEqual([]);
  });

  it("re-splits equal rent so the total is still covered", () => {
    const g = group({
      rent: {
        id: "rent",
        amount: 3000,
        splitType: "equal",
        recurring: true,
        percentages: {},
        customs: {},
        splits: evenSplit(3000, ["a", "b", "c"]),
      },
    });
    const { group: next, notes } = removeMember(g, "c");

    expect(Object.keys(next.rent!.splits).sort()).toEqual(["a", "b"]);
    const total = Object.values(next.rent!.splits).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(3000, 2);
    expect(notes.join(" ")).toContain("split evenly");
  });

  it("rescales percentage rent to still total 100", () => {
    const g = group({
      rent: {
        id: "rent",
        amount: 3000,
        splitType: "percentage",
        recurring: true,
        percentages: { a: "50", b: "30", c: "20" },
        customs: {},
        splits: { a: 1500, b: 900, c: 600 },
      },
    });
    const { group: next } = removeMember(g, "c");

    const pcts = next.rent!.percentages;
    const sum = Object.values(pcts).reduce((s, p) => s + parseFloat(p), 0);
    expect(sum).toBeCloseTo(100, 1);
    // 50:30 keeps its ratio, so Alex covers 62.5%.
    expect(next.rent!.splits.a).toBeCloseTo(1875, 2);
    expect(next.rent!.splits.b).toBeCloseTo(1125, 2);
  });

  it("spreads a departing custom share over the people left", () => {
    const g = group({
      rent: {
        id: "rent",
        amount: 3000,
        splitType: "custom",
        recurring: true,
        percentages: {},
        customs: { a: "1400", b: "1000", c: "600" },
        splits: { a: 1400, b: 1000, c: 600 },
      },
    });
    const { group: next, notes } = removeMember(g, "c");

    expect(next.rent!.splits.a).toBeCloseTo(1700, 2);
    expect(next.rent!.splits.b).toBeCloseTo(1300, 2);
    const total = Object.values(next.rent!.splits).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(3000, 2);
    expect(notes.join(" ")).toContain("reassigned evenly");
  });

  it("withdraws pending expenses but keeps approved ones as history", () => {
    const g = group({
      expenses: [
        {
          id: "e1",
          description: "Soap",
          amount: 30,
          submittedBy: "c",
          submittedByName: "Cy",
          status: "pending",
          date: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "e2",
          description: "Paper towels",
          amount: 30,
          submittedBy: "c",
          submittedByName: "Cy",
          status: "approved",
          splits: evenSplit(30, ["a", "b", "c"]),
          date: "2026-07-02T00:00:00.000Z",
        },
      ],
    });
    const { group: next, notes } = removeMember(g, "c");

    expect(next.expenses.map((e) => e.id)).toEqual(["e2"]);
    expect(notes.join(" ")).toContain("withdrawn");
  });

  it("drops the member from floors", () => {
    const g = group({
      subgroups: [
        { id: "s1", name: "Upstairs", memberIds: ["a", "c"], bills: [] },
        { id: "s2", name: "Downstairs", memberIds: ["b"], bills: [] },
      ],
    });
    const { group: next, notes } = removeMember(g, "c");

    expect(next.subgroups[0].memberIds).toEqual(["a"]);
    expect(next.subgroups[1].memberIds).toEqual(["b"]);
    expect(notes.join(" ")).toContain("1 floor");
  });

  it("hands a fixed chore to someone who is still here", () => {
    const g = group({
      chores: [
        {
          id: "ch1",
          name: "Trash",
          icon: "🗑️",
          everyDays: 2,
          nextDue: "2026-07-28",
          assignMode: "fixed",
          assigneeId: "c",
          rotationIds: [],
          rotationIndex: 0,
          history: [],
        },
      ],
    });
    const { group: next, notes } = removeMember(g, "c");

    expect(next.chores[0].assigneeId).toBe("a");
    expect(notes.join(" ")).toContain("reassigned");
  });

  it("takes the member out of a chore rotation and keeps the index valid", () => {
    const g = group({
      chores: [
        {
          id: "ch1",
          name: "Dishes",
          icon: "🍽️",
          everyDays: 1,
          nextDue: "2026-07-28",
          assignMode: "rotation",
          assigneeId: "c",
          rotationIds: ["a", "b", "c"],
          rotationIndex: 2,
          history: [],
        },
      ],
    });
    const { group: next } = removeMember(g, "c");

    expect(next.chores[0].rotationIds).toEqual(["a", "b"]);
    expect(next.chores[0].rotationIndex).toBeLessThan(2);
    expect(next.chores[0].assigneeId).not.toBe("c");
    expect(["a", "b"]).toContain(next.chores[0].assigneeId);
  });

  it("keeps the remaining balances summing to zero", () => {
    // Cy owes $10 on an approved expense and has already paid it back, so he is
    // square and can leave. Everyone else's position must be untouched.
    const g = group({
      expenses: [
        {
          id: "e1",
          description: "Soap",
          amount: 30,
          submittedBy: "a",
          submittedByName: "Alex",
          status: "approved",
          splits: evenSplit(30, ["a", "b", "c"]),
          date: "2026-07-01T00:00:00.000Z",
        },
      ],
      payments: [
        {
          id: "p1",
          fromId: "c",
          fromName: "Cy",
          toId: "a",
          toName: "Alex",
          amount: 10,
          status: "confirmed",
          date: "2026-07-02T00:00:00.000Z",
        },
      ],
    });

    const charges: Charge[] = [
      {
        id: "e1",
        type: "expense",
        description: "Soap",
        amount: 30,
        splits: evenSplit(30, ["a", "b", "c"]),
        recurring: false,
        paidBy: "a",
      },
    ];

    expect(canRemoveMember(g, "c", charges).ok).toBe(true);

    const before = calcBalances(g.members, charges, g.payments);
    const { group: next } = removeMember(g, "c");
    const after = calcBalances(next.members, charges, next.payments);

    expect(after.a).toBeCloseTo(before.a, 2);
    expect(after.b).toBeCloseTo(before.b, 2);
    const total = next.members.reduce((s, m) => s + (after[m.id] || 0), 0);
    expect(total).toBeCloseTo(0, 2);
  });
});
