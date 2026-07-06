import { describe, it, expect } from "vitest";
import { subgroupCharges } from "./charges";
import type { Subgroup } from "./types";

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
