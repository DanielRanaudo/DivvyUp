import { carryoverCharges, stillOpen } from "./periods";
import type { Group, Subgroup, Charge } from "./types";

/**
 * Flattens every subgroup's bills into Charge entries that feed the shared
 * settlement engine. Each bill's `splits` already covers only that subgroup's
 * members, so no settlement changes are needed.
 *
 * Bills from a closed month are left out: their effect lives on in that
 * month's carry-forward instead.
 */
export function subgroupCharges(subgroups: Subgroup[]): Charge[] {
  const charges: Charge[] = [];
  (subgroups || []).forEach((sub) => {
    stillOpen(sub.bills).forEach((bill) => {
      charges.push({
        id: bill.id,
        type: "subgroup",
        description: `${sub.name}: ${bill.name}`,
        amount: bill.amount,
        splits: bill.splits,
        recurring: bill.recurring,
        paidBy: bill.paidBy,
        submittedByName: bill.paidByName,
        subgroupName: sub.name,
      });
    });
  });
  return charges;
}

/**
 * Everything the group currently owes, in one list: rent, bills, approved
 * expenses, subgroup bills, and the debts carried over from closed months.
 *
 * This is what the settlement engine, the dashboard and the balance checks all
 * read from, so it has to be the same list for each of them.
 */
export function buildCharges(group: Group): Charge[] {
  const charges: Charge[] = [];
  // Rent and bills are collected by the treasurer, so they are owed to them.
  const treasurerId = group.members.find((m) => m.isTreasurer)?.id;

  if (group.rent?.splits) {
    charges.push({
      id: group.rent.id,
      type: "rent",
      description: "Rent",
      amount: group.rent.amount,
      splits: group.rent.splits,
      recurring: group.rent.recurring,
      paidBy: treasurerId,
    });
  }

  stillOpen(group.utilities).forEach((u) =>
    charges.push({
      id: u.id,
      type: "utility",
      description: u.name,
      amount: u.amount,
      splits: u.splits,
      recurring: u.recurring,
      paidBy: treasurerId,
    })
  );

  stillOpen(group.expenses)
    .filter((e) => e.status === "approved" && e.splits)
    .forEach((e) =>
      charges.push({
        id: e.id,
        type: "expense",
        description: e.description,
        amount: e.amount,
        splits: e.splits!,
        submittedByName: e.submittedByName,
        paidBy: e.submittedBy,
        recurring: false,
      })
    );

  charges.push(...subgroupCharges(group.subgroups ?? []));
  // The charges behind these are archived; this is what keeps them counting.
  charges.push(...carryoverCharges(group));
  return charges;
}
