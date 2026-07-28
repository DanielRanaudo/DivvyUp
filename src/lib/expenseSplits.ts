import { evenSplit, splitByWeights } from "./splits";
import { formatMoney } from "./format";
import type { Expense, Member, SplitMode } from "./types";

/**
 * A treasurer's in-progress answer to "who owes what for this?".
 *
 * `entries` holds raw text rather than numbers because it is bound straight to
 * inputs: a half-typed "12." has to survive a re-render.
 */
export interface SplitDraft {
  mode: SplitMode;
  /** Who shares the cost. Ignored by exact and percentage. */
  includedIds: string[];
  /** Dollar amounts or percentages, keyed by member id. */
  entries: Record<string, string>;
}

/** Cents of slack, matching the tolerance in the approve_expense RPC. */
const TOLERANCE = 0.01;

export function parseEntry(text: string | undefined): number {
  const n = parseFloat((text ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function emptyDraft(memberIds: string[]): SplitDraft {
  return { mode: "even", includedIds: [...memberIds], entries: {} };
}

/**
 * The shares a draft describes. Always sums to `amount` for the even, subset and
 * percentage modes; for exact amounts it returns what was typed, which is why
 * `splitProblem` has to be consulted before sending it anywhere.
 */
export function buildSplits(
  draft: SplitDraft,
  amount: number,
  allIds: string[]
): Record<string, number> {
  switch (draft.mode) {
    case "even":
      return evenSplit(amount, allIds);
    case "subset":
      return evenSplit(amount, draft.includedIds);
    case "exact": {
      const splits: Record<string, number> = {};
      allIds.forEach((id) => {
        const value = parseEntry(draft.entries[id]);
        if (value > 0) splits[id] = Math.round(value * 100) / 100;
      });
      return splits;
    }
    case "percentage": {
      const weights: Record<string, number> = {};
      allIds.forEach((id) => {
        const value = parseEntry(draft.entries[id]);
        if (value > 0) weights[id] = value;
      });
      return Object.keys(weights).length === 0
        ? {}
        : splitByWeights(amount, weights);
    }
  }
}

/** Total of the shares in a split, rounded to cents. */
export function splitTotal(splits: Record<string, number>): number {
  const cents = Object.values(splits).reduce(
    (sum, share) => sum + Math.round(share * 100),
    0
  );
  return cents / 100;
}

/**
 * Why a draft can't be approved yet, in words the treasurer can act on, or null
 * when it is ready. The same conditions are enforced again in the database.
 */
export function splitProblem(
  draft: SplitDraft,
  amount: number,
  allIds: string[]
): string | null {
  if (!(amount > 0)) return "This expense has no amount to split.";

  if (draft.mode === "subset" && draft.includedIds.length === 0) {
    return "Pick at least one person to split this between.";
  }

  if (draft.mode === "exact") {
    const total = splitTotal(buildSplits(draft, amount, allIds));
    if (total === 0) return "Enter what each person owes.";
    const off = Math.round((amount - total) * 100) / 100;
    if (Math.abs(off) > TOLERANCE) {
      return off > 0
        ? `${formatMoney(off)} still unassigned.`
        : `${formatMoney(-off)} over the total.`;
    }
  }

  if (draft.mode === "percentage") {
    const percent =
      Math.round(
        allIds.reduce((sum, id) => sum + parseEntry(draft.entries[id]), 0) * 100
      ) / 100;
    if (percent === 0) return "Enter each person's percentage.";
    if (Math.abs(percent - 100) > TOLERANCE) {
      return percent < 100
        ? `${(100 - percent).toFixed(2).replace(/\.00$/, "")}% left to assign.`
        : `${(percent - 100).toFixed(2).replace(/\.00$/, "")}% over 100%.`;
    }
  }

  return null;
}

/**
 * Reconstructs the draft behind an already-approved expense, so reopening one
 * to adjust it starts from what the treasurer last chose rather than from
 * scratch.
 */
export function draftFromExpense(
  expense: Expense,
  allIds: string[]
): SplitDraft {
  const splits = expense.splits ?? {};
  const sharers = allIds.filter((id) => (splits[id] ?? 0) > 0);
  const mode: SplitMode = expense.splitMode ?? "even";
  const entries: Record<string, string> = {};

  if (mode === "exact") {
    sharers.forEach((id) => (entries[id] = splits[id].toFixed(2)));
  } else if (mode === "percentage" && expense.amount > 0) {
    sharers.forEach(
      (id) =>
        (entries[id] = ((splits[id] / expense.amount) * 100).toFixed(2))
    );
  }

  return {
    mode,
    includedIds: sharers.length > 0 ? sharers : [...allIds],
    entries,
  };
}

/**
 * One line describing how a charge was divided, for the expense list. Derived
 * from the amounts rather than the stored mode, since the amounts are what
 * everyone's balance is actually built from.
 */
export function describeSplit(
  splits: Record<string, number> | undefined,
  members: Member[]
): string {
  if (!splits) return "";
  const sharers = Object.entries(splits).filter(([, share]) => share > 0);
  if (sharers.length === 0) return "";

  if (sharers.length === 1) {
    const only = members.find((m) => m.id === sharers[0][0]);
    return only ? `all of it to ${only.name}` : "one person";
  }

  const shares = sharers.map(([, share]) => Math.round(share * 100));
  // Within a cent: an even split of an amount that doesn't divide cleanly.
  const identical = shares.every((c) => Math.abs(c - shares[0]) <= 1);
  if (!identical) return `split ${sharers.length} ways`;

  return sharers.length === members.length
    ? `${formatMoney(shares[0] / 100)}/person`
    : `${formatMoney(shares[0] / 100)} each, ${sharers.length} of ${
        members.length
      }`;
}
