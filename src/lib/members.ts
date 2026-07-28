import { evenSplit, splitByWeights } from "@/lib/splits";
import { calcBalances, SETTLED_EPSILON } from "@/lib/settlements";
import type { Charge, Chore, Group, RentConfig } from "@/lib/types";

/**
 * Removing a roommate used to strip them from `members` and little else, which
 * left their id in the rent splits. Rent then kept being divided as though they
 * still lived there, so every remaining balance was quietly wrong.
 *
 * Two rules make this safe:
 *
 *  1. They have to be square first (`canRemoveMember`). At a zero balance,
 *     everything they were part of nets out on its own, so past charges can be
 *     left exactly as they were — a record of who owed what at the time.
 *
 *  2. Rent is the exception, because it isn't history: it is the standing
 *     monthly figure, and it has to be divided among the people actually
 *     living there. It gets re-split, and the caller is told so.
 */

export interface MemberRemoval {
  group: Group;
  /** Consequences worth telling the treasurer about, in plain language. */
  notes: string[];
}

export interface RemovalCheck {
  ok: boolean;
  /** Why the removal is blocked, ready to show the user. */
  reason?: string;
  /** The member's net position; positive means the group owes them. */
  balance: number;
}

/** A member's net position: positive means the group owes them. */
export function memberBalance(
  group: Group,
  memberId: string,
  charges: Charge[]
): number {
  const balances = calcBalances(group.members, charges, group.payments);
  return Math.round((balances[memberId] || 0) * 100) / 100;
}

/**
 * Whether a member can be removed without corrupting anyone's balance. An
 * outstanding balance has to be settled first: there is nowhere for the debt
 * to go once the person is gone.
 */
export function canRemoveMember(
  group: Group,
  memberId: string,
  charges: Charge[]
): RemovalCheck {
  const member = group.members.find((m) => m.id === memberId);
  if (!member) {
    return { ok: false, reason: "That person isn't in this group.", balance: 0 };
  }

  if (group.members.length === 1) {
    return {
      ok: false,
      reason: "A group needs at least one member. Delete the group instead.",
      balance: 0,
    };
  }

  const balance = memberBalance(group, memberId, charges);

  if (balance < -SETTLED_EPSILON) {
    return {
      ok: false,
      reason: `${member.name} still owes ${formatAbs(
        balance
      )}. Settle up first, then remove them.`,
      balance,
    };
  }

  if (balance > SETTLED_EPSILON) {
    return {
      ok: false,
      reason: `${member.name} is still owed ${formatAbs(
        balance
      )}. Pay them back first, then remove them.`,
      balance,
    };
  }

  return { ok: true, balance };
}

