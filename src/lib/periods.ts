import { calcSettlements } from "./settlements";
import { uid } from "./utils";
import type {
  Charge,
  ClosedPeriod,
  Group,
  Page,
  PeriodTotals,
  Settlement,
} from "./types";

/**
 * Monthly close-out.
 *
 * Without it the ledger only grows: rent charged once in March is still the
 * same open debt in November, and every load drags the whole history down the
 * wire. Closing a month draws a line under it — the one-off charges are
 * archived, and whatever was still owed at that moment is written down as a
 * short list of debts that carries forward.
 *
 * Recurring charges (rent, monthly bills) deliberately stay live: they bill
 * again in the new month, while the month just gone is represented by the
 * carry-forward.
 */

const monthLabel = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** First day of the month a date falls in, as "YYYY-MM-01". */
export function periodKey(at: Date): string {
  const month = `${at.getMonth() + 1}`.padStart(2, "0");
  return `${at.getFullYear()}-${month}-01`;
}

/** "2026-07-01" -> "July 2026". */
export function formatPeriod(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? key : monthLabel.format(d);
}

/** The most recently closed month, or null if the books have never been closed. */
export function latestClose(group: Group): ClosedPeriod | null {
  const periods = group.periods ?? [];
  return periods.length === 0 ? null : periods[periods.length - 1];
}

/**
 * The debts brought forward from the last close, expressed as charges the
 * settlement engine already understands: the amount is owed by one member and
 * credited to another, exactly as if it were a bill that person had paid.
 *
 * Only the latest close matters — each carry-forward is calculated including
 * the one before it.
 */
export function carryoverCharges(group: Group): Charge[] {
  const last = latestClose(group);
  if (!last) return [];
  const label = `Owed from ${formatPeriod(last.period)}`;
  return last.carryover.map((s, i) => ({
    id: `carryover-${last.period}-${i}`,
    type: "carryover" as const,
    description: label,
    amount: s.amount,
    splits: { [s.fromId]: s.amount },
    recurring: false,
    paidBy: s.toId,
  }));
}

function isOpenExpense(e: Group["expenses"][number]): boolean {
  return !e.archived;
}

/** What is still live and would be swept up by closing the month. */
export function closableCounts(group: Group): {
  expenses: number;
  payments: number;
  bills: number;
  pendingExpenses: number;
} {
  const expenses = group.expenses.filter(isOpenExpense);
  return {
    expenses: expenses.filter((e) => e.status !== "pending").length,
    payments: (group.payments ?? []).filter(
      (p) => !p.archived && p.status !== "pending"
    ).length,
    bills:
      group.utilities.filter((u) => !u.archived && !u.recurring).length +
      (group.subgroups ?? []).reduce(
        (n, s) =>
          n + (s.bills ?? []).filter((b) => !b.archived && !b.recurring).length,
        0
      ),
    pendingExpenses: expenses.filter((e) => e.status === "pending").length,
  };
}

/** Plain-language consequences, for the confirmation dialog. */
export function closePreview(group: Group, allCharges: Charge[]): string[] {
  const counts = closableCounts(group);
  const notes: string[] = [];
  const carried = calcSettlements(
    group.members,
    allCharges,
    group.payments,
    group.smartSettle
  );

  notes.push(
    carried.length === 0
      ? "Everyone is square, so nothing carries forward."
      : `${carried.length} unpaid debt${
          carried.length === 1 ? "" : "s"
        } carry forward into the new month.`
  );
  if (counts.expenses > 0 || counts.payments > 0) {
    notes.push(
      `${counts.expenses} expense${
        counts.expenses === 1 ? "" : "s"
      } and ${counts.payments} payment${
        counts.payments === 1 ? "" : "s"
      } move to the archive.`
    );
  }
  if (counts.bills > 0) {
    notes.push(
      `${counts.bills} one-off bill${
        counts.bills === 1 ? "" : "s"
      } are archived. Rent and recurring bills charge again.`
    );
  } else {
    notes.push("Rent and recurring bills charge again in the new month.");
  }
  if (counts.pendingExpenses > 0) {
    notes.push(
      `${counts.pendingExpenses} expense${
        counts.pendingExpenses === 1 ? " is" : "s are"
      } still waiting for approval and stay in the new month.`
    );
  }
  return notes;
}

export interface CloseResult {
  group: Group;
  period: ClosedPeriod;
}

/**
 * Closes the month `at` falls in.
 *
 * `allCharges` is what the app is already showing — passing it in keeps this
 * function honest about closing exactly what the treasurer can see.
 */
export function closePeriod(
  group: Group,
  allCharges: Charge[],
  at: Date = new Date()
): CloseResult {
  const key = periodKey(at);
  const carryover: Settlement[] = calcSettlements(
    group.members,
    allCharges,
    group.payments,
    group.smartSettle
  );
  const counts = closableCounts(group);
  const totals: PeriodTotals = {
    spend: allCharges
      .filter((c) => c.type !== "carryover")
      .reduce((sum, c) => sum + c.amount, 0),
    expenses: counts.expenses,
    payments: counts.payments,
  };

  const period: ClosedPeriod = {
    id: uid(),
    period: key,
    closedAt: at.toISOString(),
    carryover,
    totals,
  };

  const archive = <T extends { archived?: boolean; period?: string }>(
    x: T
  ): T => (x.archived ? x : { ...x, archived: true, period: key });

  return {
    period,
    group: {
      ...group,
      // Undecided expenses and unanswered payments are still live business.
      expenses: group.expenses.map((e) =>
        e.status === "pending" ? e : archive(e)
      ),
      payments: (group.payments ?? []).map((p) =>
        p.status === "pending" ? p : archive(p)
      ),
      utilities: group.utilities.map((u) => (u.recurring ? u : archive(u))),
      subgroups: (group.subgroups ?? []).map((s) => ({
        ...s,
        bills: (s.bills ?? []).map((b) => (b.recurring ? b : archive(b))),
      })),
      periods: [...(group.periods ?? []), period],
    },
  };
}

/**
 * Drops anything a past close swept up, leaving what this month is working
 * with. Backend loads exclude archived rows already; this keeps the local copy
 * (and sandbox mode, which has no server to filter for it) in agreement.
 */
export function stillOpen<T extends { archived?: boolean }>(
  items: T[] | undefined
): T[] {
  return (items ?? []).filter((x) => !x.archived);
}

/** What a given closed month swept up, for the archive view. */
export function archivedIn<T extends { archived?: boolean; period?: string }>(
  items: T[] | undefined,
  period: string
): T[] {
  return (items ?? []).filter((x) => x.archived && x.period === period);
}

/**
 * A page of an in-memory list, shaped like the paged reads the backend does.
 * Sandbox mode has no server to ask, but the archive should behave the same.
 */
export function pageOf<T>(items: T[], offset: number, limit: number): Page<T> {
  return {
    items: items.slice(offset, offset + limit),
    hasMore: items.length > offset + limit,
  };
}
