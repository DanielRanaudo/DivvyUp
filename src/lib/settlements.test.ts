import { describe, it, expect } from "vitest";
import {
  calcSmartSettlements,
  calcSimpleSettlements,
  calcSettlements,
} from "./settlements";
import type { Member, Charge, Payment, Settlement } from "./types";

const member = (id: string, isTreasurer = false): Member => ({
  id,
  name: id.toUpperCase(),
  venmo: "",
  isTreasurer,
});

const charge = (
  paidBy: string,
  amount: number,
  splits: Record<string, number>
): Charge => ({
  id: `charge-${Math.random()}`,
  type: "utility",
  description: "test charge",
  amount,
  splits,
  recurring: false,
  paidBy,
});

const payment = (
  fromId: string,
  toId: string,
  amount: number,
  status: Payment["status"] = "confirmed"
): Payment => ({
  id: `pay-${Math.random()}`,
  fromId,
  fromName: fromId.toUpperCase(),
  toId,
  toName: toId.toUpperCase(),
  amount,
  status,
  date: new Date().toISOString(),
});

/** Net balance change per member implied by a settlement list. */
const netOf = (settlements: Settlement[]) => {
  const net: Record<string, number> = {};
  settlements.forEach((s) => {
    net[s.fromId] = (net[s.fromId] || 0) - s.amount;
    net[s.toId] = (net[s.toId] || 0) + s.amount;
  });
  return net;
};

describe("calcSmartSettlements", () => {
  it("routes everyone's share to the payer for a single charge", () => {
    const members = [member("a", true), member("b"), member("c")];
    const charges = [charge("a", 90, { a: 30, b: 30, c: 30 })];
    const result = calcSmartSettlements(members, charges, []);

    expect(result).toHaveLength(2);
    expect(result.every((s) => s.toId === "a")).toBe(true);
    expect(result.find((s) => s.fromId === "b")?.amount).toBe(30);
    expect(result.find((s) => s.fromId === "c")?.amount).toBe(30);
  });

  it("subtracts confirmed payments but ignores pending and rejected ones", () => {
    const members = [member("a", true), member("b")];
    const charges = [charge("a", 100, { a: 50, b: 50 })];
    const payments = [
      payment("b", "a", 20, "confirmed"),
      payment("b", "a", 10, "pending"),
      payment("b", "a", 10, "rejected"),
    ];
    const result = calcSmartSettlements(members, charges, payments);
    expect(result).toEqual([
      expect.objectContaining({ fromId: "b", toId: "a", amount: 30 }),
    ]);
  });

  it("returns nothing when everyone is settled up", () => {
    const members = [member("a", true), member("b")];
    const charges = [charge("a", 100, { a: 50, b: 50 })];
    const payments = [payment("b", "a", 50)];
    expect(calcSmartSettlements(members, charges, payments)).toEqual([]);
  });

  it("minimizes transfers in a debt chain (b owes a, c owes b)", () => {
    // a paid 60 split a/b, b paid 60 split b/c.
    // Net: a +30, b 0, c -30 -> smart mode needs only one transfer: c -> a.
    const members = [member("a", true), member("b"), member("c")];
    const charges = [
      charge("a", 60, { a: 30, b: 30 }),
      charge("b", 60, { b: 30, c: 30 }),
    ];
    const result = calcSmartSettlements(members, charges, []);
    expect(result).toEqual([
      expect.objectContaining({ fromId: "c", toId: "a", amount: 30 }),
    ]);
  });

  it("settlements exactly cancel each member's balance", () => {
    const members = [member("a", true), member("b"), member("c"), member("d")];
    const charges = [
      charge("a", 100, { a: 25.34, b: 24.89, c: 25.11, d: 24.66 }),
      charge("b", 33.33, { a: 11.11, b: 11.11, c: 11.11 }),
      charge("d", 7.5, { c: 3.75, d: 3.75 }),
    ];
    const result = calcSmartSettlements(members, charges, []);

    // Expected balance: paid amount minus own shares across all charges.
    const balance: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    charges.forEach((c) => {
      balance[c.paidBy!] += c.amount;
      Object.entries(c.splits).forEach(([m, amt]) => (balance[m] -= amt));
    });

    // A member owed money (positive balance) should receive exactly that
    // much from the settlements; a debtor should pay exactly what they owe.
    const net = netOf(result);
    members.forEach((m) => {
      expect(net[m.id] ?? 0).toBeCloseTo(balance[m.id], 2);
    });
  });

  it("handles uneven penny splits without inventing or losing money", () => {
    const members = [member("a", true), member("b"), member("c")];
    const charges = [charge("a", 100, { a: 33.34, b: 33.33, c: 33.33 })];
    const result = calcSmartSettlements(members, charges, []);
    const total = result.reduce((acc, s) => acc + s.amount, 0);
    expect(total).toBeCloseTo(66.66, 2);
  });
});

describe("calcSimpleSettlements", () => {
  it("keeps debts pairwise instead of rerouting them", () => {
    // Same chain as the smart test: simple mode keeps two transfers.
    const members = [member("a", true), member("b"), member("c")];
    const charges = [
      charge("a", 60, { a: 30, b: 30 }),
      charge("b", 60, { b: 30, c: 30 }),
    ];
    const result = calcSimpleSettlements(members, charges, []);
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromId: "b", toId: "a", amount: 30 }),
        expect.objectContaining({ fromId: "c", toId: "b", amount: 30 }),
      ])
    );
  });

  it("nets opposite debts between the same pair", () => {
    const members = [member("a", true), member("b")];
    const charges = [
      charge("a", 100, { a: 50, b: 50 }), // b owes a 50
      charge("b", 40, { a: 20, b: 20 }), // a owes b 20
    ];
    const result = calcSimpleSettlements(members, charges, []);
    expect(result).toEqual([
      expect.objectContaining({ fromId: "b", toId: "a", amount: 30 }),
    ]);
  });

  it("applies confirmed payments to the pair's balance", () => {
    const members = [member("a", true), member("b")];
    const charges = [charge("a", 100, { a: 50, b: 50 })];
    const payments = [payment("b", "a", 50)];
    expect(calcSimpleSettlements(members, charges, payments)).toEqual([]);
  });

  it("ignores charges with no payer", () => {
    const members = [member("a", true), member("b")];
    const noPayer: Charge = {
      id: "x",
      type: "expense",
      description: "orphan",
      amount: 50,
      splits: { a: 25, b: 25 },
      recurring: false,
    };
    expect(calcSimpleSettlements(members, [noPayer], [])).toEqual([]);
  });
});

describe("calcSettlements", () => {
  const members = [member("a", true), member("b"), member("c")];
  const charges = [
    charge("a", 60, { a: 30, b: 30 }),
    charge("b", 60, { b: 30, c: 30 }),
  ];

  it("dispatches to smart mode", () => {
    expect(calcSettlements(members, charges, [], true)).toHaveLength(1);
  });

  it("dispatches to simple mode", () => {
    expect(calcSettlements(members, charges, [], false)).toHaveLength(2);
  });
});
