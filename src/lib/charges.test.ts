import { describe, it, expect } from "vitest";
import { buildCharges, subgroupCharges } from "./charges";
import type { Group, Subgroup } from "./types";

describe("subgroupCharges", () => {
  it("flattens bills from every subgroup into charges", () => {
    const subgroups: Subgroup[] = [
      {
        id: "s1",
        name: "2nd Floor",
        memberIds: ["a", "b"],
        bills: [
          {
            id: "b1",
            name: "Toilet paper",
            amount: 10,
            paidBy: "a",
            paidByName: "A",
            recurring: false,
            splits: { a: 5, b: 5 },
            date: "2026-07-01",
          },
        ],
      },
      {
        id: "s2",
        name: "Kitchen Crew",
        memberIds: ["b", "c"],
        bills: [
          {
            id: "b2",
            name: "Spices",
            amount: 20,
            paidBy: "c",
            paidByName: "C",
            recurring: true,
            splits: { b: 10, c: 10 },
            date: "2026-07-02",
          },
        ],
      },
    ];

    const charges = subgroupCharges(subgroups);
    expect(charges).toHaveLength(2);
    expect(charges[0]).toMatchObject({
      id: "b1",
      type: "subgroup",
      description: "2nd Floor: Toilet paper",
      amount: 10,
      paidBy: "a",
      splits: { a: 5, b: 5 },
    });
    expect(charges[1]).toMatchObject({
      id: "b2",
      description: "Kitchen Crew: Spices",
      recurring: true,
      subgroupName: "Kitchen Crew",
    });
  });

  it("handles empty and missing inputs", () => {
    expect(subgroupCharges([])).toEqual([]);
    expect(
      subgroupCharges([{ id: "s", name: "Empty", memberIds: [], bills: [] }])
    ).toEqual([]);
  });
});

describe("buildCharges", () => {
  function house(overrides: Partial<Group> = {}): Group {
    return {
      id: "g1",
      name: "Apt 4B",
      code: "ABC1234567",
      members: [
        { id: "a", name: "Alex", venmo: "", zelle: "", isTreasurer: true },
        { id: "b", name: "Bea", venmo: "", zelle: "", isTreasurer: false },
      ],
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

  it("puts rent and bills down as owed to the treasurer", () => {
    const charges = buildCharges(
      house({
        rent: {
          id: "r1",
          amount: 2000,
          splitType: "equal",
          recurring: true,
          percentages: {},
          customs: {},
          splits: { a: 1000, b: 1000 },
        },
        utilities: [
          {
            id: "u1",
            name: "Power",
            amount: 90,
            recurring: true,
            splits: { a: 45, b: 45 },
            date: "2026-07-01",
          },
        ],
      })
    );

    expect(charges.map((c) => c.type)).toEqual(["rent", "utility"]);
    expect(charges.every((c) => c.paidBy === "a")).toBe(true);
  });

  it("counts an approved expense and ignores one still waiting", () => {
    const charges = buildCharges(
      house({
        expenses: [
          {
            id: "e1",
            description: "Soap",
            amount: 60,
            submittedBy: "b",
            submittedByName: "Bea",
            status: "approved",
            splits: { a: 30, b: 30 },
            date: "2026-07-02",
          },
          {
            id: "e2",
            description: "Lightbulbs",
            amount: 12,
            submittedBy: "b",
            submittedByName: "Bea",
            status: "pending",
            date: "2026-07-03",
          },
        ],
      })
    );

    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ id: "e1", paidBy: "b" });
  });

  it("leaves out what a closed month took, and carries its debts instead", () => {
    const charges = buildCharges(
      house({
        expenses: [
          {
            id: "e1",
            description: "Soap",
            amount: 60,
            submittedBy: "b",
            submittedByName: "Bea",
            status: "approved",
            splits: { a: 30, b: 30 },
            date: "2026-07-02",
            archived: true,
            period: "2026-07-01",
          },
        ],
        periods: [
          {
            id: "p1",
            period: "2026-07-01",
            closedAt: "2026-08-01T00:00:00.000Z",
            carryover: [
              {
                fromId: "a",
                fromName: "Alex",
                toId: "b",
                toName: "Bea",
                amount: 30,
              },
            ],
            totals: { spend: 60, expenses: 1, payments: 0 },
          },
        ],
      })
    );

    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ type: "carryover", amount: 30 });
  });

  it("has nothing to divide in a brand-new house", () => {
    expect(buildCharges(house())).toEqual([]);
  });
});