function formatAbs(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

/**
 * Re-divides rent among the remaining members, keeping the total intact.
 *
 * Each split type keeps its intent as far as possible: an equal split stays
 * equal, percentages are rescaled to still total 100, and custom amounts are
 * kept with the departing member's share spread evenly over everyone left.
 */
function resplitRent(
  rent: RentConfig,
  remainingIds: string[]
): { rent: RentConfig; note: string } {
  const keep = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(
      Object.entries(record).filter(([id]) => remainingIds.includes(id))
    );

  const percentages = keep(rent.percentages);
  const customs = keep(rent.customs);

  if (remainingIds.length === 0) {
    return {
      rent: { ...rent, percentages, customs, splits: {} },
      note: "Rent no longer has anyone to divide between.",
    };
  }

  if (rent.splitType === "percentage") {
    const weights: Record<string, number> = {};
    remainingIds.forEach((id) => {
      weights[id] = parseFloat(percentages[id] ?? "") || 0;
    });
    const total = Object.values(weights).reduce((s, w) => s + w, 0);

    // Rescale so the shares still add to 100%, preserving relative amounts.
    const rescaled: Record<string, string> = {};
    remainingIds.forEach((id) => {
      const pct = total > 0 ? (weights[id] / total) * 100 : 100 / remainingIds.length;
      rescaled[id] = pct.toFixed(2).replace(/\.00$/, "");
    });

    return {
      rent: {
        ...rent,
        percentages: rescaled,
        customs,
        splits: splitByWeights(rent.amount, weights),
      },
      note: `Rent percentages were rescaled across the remaining ${remainingIds.length} roommates.`,
    };
  }

  if (rent.splitType === "custom") {
    const kept: Record<string, number> = {};
    remainingIds.forEach((id) => {
      kept[id] = parseFloat(customs[id] ?? "") || 0;
    });
    const covered = Object.values(kept).reduce((s, v) => s + v, 0);
    const shortfall = rent.amount - covered;

    // Whatever the departing roommate was covering is shared out evenly.
    const topUp = evenSplit(Math.max(0, shortfall), remainingIds);
    const adjusted: Record<string, string> = {};
    const splits: Record<string, number> = {};
    remainingIds.forEach((id) => {
      const value = Math.round((kept[id] + (topUp[id] ?? 0)) * 100) / 100;
      adjusted[id] = value.toFixed(2);
      splits[id] = value;
    });

    return {
      rent: { ...rent, percentages, customs: adjusted, splits },
      note: `${formatAbs(
        shortfall
      )} of rent was reassigned evenly to the remaining roommates.`,
    };
  }

  return {
    rent: {
      ...rent,
      percentages,
      customs,
      splits: evenSplit(rent.amount, remainingIds),
    },
    note: `Rent is now split evenly between ${remainingIds.length} roommates.`,
  };
}

/** Takes a departing member out of a chore's assignment without orphaning it. */
function reassignChore(
  chore: Chore,
  removedId: string,
  remainingIds: string[]
): Chore {
  const rotationIds = chore.rotationIds.filter((id) => id !== removedId);
  const rotationIndex =
    rotationIds.length > 0 ? chore.rotationIndex % rotationIds.length : 0;

  let assigneeId = chore.assigneeId;
  if (assigneeId === removedId) {
    assigneeId =
      chore.assignMode === "rotation" && rotationIds.length > 0
        ? rotationIds[rotationIndex]
        : remainingIds[0] ?? "";
  }

  return { ...chore, rotationIds, rotationIndex, assigneeId };
}

/**
 * Removes a member and repairs everything that referenced them.
 *
 * Call `canRemoveMember` first: this assumes the member is square, and relies
 * on that to leave historical splits untouched.
 */
export function removeMember(group: Group, memberId: string): MemberRemoval {
  const member = group.members.find((m) => m.id === memberId);
  if (!member) return { group, notes: [] };

  const members = group.members.filter((m) => m.id !== memberId);
  const remainingIds = members.map((m) => m.id);
  const notes: string[] = [];

  // Unreviewed requests aren't history, so they leave with their submitter.
  // Approved ones stay: they record what the group actually agreed to.
  const droppedPending = group.expenses.filter(
    (e) => e.submittedBy === memberId && e.status === "pending"
  ).length;
  const expenses = group.expenses.filter(
    (e) => !(e.submittedBy === memberId && e.status === "pending")
  );
  if (droppedPending > 0) {
    notes.push(
      droppedPending === 1
        ? "Their pending expense request was withdrawn."
        : `${droppedPending} pending expense requests were withdrawn.`
    );
  }

  const subgroups = (group.subgroups ?? []).map((s) =>
    s.memberIds.includes(memberId)
      ? { ...s, memberIds: s.memberIds.filter((id) => id !== memberId) }
      : s
  );
  const floorsAffected = (group.subgroups ?? []).filter((s) =>
    s.memberIds.includes(memberId)
  ).length;
  if (floorsAffected > 0) {
    notes.push(
      `Removed from ${floorsAffected} floor${floorsAffected === 1 ? "" : "s"}.`
    );
  }

  const choresReassigned = (group.chores ?? []).filter(
    (c) => c.assigneeId === memberId
  ).length;
  const chores = (group.chores ?? []).map((c) =>
    c.assigneeId === memberId || c.rotationIds.includes(memberId)
      ? reassignChore(c, memberId, remainingIds)
      : c
  );
  if (choresReassigned > 0) {
    notes.push(
      `${choresReassigned} chore${
        choresReassigned === 1 ? " was" : "s were"
      } reassigned.`
    );
  }

  let rent = group.rent;
  const rentMentionsMember =
    rent !== null &&
    (rent.splits[memberId] !== undefined ||
      rent.percentages[memberId] !== undefined ||
      rent.customs[memberId] !== undefined);
  if (rent && rentMentionsMember) {
    const result = resplitRent(rent, remainingIds);
    rent = result.rent;
    notes.push(result.note);
  }

  return {
    group: { ...group, members, expenses, subgroups, chores, rent },
    notes,
  };
}
