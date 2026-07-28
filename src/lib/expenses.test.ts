import { describe, it, expect } from "vitest";
import {
  addExpense,
  approveEvenly,
  approveExpense,
  denyExpense,
  editExpense,
  mayDelete,
  mayEdit,
  removeExpense,
  reopenExpense,
} from "./expenses";
import type { Expense, Group, Member } from "./types";

const alex: Member = {
  id: "a",
  name: "Alex",
  venmo: "",
  zelle: "",
  isTreasurer: true,
};
const bea: Member = {
  id: "b",
  name: "Bea",
  venmo: "",
  zelle: "",
  isTreasurer: false,
};

function house(expenses: Expense[] = []): Group {
  return {
    id: "g1",
    name: "Apt 4B",
    code: "ABC1234567",
    members: [alex, bea],
    rent: null,
    utilities: [],
    expenses,
    payments: [],
    subgroups: [],
    chores: [],
    periods: [],
    smartSettle: false,
    docsVersion: 0,
  };
}

const soap: Expense = {
  id: "e1",
  description: "Soap",
  amount: 10,
  submittedBy: "b",
  submittedByName: "Bea",
  status: "pending",
  date: "2026-07-02T12:00:00.000Z",
};

describe("addExpense", () => {
  it("records who submitted it and leaves it pending", () => {
    const after = addExpense(
      house(),
      { description: "Soap", amount: 10, images: [] },
      bea
    );

    expect(after.expenses).toHaveLength(1);
    expect(after.expenses[0]).toMatchObject({
      description: "Soap",
      amount: 10,
      submittedBy: "b",
      submittedByName: "Bea",
      status: "pending",
    });
  });

  it("leaves images off entirely when there is no receipt", () => {
    const after = addExpense(
      house(),
      { description: "Soap", amount: 10, images: [] },
      bea
    );
    expect(after.expenses[0].images).toBeUndefined();
  });
});

describe("editExpense", () => {
  it("changes only the expense named", () => {
    const other = { ...soap, id: "e2", description: "Bin bags" };
    const after = editExpense(house([soap, other]), "e1", {
      description: "Hand soap",
      amount: 12,
      images: ["r1"],
    });

    expect(after.expenses[0]).toMatchObject({
      description: "Hand soap",
      amount: 12,
      images: ["r1"],
    });
    expect(after.expenses[1]).toEqual(other);
  });
});

describe("approveEvenly", () => {
  it("divides across the whole house to the cent", () => {
    const after = approveEvenly(house([{ ...soap, amount: 10.01 }]), "e1");
    const splits = after.expenses[0].splits ?? {};

    expect(after.expenses[0].status).toBe("approved");
    expect(splits.a + splits.b).toBeCloseTo(10.01, 10);
  });

  it("does nothing when the expense has already gone", () => {
    const before = house([soap]);
    expect(approveEvenly(before, "missing")).toEqual(before);
  });
});

describe("reopenExpense", () => {
  it("drops the splits so the approval stops counting", () => {
    const approved = approveExpense(
      house([soap]),
      "e1",
      { a: 5, b: 5 },
      "even"
    );
    const after = reopenExpense(approved, "e1");

    expect(after.expenses[0]).toMatchObject({
      status: "pending",
      splits: undefined,
      splitMode: undefined,
    });
  });
});

describe("denyExpense and removeExpense", () => {
  it("marks it denied without losing it", () => {
    const after = denyExpense(house([soap]), "e1");
    expect(after.expenses[0].status).toBe("denied");
  });

  it("takes it out of the list entirely", () => {
    expect(removeExpense(house([soap]), "e1").expenses).toEqual([]);
  });
});

describe("who may change an expense", () => {
  it("lets the person who submitted it edit while it waits", () => {
    expect(mayEdit(soap, bea, false)).toBe(true);
  });

  it("stops anyone editing once it is approved", () => {
    const approved: Expense = { ...soap, status: "approved" };
    expect(mayEdit(approved, alex, true)).toBe(false);
  });

  it("keeps a roommate out of someone else's expense", () => {
    const mine: Expense = {
      ...soap,
      submittedBy: "a",
      submittedByName: "Alex",
    };
    expect(mayEdit(mine, bea, false)).toBe(false);
    expect(mayDelete(mine, bea, false)).toBe(false);
  });

  it("lets the treasurer delete an approved one", () => {
    const approved: Expense = { ...soap, status: "approved" };
    expect(mayDelete(approved, alex, true)).toBe(true);
  });
});
