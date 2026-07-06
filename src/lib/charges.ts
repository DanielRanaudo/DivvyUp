import type { Subgroup, Charge } from "./types";

/**
 * Flattens every subgroup's bills into Charge entries that feed the shared
 * settlement engine. Each bill's `splits` already covers only that subgroup's
 * members, so no settlement changes are needed.
 */
export function subgroupCharges(subgroups: Subgroup[]): Charge[] {
  const charges: Charge[] = [];
  (subgroups || []).forEach((sub) => {
    (sub.bills || []).forEach((bill) => {
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
