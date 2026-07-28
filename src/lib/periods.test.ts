import { describe, it, expect } from "vitest";
import {
  archivedIn,
  carryoverCharges,
  closableCounts,
  closePeriod,
  closePreview,
  formatPeriod,
  latestClose,
  periodKey,
  stillOpen,
} from "@/lib/periods";
import { calcBalances, calcSettlements } from "@/lib/settlements";
import { evenSplit } from "@/lib/splits";
import type { Charge, Group, Member } from "@/lib/types";

const JULY = new Date("2026-07-27T12:00:00Z");

function member(id: string, name: string, isTreasurer = false): Member {
  return { id, name, venmo: "", zelle: "", isTreasurer };
}

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: "g1",
    name: "Apt 4B",
    code: "ABC1234567",
    members: [member("a", "Alex", true), member("b", "Bea")],
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

/** Bea owes Alex 30: Alex fronted 60 for the two of them. */
function sharedExpense(): { g: Group; charges: Charge[] } {
  const g = group({
    expenses: [
      {
        id: "e1",
        description: "Soap",
        amount: 60,
        submittedBy: "a",
        submittedByName: "Alex",
        status: "approved",
        splits: evenSplit(60, ["a", "b"]),
        date: "2026-07-02T00:00:00.000Z",
      },
    ],
  });
  const charges: Charge[] = [
    {
      id: "e1",
      type: "expense",
      description: "Soap",
      amount: 60,
      splits: evenSplit(60, ["a", "b"]),
      recurring: false,
      paidBy: "a",
    },
  ];
  return { g, charges };
}

