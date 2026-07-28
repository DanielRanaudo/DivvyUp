import { evenSplit } from "./splits";
import { uid } from "./utils";
import type { Expense, Group, Member, SplitMode } from "./types";

/** What the submit form collects; everything else is filled in here. */
export interface ExpenseDraft {
  description: string;
  amount: number;
  images: string[];
}

/**
 * A new expense, always pending.
 *
 * The status is not the caller's to choose — the insert policy in Postgres
 * refuses anything else, and this keeps the optimistic UI honest about it.
 */
export function addExpense(
  group: Group,
  draft: ExpenseDraft,
  submitter: Member,
  now: Date = new Date()
): Group {
  return {
    ...group,
    expenses: [
      ...group.expenses,
      {
        id: uid(),
        description: draft.description,
        amount: draft.amount,
        submittedBy: submitter.id,
        submittedByName: submitter.name,
        status: "pending",
        images: draft.images.length > 0 ? draft.images : undefined,
        date: now.toISOString(),
      },
    ],
  };
}

function mapExpense(
  group: Group,
  id: string,
  change: (expense: Expense) => Expense
): Group {
  return {
    ...group,
    expenses: group.expenses.map((e) => (e.id === id ? change(e) : e)),
  };
}

export function editExpense(
  group: Group,
  id: string,
  draft: ExpenseDraft
): Group {
  return mapExpense(group, id, (e) => ({
    ...e,
    description: draft.description,
    amount: draft.amount,
    images: draft.images,
  }));
}

export function removeExpense(group: Group, id: string): Group {
  return { ...group, expenses: group.expenses.filter((e) => e.id !== id) };
}

/** Approves with the splits the treasurer chose. */
export function approveExpense(
  group: Group,
  id: string,
  splits: Record<string, number>,
  splitMode: SplitMode
): Group {
  return mapExpense(group, id, (e) => ({
    ...e,
    status: "approved",
    splits,
    splitMode,
  }));
}

/**
 * The one-click case: everyone in the house shares it equally.
 *
 * evenSplit hands out the leftover cents, so the shares sum to the total
 * exactly — rounding each share on its own drifts by a cent or two on amounts
 * that don't divide cleanly, which approve_expense rejects outright.
 */
export function approveEvenly(group: Group, id: string): Group {
  const expense = group.expenses.find((e) => e.id === id);
  if (!expense) return group;
  return approveExpense(
    group,
    id,
    evenSplit(
      expense.amount,
      group.members.map((m) => m.id)
    ),
    "even"
  );
}

export function denyExpense(group: Group, id: string): Group {
  return mapExpense(group, id, (e) => ({ ...e, status: "denied" }));
}

/**
 * Puts an expense back in the queue.
 *
 * The splits go with it: until someone approves it again, it should not be
 * moving anybody's balance.
 */
export function reopenExpense(group: Group, id: string): Group {
  return mapExpense(group, id, (e) => ({
    ...e,
    status: "pending",
    splits: undefined,
    splitMode: undefined,
  }));
}

/**
 * Editing is only offered while an expense is pending: changing the amount of
 * an approved one would leave its splits adding up to a total that no longer
 * exists. update_expense refuses it too.
 */
export function mayEdit(
  expense: Expense,
  viewer: Member,
  isTreasurer: boolean
): boolean {
  return (
    expense.status === "pending" &&
    (isTreasurer || expense.submittedBy === viewer.id)
  );
}

export function mayDelete(
  expense: Expense,
  viewer: Member,
  isTreasurer: boolean
): boolean {
  return (
    isTreasurer ||
    (expense.status === "pending" && expense.submittedBy === viewer.id)
  );
}
