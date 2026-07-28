import { describe, it, expect } from "vitest";
import { decidePayment, paymentsAwaiting } from "@/lib/payments";
import type { Group, Payment } from "@/lib/types";

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "p1",
    fromId: "b",
    fromName: "Bea",
    toId: "a",
    toName: "Alex",
    amount: 20,
    status: "pending",
    date: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function group(payments: Payment[]): Group {
  return {
    id: "g1",
    name: "Apt 4B",
    code: "ABC1234567",
    members: [],
    rent: null,
    utilities: [],
    expenses: [],
    payments,
    subgroups: [],
    chores: [],
    periods: [],
    smartSettle: false,
    docsVersion: 0,
  };
}

describe("paymentsAwaiting", () => {
  it("finds the payments this member has been asked to confirm", () => {
    const mine = payment();
    const theirs = payment({ id: "p2", toId: "c" });
    expect(paymentsAwaiting([mine, theirs], "a")).toEqual([mine]);
  });

  it("ignores payments that have already been answered", () => {
    const answered = [
      payment({ id: "p1", status: "confirmed" }),
      payment({ id: "p2", status: "rejected" }),
    ];
    expect(paymentsAwaiting(answered, "a")).toEqual([]);
  });

  it("treats a group with no payments as nothing to do", () => {
    expect(paymentsAwaiting(undefined, "a")).toEqual([]);
  });
});

describe("decidePayment", () => {
  it("confirms only the payment named", () => {
    const g = group([payment(), payment({ id: "p2" })]);
    const next = decidePayment(g, "p1", "confirmed");

    expect(next.payments[0].status).toBe("confirmed");
    expect(next.payments[1].status).toBe("pending");
  });

  it("records a rejection", () => {
    const next = decidePayment(group([payment()]), "p1", "rejected");
    expect(next.payments[0].status).toBe("rejected");
  });

  it("leaves the group alone when the payment is gone", () => {
    const g = group([payment()]);
    expect(decidePayment(g, "missing", "confirmed").payments).toEqual(
      g.payments
    );
  });
});