describe("periodKey and formatPeriod", () => {
  it("names the month a date falls in", () => {
    expect(periodKey(new Date(2026, 6, 27))).toBe("2026-07-01");
    expect(periodKey(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("reads back as a month and year", () => {
    expect(formatPeriod("2026-07-01")).toBe("July 2026");
  });
});

describe("closePeriod", () => {
  it("records what was owed at the moment of closing", () => {
    const { g, charges } = sharedExpense();
    const { period } = closePeriod(g, charges, JULY);

    expect(period.period).toBe("2026-07-01");
    expect(period.carryover).toEqual([
      { fromId: "b", fromName: "Bea", toId: "a", toName: "Alex", amount: 30 },
    ]);
    expect(period.totals).toMatchObject({ spend: 60, expenses: 1 });
  });

  it("archives decided expenses but leaves pending ones alone", () => {
    const { g, charges } = sharedExpense();
    g.expenses.push({
      id: "e2",
      description: "Lightbulbs",
      amount: 10,
      submittedBy: "b",
      submittedByName: "Bea",
      status: "pending",
      date: "2026-07-20T00:00:00.000Z",
    });

    const { group: next } = closePeriod(g, charges, JULY);

    expect(next.expenses[0]).toMatchObject({
      archived: true,
      period: "2026-07-01",
    });
    expect(next.expenses[1].archived).toBeUndefined();
  });

  it("keeps recurring charges live and archives one-off bills", () => {
    const g = group({
      utilities: [
        {
          id: "u1",
          name: "Power",
          amount: 90,
          recurring: true,
          splits: {},
          date: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "u2",
          name: "Plumber",
          amount: 200,
          recurring: false,
          splits: {},
          date: "2026-07-05T00:00:00.000Z",
        },
      ],
    });

    const { group: next } = closePeriod(g, [], JULY);

    expect(next.utilities[0].archived).toBeUndefined();
    expect(next.utilities[1].archived).toBe(true);
  });

  it("archives one-off subgroup bills", () => {
    const g = group({
      subgroups: [
        {
          id: "s1",
          name: "Upstairs",
          memberIds: ["a", "b"],
          bills: [
            {
              id: "b1",
              name: "Netflix",
              amount: 20,
              paidBy: "a",
              paidByName: "Alex",
              recurring: true,
              splits: {},
              date: "2026-07-01T00:00:00.000Z",
            },
            {
              id: "b2",
              name: "Rug",
              amount: 80,
              paidBy: "b",
              paidByName: "Bea",
              recurring: false,
              splits: {},
              date: "2026-07-03T00:00:00.000Z",
            },
          ],
        },
      ],
    });

    const { group: next } = closePeriod(g, [], JULY);

    expect(next.subgroups[0].bills[0].archived).toBeUndefined();
    expect(next.subgroups[0].bills[1].archived).toBe(true);
  });

  it("leaves an unanswered payment open", () => {
    const g = group({
      payments: [
        {
          id: "p1",
          fromId: "b",
          fromName: "Bea",
          toId: "a",
          toName: "Alex",
          amount: 30,
          status: "pending",
          date: "2026-07-25T00:00:00.000Z",
        },
      ],
    });

    const { group: next } = closePeriod(g, [], JULY);
    expect(next.payments[0].archived).toBeUndefined();
  });

  it("does not re-archive what an earlier close already took", () => {
    const { g, charges } = sharedExpense();
    const first = closePeriod(g, charges, JULY);
    const second = closePeriod(
      first.group,
      carryoverCharges(first.group),
      new Date("2026-08-27T12:00:00Z")
    );

    expect(second.group.expenses[0].period).toBe("2026-07-01");
    expect(second.group.periods).toHaveLength(2);
  });
});

describe("carryoverCharges", () => {
  it("keeps the debt alive after the expense behind it is archived", () => {
    const { g, charges } = sharedExpense();
    const { group: closed } = closePeriod(g, charges, JULY);

    // The expense is archived, so it no longer feeds the settlement engine.
    const after = carryoverCharges(closed);
    const balances = calcBalances(closed.members, after, closed.payments);

    expect(balances.b).toBe(-30);
    expect(balances.a).toBe(30);
  });

  it("still points at the right pair without smart settling", () => {
    const { g, charges } = sharedExpense();
    const { group: closed } = closePeriod(g, charges, JULY);
    const settlements = calcSettlements(
      closed.members,
      carryoverCharges(closed),
      closed.payments,
      false
    );

    expect(settlements).toEqual([
      { fromId: "b", fromName: "Bea", toId: "a", toName: "Alex", amount: 30 },
    ]);
  });

  it("is cleared by paying it off", () => {
    const { g, charges } = sharedExpense();
    const { group: closed } = closePeriod(g, charges, JULY);
    const paid = {
      ...closed,
      payments: [
        {
          id: "p1",
          fromId: "b",
          fromName: "Bea",
          toId: "a",
          toName: "Alex",
          amount: 30,
          status: "confirmed" as const,
          date: "2026-08-02T00:00:00.000Z",
        },
      ],
    };

    expect(
      calcSettlements(
        paid.members,
        carryoverCharges(paid),
        paid.payments,
        false
      )
    ).toEqual([]);
  });

  it("is empty until a month has been closed", () => {
    expect(carryoverCharges(group())).toEqual([]);
    expect(latestClose(group())).toBeNull();
  });

  it("uses only the most recent close, which already contains the older one", () => {
    const { g, charges } = sharedExpense();
    const first = closePeriod(g, charges, JULY);
    const second = closePeriod(
      first.group,
      carryoverCharges(first.group),
      new Date("2026-08-27T12:00:00Z")
    );

    const balances = calcBalances(
      second.group.members,
      carryoverCharges(second.group),
      second.group.payments
    );
    expect(balances.b).toBe(-30);
  });
});

describe("stillOpen and archivedIn", () => {
  it("separates the current month from the archive", () => {
    const { g, charges } = sharedExpense();
    const { group: closed } = closePeriod(g, charges, JULY);

    expect(stillOpen(closed.expenses)).toEqual([]);
    expect(archivedIn(closed.expenses, "2026-07-01")).toHaveLength(1);
    expect(archivedIn(closed.expenses, "2026-06-01")).toEqual([]);
  });
});

describe("closePreview", () => {
  it("says what carries forward and what gets archived", () => {
    const { g, charges } = sharedExpense();
    const notes = closePreview(g, charges);

    expect(notes[0]).toContain("1 unpaid debt");
    expect(notes.join(" ")).toContain("1 expense");
  });

  it("says so when everyone is square", () => {
    expect(closePreview(group(), [])[0]).toContain("square");
  });

  it("warns about expenses still waiting for approval", () => {
    const g = group({
      expenses: [
        {
          id: "e1",
          description: "Soap",
          amount: 10,
          submittedBy: "b",
          submittedByName: "Bea",
          status: "pending",
          date: "2026-07-02T00:00:00.000Z",
        },
      ],
    });

    expect(closePreview(g, []).join(" ")).toContain("waiting for approval");
    expect(closableCounts(g).pendingExpenses).toBe(1);
  });
});
